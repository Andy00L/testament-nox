"use client";

import {
  TESTAMENT_STATE,
  computeDeadline,
  computePayout,
  type Bequest,
} from "@testament/shared";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";

import { useCurtain } from "@/components/scene/CurtainStage";
import { buildAddressUrl, buildTransactionUrl, readDeployment, shortenAddress } from "@/lib/chain";
import { formatRemaining, useLastTestamentId, useNowSeconds, useTestamentById } from "@/lib/testament-read";
import {
  describeWriteFailure,
  executeTestament,
  readReleasedWill,
  releaseTestament,
} from "@/lib/testament-write";

/**
 * The door.
 *
 * Before release every visitor sees exactly the same sentence. Not "you are not a
 * beneficiary", not "you are one of three": the page cannot tell, and more importantly it
 * must not appear to tell, because a page that reacts differently to different wallets is a
 * lookup oracle for the very thing the encryption is protecting.
 *
 * Once released the will is public by design, so the page reads it in clear and shows the
 * visitor their line if there is one.
 */
export function DoorScene({ requestedId }: { requestedId?: bigint }) {
  const deployment = readDeployment();
  const lastTestamentId = useLastTestamentId();
  const testamentId = requestedId ?? lastTestamentId;

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const nowSeconds = useNowSeconds();
  const { setMood } = useCurtain();

  const { summary, slotHandles, isPending, refetch } = useTestamentById(testamentId);
  const estate = useBalance({ address: summary?.safe });

  const [will, setWill] = useState<Bequest[] | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionTransaction, setActionTransaction] = useState<string | null>(null);

  const isReleased =
    summary !== undefined &&
    (summary.state === TESTAMENT_STATE.Released || summary.state === TESTAMENT_STATE.Executed);

  // External system: the canvas. The curtain falling is the door opening; there is no
  // second illustration of a door anywhere in this product.
  useEffect(() => {
    setMood({ silence: isReleased ? 1 : 0.55, isReleased });
  }, [isReleased, setMood]);

  // External system: the Handle Gateway. Once a will is public, its plaintext is fetched
  // over the network, which React does not own.
  useEffect(() => {
    if (!isReleased || slotHandles === undefined || walletClient === undefined || will !== null) {
      return;
    }
    let isCurrent = true;
    void readReleasedWill({ walletClient, slotHandles }).then((result) => {
      if (!isCurrent) {
        return;
      }
      if (result.ok) {
        setWill(result.value);
      } else {
        setErrorMessage(describeWriteFailure(result.failure));
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isReleased, slotHandles, walletClient, will]);

  if (!deployment.isDeployed) {
    return <p className="type-body text-ink-faint">Contrats non configurés.</p>;
  }

  if (isPending || summary === undefined || testamentId === undefined) {
    return <p className="type-body text-ink-faint">Lecture de la chaîne…</p>;
  }

  if (summary.state === TESTAMENT_STATE.None) {
    return <p className="type-body text-ink-muted">Aucun testament n&apos;a encore été scellé ici.</p>;
  }

  if (summary.state === TESTAMENT_STATE.Revoked) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="type-display-hero">La porte a été murée.</h1>
        <p className="type-body text-ink-muted">
          Ce testament a été révoqué par son auteur. Rien ne s&apos;ouvrira.
        </p>
      </div>
    );
  }

  const deadline = computeDeadline(summary);
  const isExpired = nowSeconds !== null && nowSeconds > deadline;

  const runRelease = async () => {
    if (walletClient === undefined || publicClient === undefined) {
      setErrorMessage("Connectez un portefeuille pour ouvrir la porte.");
      return;
    }
    setIsWorking(true);
    setErrorMessage(null);
    const result = await releaseTestament({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      testamentId,
    });
    setIsWorking(false);
    if (result.ok) {
      setActionTransaction(result.value);
      refetch();
    } else {
      setErrorMessage(describeWriteFailure(result.failure));
    }
  };

  const runExecute = async () => {
    if (walletClient === undefined || publicClient === undefined || slotHandles === undefined) {
      setErrorMessage("Connectez un portefeuille pour déclencher le paiement.");
      return;
    }
    setIsWorking(true);
    setErrorMessage(null);
    const result = await executeTestament({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      testamentId,
      slotHandles,
    });
    setIsWorking(false);
    if (result.ok) {
      setActionTransaction(result.value);
      refetch();
    } else {
      setErrorMessage(describeWriteFailure(result.failure));
    }
  };

  // ---- Closed. The same words for every visitor, connected or not. ----
  if (summary.state === TESTAMENT_STATE.Active && !isExpired) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="type-display-hero">La porte est fermée.</h1>
        <p className="type-body text-ink-muted">
          Quelqu&apos;un envoie encore des signes de vie. Ce que contient ce testament, qui y
          est nommé et pour quelle part, personne ne peut le lire, et cette page ne le sait pas
          davantage que vous.
        </p>
        <p className="type-small text-ink-faint">
          {nowSeconds === null ? " " : `Le vent tombe dans ${formatRemaining(deadline - nowSeconds)}.`}
        </p>
      </div>
    );
  }

  // ---- Expired, still closed. Anyone may push it open. ----
  if (summary.state === TESTAMENT_STATE.Active && isExpired) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="type-display-hero">Le vent est tombé.</h1>
        <p className="type-body text-ink-muted">
          Le silence a duré plus longtemps que prévu. N&apos;importe qui peut maintenant ouvrir
          ce testament : l&apos;ouverture ne donne aucun privilège à celui qui la déclenche.
        </p>
        <ActionButton onPress={() => void runRelease()} isWorking={isWorking} label="Ouvrir le testament" workingLabel="Ouverture…" />
        <Feedback errorMessage={errorMessage} transactionHash={actionTransaction} />
      </div>
    );
  }

  // ---- Open. The will is public now, by design. ----
  const visitorShare =
    will === null || address === undefined
      ? null
      : (will.find((bequest) => bequest.beneficiary.toLowerCase() === address.toLowerCase()) ?? null);
  const estateWei = estate.data?.value ?? 0n;
  const isPaid = summary.state === TESTAMENT_STATE.Executed;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="type-display-hero">{isPaid ? "La porte est ouverte." : "La porte s'ouvre."}</h1>
        <p className="type-body text-ink-muted">
          Le testament a été déchiffré. Chaque part est vérifiée on-chain avant le moindre
          paiement, si bien que la personne qui déclenche l&apos;exécution ne peut rien changer
          à ce qui a été écrit.
        </p>
      </div>

      {will === null ? (
        <p className="type-small text-ink-faint">
          {walletClient === undefined
            ? "Connectez un portefeuille pour lire le testament ouvert."
            : "Déchiffrement…"}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {will.map((bequest) => {
            const isVisitor =
              address !== undefined && bequest.beneficiary.toLowerCase() === address.toLowerCase();
            return (
              <li
                key={bequest.beneficiary}
                className="lacquer-well flex flex-wrap items-baseline justify-between gap-3 px-4 py-3"
              >
                <a
                  href={buildAddressUrl(bequest.beneficiary)}
                  target="_blank"
                  rel="noreferrer"
                  className={`type-small type-numeric transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink ${
                    isVisitor ? "text-brass" : "text-ink-muted"
                  }`}
                >
                  {shortenAddress(bequest.beneficiary)}
                  {isVisitor ? " · vous" : ""}
                </a>
                <span className="type-small type-numeric text-ink">
                  {bequest.shareBps / 100} %
                  {estateWei > 0n
                    ? ` · ${formatEther(computePayout(estateWei, bequest.shareBps))} ETH`
                    : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {visitorShare !== null && !isPaid ? (
        <p className="type-body text-ink">
          Vous héritez de {visitorShare.shareBps / 100} % de ce coffre.
        </p>
      ) : null}

      {!isPaid ? (
        <ActionButton
          onPress={() => void runExecute()}
          isWorking={isWorking}
          label="Déclencher le paiement"
          workingLabel="Vérification des preuves…"
        />
      ) : (
        <p className="type-body text-brass">Le coffre a payé. Chaque part est partie à son adresse.</p>
      )}

      <Feedback errorMessage={errorMessage} transactionHash={actionTransaction} />
    </div>
  );
}

function ActionButton({
  onPress,
  isWorking,
  label,
  workingLabel,
}: {
  onPress: () => void;
  isWorking: boolean;
  label: string;
  workingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isWorking}
      className="lacquer-well type-small min-h-11 w-fit px-5 py-3 text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-brass disabled:text-ink-faint"
    >
      {isWorking ? workingLabel : label}
    </button>
  );
}

function Feedback({
  errorMessage,
  transactionHash,
}: {
  errorMessage: string | null;
  transactionHash: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      {errorMessage !== null ? (
        <p role="alert" className="type-small text-cinnabar">
          {errorMessage}
        </p>
      ) : null}
      {transactionHash !== null ? (
        <a
          href={buildTransactionUrl(transactionHash)}
          target="_blank"
          rel="noreferrer"
          className="type-small type-numeric text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          Voir la transaction sur Etherscan
        </a>
      ) : null}
    </div>
  );
}
