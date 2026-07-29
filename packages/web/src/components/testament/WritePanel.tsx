"use client";

import { BPS_DENOMINATOR, SLOT_COUNT, describePackFailure, packBequests } from "@testament/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

import { SealPress } from "@/components/testament/SealPress";
import { TextField } from "@/components/ui/TextField";
import { useCurtain } from "@/components/scene/CurtainStage";
import { useSound } from "@/components/scene/SoundProvider";
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
      setErrorMessage("Connectez un portefeuille sur Sepolia.");
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
    <div className="flex flex-col gap-14">
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="type-display-lg">Les héritiers</h2>
          <p className="type-body text-ink-muted">
            Huit lignes au maximum. Les lignes que vous ne remplissez pas sont chiffrées comme
            les autres, si bien que la chaîne ne révèle pas combien de personnes vous avez
            nommées.
          </p>
        </div>

        <ul className="flex flex-col gap-5">
          {drafts.map((draft, draftIndex) => (
            <li key={draft.id} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="flex-1">
                <TextField
                  label={`Héritier ${draftIndex + 1}`}
                  value={draft.beneficiary}
                  onChange={(event) => updateDraft(draft.id, { beneficiary: event.target.value })}
                  placeholder="0x…"
                  spellCheck={false}
                  autoComplete="off"
                  error={
                    draft.beneficiary !== "" && !isAddress(draft.beneficiary)
                      ? "Adresse invalide."
                      : null
                  }
                />
              </div>
              <div className="w-full sm:w-36">
                <TextField
                  label="Part"
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
                  className="type-small mt-0 self-start text-ink-faint transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink sm:mt-8"
                >
                  Retirer
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <button
            ref={addButtonRef}
            type="button"
            onClick={addBequest}
            disabled={drafts.length >= SLOT_COUNT}
            className="type-small text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-brass disabled:text-ink-faint"
          >
            Ajouter un héritier
          </button>
          <p
            className="type-small type-numeric"
            style={{ color: totalPercent === 100 ? "var(--color-brass)" : "var(--color-ink-muted)" }}
          >
            {totalPercent} % attribués sur 100
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="type-display-lg">Le coffre et le silence</h2>
        <TextField
          label="Adresse du Safe"
          value={safeAddress}
          onChange={(event) => setSafeAddress(event.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          error={safeAddress !== "" && !isAddress(safeAddress) ? "Adresse invalide." : null}
          hint={
            isModuleEnabled === true
              ? "Le module est déjà activé sur ce Safe."
              : isModuleEnabled === false
                ? "Le module n'est pas encore activé. Deuxième étape, après le sceau."
                : "Le Safe qui paiera. Il reste intact : rien n'y est modifié."
          }
        />
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex-1">
            <TextField
              label="Intervalle"
              value={intervalSeconds}
              onChange={(event) => setIntervalSeconds(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              suffix="s"
              hint={`Minimum ${MIN_INTERVAL_SECONDS} s. Le temps entre deux signes de vie.`}
            />
          </div>
          <div className="flex-1">
            <TextField
              label="Délai de grâce"
              value={graceSeconds}
              onChange={(event) => setGraceSeconds(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              suffix="s"
              hint="Le silence supplémentaire toléré avant l'ouverture."
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6 pt-6">
        <SealPress
          onPress={() => void handleSeal()}
          isStamped={stage === "sealed"}
          isBusy={isBusy}
          busyLabel={resolveBusyLabel(stage)}
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
            Voir la transaction sur Etherscan
          </a>
        ) : null}
      </section>

      {stage === "sealed" ? (
        <section className="flex flex-col gap-4 pt-6">
          <h2 className="type-display-lg">Ouvrir le passage</h2>
          <p className="type-body text-ink-muted">
            Le registre ne détient aucun fonds. Pour qu&apos;il puisse faire payer le Safe le
            moment venu, activez le module une seule fois.
          </p>
          {isModuleEnabled === true ? (
            <p className="type-small text-brass">Module activé. Le passage est ouvert.</p>
          ) : (
            <button
              type="button"
              onClick={() => void handleEnableModule()}
              disabled={isEnablingModule}
              className="lacquer-well type-small min-h-11 w-fit px-5 py-3 text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-brass disabled:text-ink-faint"
            >
              {isEnablingModule ? "Activation…" : "Activer le module sur le Safe"}
            </button>
          )}
          {moduleTransaction !== null ? (
            <a
              href={buildTransactionUrl(moduleTransaction)}
              target="_blank"
              rel="noreferrer"
              className="type-small type-numeric text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
            >
              Voir la transaction sur Etherscan
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

function resolveBusyLabel(stage: SealStage): string {
  switch (stage) {
    case "encrypting":
      return "Chiffrement des huit lignes…";
    case "signing":
      return "Signature en attente…";
    case "confirming":
      return "Inscription dans le registre…";
    default:
      return "";
  }
}
