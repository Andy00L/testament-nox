---
url: /guides/accept-user-inputs.md
description: >-
  How to pass a user-provided value into a confidential smart contract without
  exposing it on-chain
---

# Accepting Private User Inputs

Blockchain calldata is public. Every argument you pass to a smart contract
function is visible on any block explorer — permanently. This means that if you
encrypt a value *inside* the contract, the plaintext was already exposed the
moment the transaction was broadcast.

Encryption must happen **before** the transaction is sent.

## Two patterns

### Pattern A — Encrypt before the transaction via the JS SDK (correct)

```
┌─ BROWSER ─────────────────────────────────────┐
│  amount = 100                                  │
│  { handle, handleProof } =                     │
│    handleClient.encryptInput(100n, 'uint256',  │
│                              CONTRACT_ADDRESS) │
└────────────────────────────────────────────────┘
                     ↓ tx ↓
┌─ CALLDATA (public on a block explorer) ────────┐
│  contract.contribute(handle, handleProof)      │
│  ← 100 does NOT appear                         │
└────────────────────────────────────────────────┘
                     ↓ ↓
┌─ CONTRACT ─────────────────────────────────────┐
│  euint256 encrypted = Nox.fromExternal(        │
│    handle, handleProof                         │
│  );                                            │
│  ← contract receives a handle, never 100       │
└────────────────────────────────────────────────┘
```

Only the user's browser and the Nox TEE ever see `100`.

### Pattern B — Encrypt in the contract (incorrect for private values)

```
┌─ BROWSER ─────────────────────────────────────┐
│  amount = 100                                  │
│  ← no encryptInput call                        │
└────────────────────────────────────────────────┘
                     ↓ tx ↓
┌─ CALLDATA (public on a block explorer) ────────┐
│  contract.contribute(100)                      │
│  ← 100 IS VISIBLE TO EVERYONE                  │
└────────────────────────────────────────────────┘
                     ↓ ↓
┌─ CONTRACT ─────────────────────────────────────┐
│  euint256 encrypted = Nox.toEuint256(amount);  │
│  ← stores an encrypted handle                  │
│  ← but 100 was already public                  │
└────────────────────────────────────────────────┘
```

The handle on-chain is encrypted, but the value in calldata is not. Encryption
must happen **before** the transaction is sent.

## How to implement Pattern A

::: info

`encryptInput` sends the plaintext to the
[Handle Gateway](/protocol/handle-gateway), which encrypts it inside a TEE and
returns the handle and the proof. The encryption does not happen in the browser
— your code just initiates the request.

:::

**Client side** — use [`encryptInput`](/references/js-sdk/methods/encryptInput)
from the JS SDK to encrypt the value and get a `handle` + `handleProof`:

```ts
const { handle, handleProof } = await handleClient.encryptInput(
  100n,
  'uint256',
  CONTRACT_ADDRESS
);
// pass handle and handleProof to your contract call
```

**Contract side** — use
[`fromExternal`](/references/solidity-library/methods/core-primitives/fromExternal)
to validate the proof and receive the encrypted handle:

```solidity
function contribute(externalEuint256 handle, bytes calldata handleProof) external {
    euint256 amount = Nox.fromExternal(handle, handleProof);
    // use amount in confidential computations
}
```
