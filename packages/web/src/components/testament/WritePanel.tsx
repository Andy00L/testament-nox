"use client";

import { ExternalLink } from "@appica/icons-react";
import { AnimatePresence, motion } from "motion/react";

import {
  BPS_DENOMINATOR,
  SLOT_COUNT,
  packBequests,
  testamentRegistryAbi,
} from "@testament/shared";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, isAddress, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";

import { SealPress } from "@/components/testament/SealPress";
import { StepTrack, type StepState } from "@/components/testament/StepTrack";
import { Key } from "@/components/ui/Key";
import { SafeMark } from "@/components/ui/SafeMark";
import { TextField } from "@/components/ui/TextField";
import { useHeirAddressKinds } from "@/lib/heir-check";
import {
  DEFAULT_ESTATE_ETH,
  createTestamentVault,
  fundTestamentVault,
  useTestamentVault,
  type TestamentVault,
} from "@/lib/safe-vault";
import { useCurtain } from "@/components/scene/CurtainStage";
import { useSound } from "@/components/scene/SoundProvider";
import { useTranslation } from "@/components/i18n/LanguageProvider";
import type { Copy } from "@/lib/i18n";
import { buildTransactionUrl, readDeployment } from "@/lib/chain";
import { describePackFailureIn, describeWriteFailure } from "@/lib/describe-failure";
import {
  authorizeWriterOnSafe,
  enableModuleOnSafe,
  readSafeConsentsPatiently,
  sealTestament,
} from "@/lib/testament-write";

/**
 * The ritual: name the heirs, set how long a silence is allowed to last, press the seal.
 *
 * Percentages are what the owner types; basis points are what the chain stores. The
 * conversion happens once, here, so no other file has to know about the factor of 100.
 */

/** Basis points in one percent. Shares are typed as whole percents. */
const BPS_PER_PERCENT = BPS_DENOMINATOR / 100;

/** Demo defaults, short enough to record a video against. Unit: seconds. */
const DEFAULT_INTERVAL_SECONDS = 90;
const DEFAULT_GRACE_SECONDS = 30;

/** The registry's own floor. sourceRef: TestamentRegistry.sol, MIN_INTERVAL. */
const MIN_INTERVAL_SECONDS = 60;

type BequestDraft = {
  id: string;
  beneficiary: string;
  sharePercent: string;
};

type SealStage = "idle" | "encrypting" | "signing" | "confirming" | "sealed";

/**
 * How far through the press each stage stands, so the recess fills with real staged progress
 * rather than an indeterminate spinner. Unit: 0 to 1.
 */
const SEAL_STAGE_PROGRESS: Record<SealStage, number> = {
  idle: 0,
  encrypting: 1 / 3,
  signing: 2 / 3,
  confirming: 1,
  sealed: 1,
};

let nextDraftId = 0;
function createDraft(): BequestDraft {
  nextDraftId += 1;
  return { id: `bequest-${nextDraftId}`, beneficiary: "", sharePercent: "" };
}

