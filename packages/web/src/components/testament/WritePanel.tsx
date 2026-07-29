"use client";

import { BPS_DENOMINATOR, SLOT_COUNT, describePackFailure, packBequests } from "@testament/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

import { SealPress } from "@/components/testament/SealPress";
import { TextField } from "@/components/ui/TextField";
import { useCurtain } from "@/components/scene/CurtainStage";
import { useSound } from "@/components/scene/SoundProvider";
import { useTranslation } from "@/components/i18n/LanguageProvider";
import type { Copy } from "@/lib/i18n";
import { buildTransactionUrl, readDeployment } from "@/lib/chain";
import {
  describeWriteFailure,
  enableModuleOnSafe,
  readModuleEnabled,
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

let nextDraftId = 0;
function createDraft(): BequestDraft {
  nextDraftId += 1;
  return { id: `bequest-${nextDraftId}`, beneficiary: "", sharePercent: "" };
}

export function WritePanel() {
  const deployment = readDeployment();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { rippleAt } = useCurtain();
  const { playChime } = useSound();
  const { copy } = useTranslation();

  const [drafts, setDrafts] = useState<BequestDraft[]>(() => [createDraft(), createDraft()]);
  const [safeAddress, setSafeAddress] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(String(DEFAULT_INTERVAL_SECONDS));
  const [graceSeconds, setGraceSeconds] = useState(String(DEFAULT_GRACE_SECONDS));

  const [stage, setStage] = useState<SealStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sealTransaction, setSealTransaction] = useState<string | null>(null);

  /**
   * The answer is cached against the address it was asked about, so a freshly typed Safe
   * reads as unknown by derivation rather than by resetting state inside an effect.
   */
  const [moduleCheck, setModuleCheck] = useState<{ safeAddress: string; enabled: boolean } | null>(
    null,
  );
  const [isEnablingModule, setIsEnablingModule] = useState(false);
  const [moduleTransaction, setModuleTransaction] = useState<string | null>(null);

  const addButtonRef = useRef<HTMLButtonElement>(null);

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

  // Derived, not stored: an address the check has not answered for yet is simply unknown.
  const isModuleEnabled =
    moduleCheck !== null && moduleCheck.safeAddress === safeAddress ? moduleCheck.enabled : null;

  // External system: the Safe contract. Whether the module is already enabled is chain
  // state that has to be fetched once the address is typed.
  useEffect(() => {
    if (!deployment.isDeployed || publicClient === undefined || !isAddress(safeAddress)) {
      return;
    }
    let isCurrent = true;
    const checkedAddress = safeAddress;
    void readModuleEnabled({
      publicClient,
      safeAddress: checkedAddress as Address,
      moduleAddress: deployment.addresses.module,
    }).then((enabled) => {
      if (isCurrent) {
        setModuleCheck({ safeAddress: checkedAddress, enabled });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [deployment, publicClient, safeAddress, moduleTransaction]);

  const validation = validateDraft({ drafts, safeAddress, intervalSeconds, graceSeconds });

  const handleSeal = async () => {
    if (!deployment.isDeployed || walletClient === undefined || publicClient === undefined) {
      setErrorMessage(copy.write.connectFirst);
      return;
    }
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    setErrorMessage(null);
    setStage("encrypting");

    const result = await sealTestament({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      safeAddress: validation.safeAddress,
      bequests: validation.bequests,
      intervalSeconds: validation.intervalSeconds,
      graceSeconds: validation.graceSeconds,
      onProgress: setStage,
    });

    if (!result.ok) {
      setStage("idle");
      setErrorMessage(describeWriteFailure(result.failure));
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

    setIsEnablingModule(true);
    setErrorMessage(null);

    const result = await enableModuleOnSafe({
      walletClient,
      publicClient,
      safeAddress: safeAddress as Address,
      moduleAddress: deployment.addresses.module,
    });

    setIsEnablingModule(false);
    if (!result.ok) {
      setErrorMessage(describeWriteFailure(result.failure));
      return;
    }
    setModuleTransaction(result.value);
  };

  const isBusy = stage === "encrypting" || stage === "signing" || stage === "confirming";

  return (
    <div className="flex flex-col gap-8">
      {/*
        Two halves of one sheet, side by side the way the reference lays them out, so the
        whole ritual fits a single viewport: who inherits on the left, the vault and its
        silence on the right, the seal at the bottom right where a document is signed.
        The divider is the mat showing through a cut in the paper, not a drawn rule.
      */}
      <div className="grid gap-10 lg:grid-cols-[1fr_2px_1fr] lg:gap-x-9">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="type-display-lg">{copy.write.heirsTitle}</h2>
            <p className="type-body text-ink-muted">{copy.write.heirsLede}</p>
          </div>

          <ul className="flex flex-col gap-3">
            {drafts.map((draft, draftIndex) => (
              <li key={draft.id} className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
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
              </li>
            ))}
          </ul>

          <button
            ref={addButtonRef}
            type="button"
            onClick={addBequest}
            disabled={drafts.length >= SLOT_COUNT}
            className="panel-well type-small min-h-11 w-full px-4 text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-bronze-deep disabled:text-ink-faint"
          >
            {copy.write.addHeir}
          </button>

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
              className="type-small type-numeric shrink-0"
              style={{ color: totalPercent === 100 ? "var(--color-bronze-deep)" : "var(--color-ink-muted)" }}
            >
              {copy.write.allocated(totalPercent)}
            </p>
          </div>
        </section>

        <span aria-hidden="true" className="hidden self-stretch bg-field lg:block" />

        <section className="flex flex-col gap-4">
          <h2 className="type-display-lg">{copy.write.vaultTitle}</h2>
          <TextField
            label={copy.write.safeLabel}
            value={safeAddress}
            onChange={(event) => setSafeAddress(event.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            error={safeAddress !== "" && !isAddress(safeAddress) ? copy.write.invalidAddress : null}
            hint={
              isModuleEnabled === true
                ? copy.write.safeHintEnabled
                : isModuleEnabled === false
                  ? copy.write.safeHintDisabled
                  : copy.write.safeHintDefault
            }
          />
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
              disabledReason={validation.ok ? null : validation.message}
            />

            {errorMessage !== null ? (
              <p role="alert" className="type-small text-cinnabar">
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
          <h2 className="type-display-lg">{copy.write.openPassageTitle}</h2>
          <p className="type-body text-ink-muted">{copy.write.openPassageLede}</p>
          {isModuleEnabled === true ? (
            <p className="type-small text-bronze-deep">{copy.write.moduleEnabled}</p>
          ) : (
            <button
              type="button"
              onClick={() => void handleEnableModule()}
              disabled={isEnablingModule}
              className="panel-well type-small min-h-11 w-fit px-5 py-3 text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-bronze-deep disabled:text-ink-faint"
            >
              {isEnablingModule ? copy.write.enablingModule : copy.write.enableModule}
            </button>
          )}
          {moduleTransaction !== null ? (
            <a
              href={buildTransactionUrl(moduleTransaction)}
              target="_blank"
              rel="noreferrer"
              className="type-small type-numeric text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
            >
              {copy.write.viewTransaction}
            </a>
          ) : null}
        </section>
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
}: {
  drafts: readonly BequestDraft[];
  safeAddress: string;
  intervalSeconds: string;
  graceSeconds: string;
}): Validation {
  if (!isAddress(safeAddress)) {
    return { ok: false, message: "Renseignez l'adresse du Safe." };
  }

  const parsedInterval = Number(intervalSeconds);
  if (!Number.isInteger(parsedInterval) || parsedInterval < MIN_INTERVAL_SECONDS) {
    return { ok: false, message: `L'intervalle doit valoir au moins ${MIN_INTERVAL_SECONDS} secondes.` };
  }

  const parsedGrace = Number(graceSeconds);
  if (!Number.isInteger(parsedGrace) || parsedGrace < 0) {
    return { ok: false, message: "Le délai de grâce doit être un nombre de secondes." };
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
    return { ok: false, message: describePackFailure(packed.failure) };
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
