---
url: /getting-started/networks.md
description: 'Supported chains, NoxCompute contract addresses, RPCs, explorers and faucets.'
---

# Networks

This page lists the supported chain with the data you need to wire your dApp
end-to-end: the NoxCompute contract address, the canonical RPC URL, the block
explorer, faucet links for test funds, and a one-click *Add to wallet* action.

## How "Add to wallet" works

Each card's button calls your wallet's EIP-1193 provider
(`wallet_switchEthereumChain`, falling back to `wallet_addEthereumChain` when
the chain is unknown to the wallet). If you reject the request the button
returns to the retry state; if your wallet does not have any EIP-1193 provider
installed, the button is disabled with a hint.