export function WritePanel() {
  const deployment = readDeployment();
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { rippleAt } = useCurtain();
  const { playChime } = useSound();
  const { copy } = useTranslation();

  const [drafts, setDrafts] = useState<BequestDraft[]>(() => [createDraft(), createDraft()]);
  const [intervalSeconds, setIntervalSeconds] = useState(String(DEFAULT_INTERVAL_SECONDS));
  const [graceSeconds, setGraceSeconds] = useState(String(DEFAULT_GRACE_SECONDS));

  /**
   * The vault the connected wallet owns, computed rather than typed.
   *
   * `typedSafeAddress` is null until the owner overrides the derived address, so the field
   * follows the wallet by derivation instead of being pushed into state by an effect that
   * would then fight anything typed into it. Null means "whatever my wallet's vault is";
   * a string means "this one, because I said so".
   */
  const { vault, refreshVault } = useTestamentVault(address);
  const [typedSafeAddress, setTypedSafeAddress] = useState<string | null>(null);
  const [isCreatingVault, setIsCreatingVault] = useState(false);
  const [isFundingVault, setIsFundingVault] = useState(false);
  const [estateEth, setEstateEth] = useState(DEFAULT_ESTATE_ETH);

  const derivedSafeAddress =
    vault.status === "absent" || vault.status === "present" ? vault.address : null;
  const safeAddress = typedSafeAddress ?? derivedSafeAddress ?? "";
  const isUsingDerivedVault = typedSafeAddress === null && derivedSafeAddress !== null;
  /**
   * A derived vault the chain says has no code cannot have granted anything, and asking it
   * would only produce a revert dressed up as an outage. The consent effect keys on this
   * boolean, so the read fires exactly once the vault comes into existence.
   */
  const isVaultKnownAbsent = isUsingDerivedVault && vault.status === "absent";

  const [stage, setStage] = useState<SealStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sealTransaction, setSealTransaction] = useState<string | null>(null);

  /**
   * The answer is cached against the address it was asked about, so a freshly typed Safe
   * reads as unknown by derivation rather than by resetting state inside an effect.
   *
   * `unreadable` is a third answer, not an absent one: an address that is not a Safe, or a node
   * that would not answer, is a different fact from a Safe that has granted nothing, and the
   * two used to be the same value.
   */
  type SafeCheck =
    | { safeAddress: string; unreadable: true }
    | {
        safeAddress: string;
        moduleEnabled: boolean;
        writer: Address | null;
        isMandateSpent: boolean;
      };
  const [safeCheck, setSafeCheck] = useState<SafeCheck | null>(null);
  /**
   * Bumped by the "check again" affordance. A failed read is an answer the reader can ask to
   * have re-asked, and a counter in the effect's dependencies is what re-asks it without the
   * effect having to know who wanted that.
   */
  const [safeCheckAttempt, setSafeCheckAttempt] = useState(0);
  const [isEnablingModule, setIsEnablingModule] = useState(false);
  const [isNamingWriter, setIsNamingWriter] = useState(false);
  const [consentTransaction, setConsentTransaction] = useState<string | null>(null);

  const addButtonRef = useRef<HTMLButtonElement>(null);

  // The freshly sealed testament's id, so the owner leaves with the door link in hand.
  const sealedIdQuery = useReadContract({
    address: deployment.isDeployed ? deployment.addresses.registry : undefined,
    abi: testamentRegistryAbi,
    functionName: "activeTestamentOf",
    args: address === undefined ? undefined : [address],
    query: { enabled: deployment.isDeployed && address !== undefined && stage === "sealed" },
  });
  const sealedId =
    typeof sealedIdQuery.data === "bigint" && sealedIdQuery.data !== 0n
      ? sealedIdQuery.data
      : null;

  const totalPercent = drafts.reduce(
    (runningTotal, draft) => runningTotal + (Number(draft.sharePercent) || 0),
    0,
  );

  const addBequest = useCallback(() => {
    if (drafts.length >= SLOT_COUNT) {
      return;
    }
    setDrafts((current) => [...current, createDraft()]);

    // The curtain answers the act: a local touch where the button is, not the sweeping
    // gust that means a heartbeat.
    const bounds = addButtonRef.current?.getBoundingClientRect();
    if (bounds !== undefined) {
      rippleAt(bounds.left + bounds.width / 2, bounds.top);
    }
    playChime(Math.min(1, drafts.length / SLOT_COUNT));
  }, [drafts.length, playChime, rippleAt]);

  const removeBequest = (draftId: string) => {
    setDrafts((current) => (current.length <= 1 ? current : current.filter((draft) => draft.id !== draftId)));
  };

  const updateDraft = (draftId: string, patch: Partial<BequestDraft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === draftId ? { ...draft, ...patch } : draft)),
    );
  };

  // Derived, not stored: an address the check has not answered for yet, or one whose read
  // failed, is simply unknown. Unknown never renders as "nothing granted".
  const safeAnswer =
    safeCheck !== null && safeCheck.safeAddress === safeAddress && !("unreadable" in safeCheck)
      ? safeCheck
      : null;
  // A vault known to be absent silences any cached "unreadable": before the shared boolean
  // existed, the consent probe fired at the codeless derived address, failed, and its outage
  // message buried the one hint that mattered, "this vault does not exist yet".
  const isSafeUnreadable =
    safeCheck !== null &&
    safeCheck.safeAddress === safeAddress &&
    "unreadable" in safeCheck &&
    !isVaultKnownAbsent;
  const isModuleEnabled = safeAnswer === null ? null : safeAnswer.moduleEnabled;
  /**
   * Being named is per wallet, not per Safe: a Safe that named someone else has a mandate,
   * just not this one, and the registry will refuse this wallet's will either way. A spent
   * mandate counts as not named, because one authorization buys one will: after a testament
   * executes, the hand has to be named again, and a step reading "done" here left the owner
   * with a seal saying "mandate spent" and nothing to press.
   */
  const isWriterNamed =
    safeAnswer === null || address === undefined
      ? null
      : safeAnswer.writer !== null &&
        safeAnswer.writer.toLowerCase() === address.toLowerCase() &&
        !safeAnswer.isMandateSpent;
  const isMandateSpent = safeAnswer !== null && safeAnswer.isMandateSpent;

  /**
   * External system: the Safe contract and the module.
   *
   * This runs when the address changes and never after a consent. A consent now returns the
   * state the chain confirmed for it, so writing that answer straight into `safeCheck` is both
   * faster and truer than firing a fresh read into the same replication lag the write helper
   * just spent ten seconds waiting out.
   *
   * A read that fails is recorded as a failure rather than as "nothing granted": those are
   * different facts, and conflating them is what made an unreachable node look like a Safe
   * that had consented to nothing.
   */
  useEffect(() => {
    if (!deployment.isDeployed || publicClient === undefined || !isAddress(safeAddress)) {
      return;
    }
    if (isVaultKnownAbsent) {
      return;
    }
    let isCurrent = true;
    const checkedAddress = safeAddress as Address;
    void readSafeConsentsPatiently({
      publicClient,
      registryAddress: deployment.addresses.registry,
      safeAddress: checkedAddress,
      moduleAddress: deployment.addresses.module,
    }).then((read) => {
      if (!isCurrent) {
        return;
      }
      setSafeCheck(
        read.ok
          ? { safeAddress: checkedAddress, ...read.consents }
          : { safeAddress: checkedAddress, unreadable: true },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [deployment, publicClient, safeAddress, safeCheckAttempt, isVaultKnownAbsent]);

  /**
   * The way out of a failed read: ask again, everywhere at once. The vault's own reads and
   * the consent reads fail together when a node is down, so one gesture retries both rather
   * than making the reader find two buttons for one outage.
   */
  const retryChainReads = () => {
    refreshVault();
    setSafeCheck(null);
    setSafeCheckAttempt((attempt) => attempt + 1);
  };

  const validation = validateDraft({ drafts, safeAddress, intervalSeconds, graceSeconds, copy });

  /**
   * Whether each named heir is a plain wallet. A contract that refuses ETH does not break a
   * will (the module records the refusal and anyone can retry), so this warns where the
   * address is typed rather than blocking the seal.
   */
  const heirKinds = useHeirAddressKinds(drafts.map((draft) => draft.beneficiary));

  /**
   * The nearest thing standing between this form and a seal the registry would accept, in
   * the order the chain enforces: a vault that exists, a Safe that can be read, then the two
   * consents. `null` alone arms the seal.
   *
   * Unknown blocks too. The seal that reverted on-chain went out while both consents read as
   * "not answered yet", because only a confirmed "no" used to refuse: an unknown consent is a
   * transaction the registry may refuse, and this product does not sign hopes.
   */
  const sealBlock: string | null = (() => {
    if (isUsingDerivedVault && vault.status === "absent") {
      return copy.write.sealNeedsVault;
    }
    if (isUsingDerivedVault && vault.status === "unreadable") {
      return copy.write.vaultUnreadable;
    }
    if (isSafeUnreadable) {
      return copy.write.safeHintUnreadable;
    }
    if (isModuleEnabled === null || isWriterNamed === null) {
      return isAddress(safeAddress) ? copy.write.sealChecking : null;
    }
    if (!isModuleEnabled) {
      return copy.write.sealNeedsModule;
    }
    if (isWriterNamed) {
      return null;
    }
    return isMandateSpent ? copy.errors.sealAuthorizationUsed : copy.write.sealNeedsWriter;
  })();

  const handleSeal = async () => {
    if (!deployment.isDeployed || walletClient === undefined || publicClient === undefined) {
      setErrorMessage(copy.write.connectFirst);
      return;
    }
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }
    if (sealBlock !== null) {
      setErrorMessage(sealBlock);
      return;
    }

    setErrorMessage(null);
    setStage("encrypting");

    const result = await sealTestament({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      moduleAddress: deployment.addresses.module,
      safeAddress: validation.safeAddress,
      bequests: validation.bequests,
      intervalSeconds: validation.intervalSeconds,
      graceSeconds: validation.graceSeconds,
      onProgress: setStage,
    });

    if (!result.ok) {
      setStage("idle");
      setErrorMessage(describeWriteFailure(result.failure, copy));
      if (result.failure.reason === "reverted") {
        // The receipt exists even though nothing was written: hand over the Etherscan link,
        // because "the chain refused" is a claim the reader must be able to check.
        setSealTransaction(result.failure.transactionHash);
      }
      return;
    }

    setStage("sealed");
    setSealTransaction(result.value);
    playChime(1);
  };

  const handleEnableModule = async () => {
    if (!deployment.isDeployed || walletClient === undefined || publicClient === undefined) {
      return;
    }
    if (!isAddress(safeAddress)) {
      return;
    }

    const checkedSafeAddress = safeAddress as Address;
    setIsEnablingModule(true);
    setErrorMessage(null);

    const result = await enableModuleOnSafe({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      safeAddress: checkedSafeAddress,
      moduleAddress: deployment.addresses.module,
    });

    setIsEnablingModule(false);
    if (!result.ok) {
      setErrorMessage(describeWriteFailure(result.failure, copy));
      if (result.failure.reason === "reverted") {
        setConsentTransaction(result.failure.transactionHash);
      }
      return;
    }
    // The helper waited until the chain reported the consent, so its answer is written down
    // as-is: firing a fresh read here would race the very replication lag it just outwaited.
    setSafeCheck({ safeAddress: checkedSafeAddress, ...result.value.consents });
    setConsentTransaction(result.value.transactionHash);
  };

  const handleNameWriter = async () => {
    if (!deployment.isDeployed || walletClient === undefined || publicClient === undefined) {
      return;
    }
    if (!isAddress(safeAddress)) {
      return;
    }

    const checkedSafeAddress = safeAddress as Address;
    setIsNamingWriter(true);
    setErrorMessage(null);

    const result = await authorizeWriterOnSafe({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      safeAddress: checkedSafeAddress,
      moduleAddress: deployment.addresses.module,
    });

    setIsNamingWriter(false);
    if (!result.ok) {
      setErrorMessage(describeWriteFailure(result.failure, copy));
      if (result.failure.reason === "reverted") {
        setConsentTransaction(result.failure.transactionHash);
      }
      return;
    }
    setSafeCheck({ safeAddress: checkedSafeAddress, ...result.value.consents });
    setConsentTransaction(result.value.transactionHash);
  };

  const handleCreateVault = async () => {
    if (walletClient === undefined || publicClient === undefined || address === undefined) {
      setErrorMessage(copy.write.connectFirst);
      return;
    }

    setIsCreatingVault(true);
    setErrorMessage(null);

    const result = await createTestamentVault({ walletClient, publicClient, ownerAddress: address });

    setIsCreatingVault(false);
    if (!result.ok) {
      setErrorMessage(describeWriteFailure(result.failure, copy));
      if (result.failure.reason === "reverted") {
        setConsentTransaction(result.failure.transactionHash);
      }
      return;
    }
    // The address was already on screen (that is the point of deriving it), so the only thing
    // that changed is that it now has code. Re-reading the chain is what makes the panel move
    // on to funding.
    refreshVault();
    setConsentTransaction(result.value.transactionHash);
  };

  const handleFundVault = async () => {
    if (walletClient === undefined || publicClient === undefined) {
      setErrorMessage(copy.write.connectFirst);
      return;
    }
    if (!isAddress(safeAddress)) {
      return;
    }

    setIsFundingVault(true);
    setErrorMessage(null);

    const result = await fundTestamentVault({
      walletClient,
      publicClient,
      safeAddress: safeAddress as Address,
      amountEth: estateEth,
    });

    setIsFundingVault(false);
    if (!result.ok) {
      setErrorMessage(describeWriteFailure(result.failure, copy));
      if (result.failure.reason === "reverted") {
        setConsentTransaction(result.failure.transactionHash);
      }
      return;
    }
    refreshVault();
    setConsentTransaction(result.value);
  };

  /**
   * One consent at a time, in the order the Safe grants them. Declared after its handlers
   * so it reads them rather than the temporal dead zone.
   */
  const passageState: StepState = isEnablingModule
    ? "running"
    : isModuleEnabled === null
      ? "unreached"
      : isModuleEnabled
        ? "done"
        : "ready";

  /**
   * The hand cannot be named before the passage is open, so until it is, slot two reads as
   * the step it is rather than offering an action the Safe would refuse.
   */
  const handState: StepState = isNamingWriter
    ? "running"
    : isWriterNamed === true
      ? "done"
      : isModuleEnabled !== true || isWriterNamed === null
        ? "unreached"
        : "ready";

  const isBusy = stage === "encrypting" || stage === "signing" || stage === "confirming";

  /**
   * The one act the chain is waiting on, so exactly one control on this screen beckons.
   * The order is the order the chain enforces: a vault to create, an estate to send, then
   * the two consents. The seal is deliberately absent from this list; when its turn comes
   * it wakes on its own, and two things calling at once is nobody being called.
   */
  const nextAct: "create" | "fund" | "passage" | "hand" | null = (() => {
    if (isUsingDerivedVault && vault.status === "absent") {
      return "create";
    }
    if (isUsingDerivedVault && vault.status === "present" && vault.estateWei === 0n) {
      return "fund";
    }
    if (passageState === "ready") {
      return "passage";
    }
    if (handState === "ready") {
      return "hand";
    }
    return null;
  })();

  /** Both unreadable states are one outage to the reader, so they share one way out. */
  const needsRecheck = isSafeUnreadable || (isUsingDerivedVault && vault.status === "unreadable");

  return (
    <div className="flex flex-col gap-8">
      {/*
        Two halves of one sheet, side by side the way the reference lays them out, so the
        whole ritual fits a single viewport: who inherits on the left, the vault and its
        silence on the right, the seal at the bottom right where a document is signed.
        The divider is the mat showing through a cut in the paper, not a drawn rule.
      */}
      <div className="grid gap-8 lg:grid-cols-[1fr_2px_1fr] lg:gap-x-9">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="type-display-lg">{copy.write.heirsTitle}</h2>
            <p className="type-body text-ink-muted">{copy.write.heirsLede}</p>
          </div>

          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
            {drafts.map((draft, draftIndex) => (
              <motion.li
                key={draft.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="flex-1">
                  <TextField
                    label={copy.write.heirLabel(draftIndex + 1)}
                    value={draft.beneficiary}
                    onChange={(event) => updateDraft(draft.id, { beneficiary: event.target.value })}
                    placeholder="0x…"
                    spellCheck={false}
                    autoComplete="off"
                    error={
                      draft.beneficiary !== "" && !isAddress(draft.beneficiary)
                        ? copy.write.invalidAddress
                        : null
                    }
                    hint={
                      heirKinds.get(draft.beneficiary.toLowerCase()) === "contract"
                        ? copy.write.heirIsContract
                        : undefined
                    }
                  />
                </div>
                <div className="w-full sm:w-28">
                  <TextField
                    label={copy.write.shareLabel}
                    value={draft.sharePercent}
                    onChange={(event) =>
                      updateDraft(draft.id, { sharePercent: event.target.value.replace(/[^\d]/g, "") })
                    }
                    placeholder="0"
                    inputMode="numeric"
                    suffix="%"
                  />
                </div>
                {drafts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeBequest(draft.id)}
                    className="type-small self-start text-ink-faint transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink sm:mt-8"
                  >
                    {copy.write.remove}
                  </button>
                ) : null}
              </motion.li>
            ))}
            </AnimatePresence>
          </ul>

          <Key
            ref={addButtonRef}
            onClick={addBequest}
            disabled={drafts.length >= SLOT_COUNT}
            className="type-small min-h-11 w-full px-4"
          >
            {copy.write.addHeir}
          </Key>

          {/*
            The allocation meter: the same tonal-fill-in-a-well language as the heartbeat
            charge. Full track, stable square edges, clamped, never a saturated bar.
          */}
          <div className="mt-auto flex items-center gap-4 pt-1">
            <div aria-hidden="true" className="panel-well relative h-2 flex-1 overflow-hidden">
              <span
                className="absolute inset-y-0 left-0 bg-bronze-sunk"
                style={{
                  width: `${Math.min(100, totalPercent)}%`,
                  transition: "width var(--dur-standard) var(--ease-standard)",
                }}
              />
            </div>
            <p
              key={totalPercent === 100 ? "complete" : "counting"}
              className={`type-small type-numeric shrink-0 ${totalPercent === 100 ? "anim-count-pop" : ""}`}
              style={{ color: totalPercent === 100 ? "var(--color-bronze-deep)" : "var(--color-ink-muted)" }}
            >
              {copy.write.allocated(totalPercent)}
            </p>
          </div>
        </section>

        <span aria-hidden="true" className="hidden self-stretch bg-field lg:block" />

        <section className="flex flex-col gap-4">
          <h2 className="type-display-lg">{copy.write.vaultTitle}</h2>

          {/*
            The vault names itself. `createProxyWithNonce` deploys with CREATE2, so a wallet's
            Safe address is arithmetic rather than a lookup, and the field can be filled the
            moment a wallet connects, before the Safe exists and with no backend to ask. The
            mark beside the label says whose object this is; the field stays editable because
            an owner who already has a Safe elsewhere should not be made to abandon it.
          */}
          <div className="flex flex-col gap-1.5">
            <TextField
              label={copy.write.safeLabel}
              labelMark={isUsingDerivedVault ? <SafeMark size={14} /> : undefined}
              value={safeAddress}
              onChange={(event) => setTypedSafeAddress(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              error={safeAddress !== "" && !isAddress(safeAddress) ? copy.write.invalidAddress : null}
              hint={resolveVaultHint({
                vault,
                safeAddress,
                isUsingDerivedVault,
                isSafeUnreadable,
                isModuleEnabled,
                isWriterNamed,
                isMandateSpent,
                copy,
              })}
            />

            {/*
              The field's own furniture, on one line: what the vault holds, and the way out to
              a different Safe. Both are facts about the address above them and nothing else,
              which is why they sit tight under it and apart from the consents. Testing read
              the previous stack (estate line, switch link, consent keys, all at one rhythm)
              as one unordered pile.
            */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="type-small type-numeric text-ink-muted">
                {isUsingDerivedVault && vault.status === "present" && vault.estateWei > 0n
                  ? copy.write.vaultEstate(formatEther(vault.estateWei))
                  : ""}
              </p>
              <span className="flex items-baseline gap-5">
                {needsRecheck ? (
                  <button
                    type="button"
                    onClick={retryChainReads}
                    className="type-small text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
                  >
                    {copy.write.checkAgain}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    isUsingDerivedVault ? setTypedSafeAddress("") : setTypedSafeAddress(null)
                  }
                  className="type-small text-ink-faint transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
                >
                  {isUsingDerivedVault ? copy.write.vaultUseAnother : copy.write.vaultUseMine}
                </button>
              </span>
            </div>
          </div>

          <VaultActions
            vault={vault}
            isUsingDerivedVault={isUsingDerivedVault}
            isCreating={isCreatingVault}
            isFunding={isFundingVault}
            estateEth={estateEth}
            onEstateEthChange={setEstateEth}
            onCreate={() => void handleCreateVault()}
            onFund={() => void handleFundVault()}
            beckonCreate={nextAct === "create"}
            beckonFund={nextAct === "fund"}
            copy={copy}
          />

          {/*
            The Safe's two consents, asked for where the Safe is named and nowhere else. Both
            are on screen from the first paint, and the group carries its name in ink: the two
            keys used to sit unlabelled under the vault furniture, and testing could not tell
            which of the surrounding lines they belonged to.
          */}
          <div className="flex flex-col gap-2">
            <p aria-hidden="true" className="type-label">
              {copy.write.consentTitle}
            </p>
            <StepTrack
              title={copy.write.consentTitle}
              first={{
                state: passageState,
                label: copy.write.stepPassage,
                runningLabel: copy.write.stepPassageBusy,
                doneLabel: copy.write.stepPassageDone,
                onRun: () => void handleEnableModule(),
                beckons: nextAct === "passage",
              }}
              second={{
                state: handState,
                label: copy.write.stepHand,
                runningLabel: copy.write.stepHandBusy,
                doneLabel: copy.write.stepHandDone,
                onRun: () => void handleNameWriter(),
                beckons: nextAct === "hand",
              }}
            />
          </div>

          {consentTransaction !== null ? (
            <a
              href={buildTransactionUrl(consentTransaction)}
              target="_blank"
              rel="noreferrer"
              className="type-small type-numeric group/tx inline-flex w-fit items-center gap-1.5 text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
            >
              {copy.write.viewTransaction}
              <ExternalLink
                size={13}
                strokeWidth={1.5}
                className="transition-transform duration-(--duration-fast) ease-(--ease-smooth-out) group-hover/tx:-translate-y-0.5 group-hover/tx:translate-x-0.5"
              />
            </a>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <TextField
                label={copy.write.intervalLabel}
                value={intervalSeconds}
                onChange={(event) => setIntervalSeconds(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                suffix="s"
                hint={copy.write.intervalHint(MIN_INTERVAL_SECONDS)}
              />
            </div>
            <div className="flex-1">
              <TextField
                label={copy.write.graceLabel}
                value={graceSeconds}
                onChange={(event) => setGraceSeconds(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                suffix="s"
                hint={copy.write.graceHint}
              />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-1">
            <SealPress
              onPress={() => void handleSeal()}
              isStamped={stage === "sealed"}
              isBusy={isBusy}
              busyLabel={resolveBusyLabel(stage, copy)}
              busyProgress={SEAL_STAGE_PROGRESS[stage]}
              disabledReason={validation.ok ? sealBlock : validation.message}
            />

            {errorMessage !== null ? (
              <p key={errorMessage} role="alert" className="anim-shake type-small text-cinnabar">
                {errorMessage}
              </p>
            ) : null}

            {sealTransaction !== null ? (
              <a
                href={buildTransactionUrl(sealTransaction)}
                target="_blank"
                rel="noreferrer"
                className="type-small type-numeric text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
              >
                {copy.write.viewTransaction}
              </a>
            ) : null}
          </div>
        </section>
      </div>

      {stage === "sealed" ? (
        <section className="flex flex-col gap-4 border-0 pt-2">
          <h2 className="type-display-lg">{copy.write.doorTitle}</h2>
          <p className="type-body text-ink-muted">{copy.write.doorLede}</p>
          {sealedId !== null ? (
            <p className="type-small text-ink-muted">
              {copy.write.doorLinkLabel}{" "}
              <Link
                href={`/porte?id=${sealedId}`}
                className="type-numeric text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-bronze-deep"
              >
                /porte?id={String(sealedId)}
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/**
 * The line under the vault field.
 *
 * One sentence, and it always names the nearest thing standing between this wallet and a will
 * that can pay: no wallet, no vault yet, an empty vault, then the two consents. The order is
 * the order the chain enforces, so the hint never asks for step three while step one is open.
 */
function resolveVaultHint({
  vault,
  safeAddress,
  isUsingDerivedVault,
  isSafeUnreadable,
  isModuleEnabled,
  isWriterNamed,
  isMandateSpent,
  copy,
}: {
  vault: TestamentVault;
  safeAddress: string;
  isUsingDerivedVault: boolean;
  isSafeUnreadable: boolean;
  isModuleEnabled: boolean | null;
  isWriterNamed: boolean | null;
  isMandateSpent: boolean;
  copy: Copy;
}): string {
  // The vault's own existence comes first: a derived vault with no code yet has one honest
  // sentence, and a consent read failing against that same empty address must never bury it.
  if (isUsingDerivedVault) {
    if (vault.status === "unreadable") {
      return copy.write.vaultUnreadable;
    }
    if (vault.status === "absent") {
      return copy.write.vaultAbsent;
    }
  }
  // A failed read is its own answer. Without this line, an address that is not a Safe (or a
  // node that would not respond) fell through to "your vault, derived from this wallet".
  if (isSafeUnreadable) {
    return copy.write.safeHintUnreadable;
  }
  if (isUsingDerivedVault && vault.status === "present" && vault.estateWei === 0n) {
    return copy.write.vaultEmpty;
  }
  // The wallet only has to be named while the field is empty. Once a Safe is in it, the field
  // has an answer, and telling its author to connect a wallet contradicts what they can see.
  if (safeAddress === "") {
    if (vault.status === "no-owner") {
      return copy.write.vaultConnect;
    }
    if (vault.status === "reading") {
      return copy.write.vaultReading;
    }
  }

  if (isModuleEnabled === null) {
    return isUsingDerivedVault ? copy.write.vaultDerived : copy.write.safeHintDefault;
  }
  if (!isModuleEnabled) {
    return copy.write.safeHintModuleMissing;
  }
  if (isWriterNamed === true) {
    return copy.write.safeHintReady;
  }
  // A spent mandate is not a missing one: the hand was named, its will has been written and
  // settled, and the Safe simply has to say yes again before another can be drawn on it.
  return isMandateSpent ? copy.write.safeHintMandateSpent : copy.write.safeHintWriterMissing;
}

/**
 * What the vault still needs, offered where the vault is named.
 *
 * Deliberately not a step in the consent track above it. Most owners arrive with a Safe and
 * see nothing here at all; putting "create" and "fund" in the same ordered pair would make a
 * two-act ritual look like a four-act one for everybody. So this block renders only what is
 * actually missing, and disappears the moment nothing is.
 */
function VaultActions({
  vault,
  isUsingDerivedVault,
  isCreating,
  isFunding,
  estateEth,
  onEstateEthChange,
  onCreate,
  onFund,
  beckonCreate,
  beckonFund,
  copy,
}: {
  vault: TestamentVault;
  isUsingDerivedVault: boolean;
  isCreating: boolean;
  isFunding: boolean;
  estateEth: string;
  onEstateEthChange: (value: string) => void;
  onCreate: () => void;
  onFund: () => void;
  beckonCreate: boolean;
  beckonFund: boolean;
  copy: Copy;
}) {
  const needsCreating = isUsingDerivedVault && vault.status === "absent";
  const needsFunding = isUsingDerivedVault && vault.status === "present" && vault.estateWei === 0n;
  if (!needsCreating && !needsFunding) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {needsCreating ? (
        <Key
          onClick={onCreate}
          disabled={isCreating}
          beckons={beckonCreate && !isCreating}
          className="type-small min-h-11 w-full px-4"
        >
          {isCreating ? copy.write.vaultCreating : copy.write.vaultCreate}
        </Key>
      ) : null}

      {needsFunding ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="sm:w-40">
            <TextField
              label={copy.write.vaultFundLabel}
              value={estateEth}
              onChange={(event) => onEstateEthChange(event.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              suffix="ETH"
            />
          </div>
          <Key
            onClick={onFund}
            disabled={isFunding}
            beckons={beckonFund && !isFunding}
            className="type-small min-h-11 px-4 sm:mt-[1.6rem] sm:shrink-0"
          >
            {isFunding ? copy.write.vaultFunding : copy.write.vaultFund}
          </Key>
        </div>
      ) : null}
    </div>
  );
}

type Validation =
  | {
      ok: true;
      bequests: { beneficiary: Address; shareBps: number }[];
      safeAddress: Address;
      intervalSeconds: number;
      graceSeconds: number;
    }
  | { ok: false; message: string };

function validateDraft({
  drafts,
  safeAddress,
  intervalSeconds,
  graceSeconds,
  copy,
}: {
  drafts: readonly BequestDraft[];
  safeAddress: string;
  intervalSeconds: string;
  graceSeconds: string;
  copy: Copy;
}): Validation {
  if (!isAddress(safeAddress)) {
    return { ok: false, message: copy.errors.safeAddressRequired };
  }

  const parsedInterval = Number(intervalSeconds);
  if (!Number.isInteger(parsedInterval) || parsedInterval < MIN_INTERVAL_SECONDS) {
    return { ok: false, message: copy.errors.intervalTooShort(MIN_INTERVAL_SECONDS) };
  }

  const parsedGrace = Number(graceSeconds);
  if (!Number.isInteger(parsedGrace) || parsedGrace < 0) {
    return { ok: false, message: copy.errors.graceInvalid };
  }

  const bequests = drafts
    .filter((draft) => draft.beneficiary !== "" || draft.sharePercent !== "")
    .map((draft) => ({
      beneficiary: draft.beneficiary as Address,
      shareBps: (Number(draft.sharePercent) || 0) * BPS_PER_PERCENT,
    }));

  // The shared packer is the single authority on what a valid will is, so the form asks it
  // rather than re-deriving the rules and drifting from the contract.
  const packed = packBequests(bequests);
  if (!packed.ok) {
    return { ok: false, message: describePackFailureIn(packed.failure, copy) };
  }

  return {
    ok: true,
    bequests,
    safeAddress: safeAddress as Address,
    intervalSeconds: parsedInterval,
    graceSeconds: parsedGrace,
  };
}

function resolveBusyLabel(stage: SealStage, copy: Copy): string {
  switch (stage) {
    case "encrypting":
      return copy.seal.encrypting;
    case "signing":
      return copy.seal.signing;
    case "confirming":
      return copy.seal.confirming;
    default:
      return "";
  }
}
