"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ChevronDown } from "@appica/icons-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import type { ReactNode } from "react";

import { Key } from "@/components/ui/Key";
import { buildAddressUrl, shortenAddress } from "@/lib/chain";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * The page's EIP-1193 provider, when a wallet extension has injected one. Declared rather
 * than cast; only its presence is ever read.
 */
declare global {
  interface Window {
    ethereum?: unknown;
  }
}

/**
 * One button, two panels. Disconnected, pressing it opens a small paper panel listing the
 * wallets this browser actually has: EIP-6963 discovery surfaces each installed extension
 * by name and icon, WalletConnect appears when a project id is configured, and a browser
 * with nothing installed is told so instead of being shown a dead row. Connected, pressing
 * the address opens the same panel showing which account this is, its Etherscan page, and
 * a disconnect key.
 *
 * The connected state used to BE the disconnect button: one click on the address and the
 * wallet was gone, with nothing on screen saying so. An account is not something to drop
 * by grazing it; leaving is now a named act inside the panel, one press further away.
 *
 * Drawn in the product's own material rather than a connector kit's modal, which would be
 * the loudest, most recognisable thing on a page whose whole argument is that it looks
 * like nothing else.
 */
/** The provider either exists at page load or it does not; there is nothing to watch. */
function subscribeToNothing(): () => void {
  return () => {};
}

export function WalletControl() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, error, isPending, variables, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { copy } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // External system: the page's EIP-1193 provider. A store read with a server snapshot of
  // false, so the server render and the first client render agree and hydration is clean.
  const hasInjectedProvider = useSyncExternalStore(
    subscribeToNothing,
    () => typeof window.ethereum !== "undefined",
    () => false,
  );

  // External system: the document, for closing on an outside press or Escape.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (isConnected && address !== undefined) {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((wasOpen) => !wasOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className="type-small type-numeric group flex items-center gap-1.5 px-1 text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          {shortenAddress(address)}
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-(--duration-fast) ease-(--ease-smooth-out)"
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        <AnimatePresence>
          {isOpen ? (
            <DropdownPanel ariaLabel={copy.wallet.connectedTitle}>
              <p className="type-small px-2 pb-1.5 pt-1 text-ink-faint">
                {copy.wallet.connectedTitle}
              </p>
              {/* The whole address, so what is connected can be verified, not assumed. */}
              <p className="type-small type-numeric break-all px-2 pb-2 text-ink">{address}</p>
              <a
                href={buildAddressUrl(address)}
                target="_blank"
                rel="noreferrer"
                className="type-small block px-2 pb-3 text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
              >
                {copy.wallet.viewOnEtherscan}
              </a>
              <Key
                onClick={() => {
                  disconnect();
                  setIsOpen(false);
                }}
                className="flex min-h-11 w-full items-center px-3 py-2 text-left"
              >
                <span className="type-small">{copy.wallet.disconnect}</span>
              </Key>
            </DropdownPanel>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  /**
   * EIP-6963 discovery lists each installed extension as its own injected connector with
   * a real name and icon. When any of those exist, the generic catch-all injected entry
   * is a duplicate; when none do and no provider is present, it is a dead row. Either
   * way it only earns its place alone with a live `window.ethereum`.
   */
  const hasDiscoveredWallets = connectors.some(
    (connector) => connector.type === "injected" && connector.id !== "injected",
  );
  const visibleConnectors = connectors.filter((connector) => {
    if (connector.id !== "injected") {
      return true;
    }
    return !hasDiscoveredWallets && hasInjectedProvider;
  });

  const toggleOpen = () => {
    // A stale failure from the previous attempt should not greet the next one.
    if (!isOpen) {
      reset();
    }
    setIsOpen((wasOpen) => !wasOpen);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="type-small group flex items-center gap-1.5 px-1 text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
      >
        {copy.wallet.connect}
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className="transition-transform duration-(--duration-fast) ease-(--ease-smooth-out)"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      <AnimatePresence>
      {isOpen ? (
        <DropdownPanel ariaLabel={copy.wallet.choose}>
          <p className="type-small px-2 pb-1.5 pt-1 text-ink-faint">{copy.wallet.choose}</p>

          {visibleConnectors.length === 0 ? (
            <p className="type-small px-2 pb-2 text-ink-muted">{copy.wallet.none}</p>
          ) : (
            <ul className="flex flex-col">
              {visibleConnectors.map((connector, connectorIndex) => {
                const isConnecting = isPending && variables?.connector === connector;
                return (
                  <motion.li
                    key={connector.uid}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.25,
                      ease: [0.22, 1, 0.36, 1],
                      delay: 0.04 * connectorIndex,
                    }}
                  >
                    <Key
                      disabled={isPending}
                      onClick={() =>
                        connect({ connector }, { onSuccess: () => setIsOpen(false) })
                      }
                      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left not-first:mt-1.5"
                    >
                      {/* The bare mark, no tile behind it. EIP-6963 supplies the icon. */}
                      {connector.icon !== undefined ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data: URI from the wallet itself; next/image cannot optimise it
                        <img src={connector.icon} alt="" className="size-[18px] shrink-0" />
                      ) : null}
                      <span className="type-small">
                        {isConnecting
                          ? copy.wallet.connecting
                          : connector.id === "injected"
                            ? copy.wallet.browser
                            : connector.name}
                      </span>
                    </Key>
                  </motion.li>
                );
              })}
            </ul>
          )}

          {error !== null && !isPending ? (
            <p role="alert" className="type-small px-2 pb-1 pt-2 text-cinnabar">
              {copy.wallet.failed}
            </p>
          ) : null}
        </DropdownPanel>
      ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * The one paper panel both wallet states hang under the nav button: same material, same
 * origin, same enter and exit. Two hand-written copies is how one of them drifts.
 */
function DropdownPanel({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <motion.div
      role="dialog"
      aria-label={ariaLabel}
      className="panel absolute right-0 top-[calc(100%+0.875rem)] w-64 p-2"
      style={{ transformOrigin: "top right" }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
