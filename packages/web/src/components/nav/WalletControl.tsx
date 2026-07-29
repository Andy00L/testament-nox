"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

import { shortenAddress } from "@/lib/chain";

/**
 * Connect and disconnect, rendered by this project rather than by a connector kit.
 *
 * A borrowed wallet modal would be the loudest, most recognisable thing on a page whose
 * whole argument is that it looks like nothing else, so the wallet list is drawn here in
 * the product's own material.
 */
export function WalletControl() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address !== undefined) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="type-small type-numeric px-1 text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        title="Se déconnecter"
      >
        {shortenAddress(address)}
      </button>
    );
  }

  const firstConnector = connectors[0];

  return (
    <div className="flex items-center gap-3">
      {connectors.map((connector, connectorIndex) => (
        <button
          key={connector.uid}
          type="button"
          disabled={isPending}
          onClick={() => connect({ connector })}
          className="type-small px-1 text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink disabled:text-ink-faint"
        >
          {connectorIndex === 0 && connector === firstConnector && connectors.length === 1
            ? "Connecter"
            : connector.name}
        </button>
      ))}
      {connectors.length === 0 ? (
        <span className="type-small text-ink-faint">Aucun portefeuille détecté</span>
      ) : null}
    </div>
  );
}
