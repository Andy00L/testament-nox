---
url: /references/solidity-library/getting-started.md
description: >-
  Install and configure the Nox Solidity library for confidential smart
  contracts
---

# Getting Started

The Nox Solidity library lets you write smart contracts that operate on
encrypted data. You import the `Nox` library, use encrypted types like
`euint256` instead of `uint256`, and the protocol handles encryption and
off-chain computation transparently.

## How It Works

Working with confidential data in Solidity follows three steps:

1. **Receive encrypted inputs**: the user encrypts a value with the
   [JS SDK](/references/js-sdk) and sends a handle + proof to your contract. You
   call `Nox.fromExternal()` to validate the proof and get a typed encrypted
   handle.

2. **Compute on encrypted data**: use `Nox.add()`, `Nox.sub()`, `Nox.eq()`,
   `Nox.select()`, etc. These functions emit events that trigger off-chain TEE
   computation. The result is a new encrypted handle.

3. **Manage access**: grant permissions with `Nox.allow()` so handles can be
   reused in future transactions, and `Nox.addViewer()` so users can decrypt
   results off-chain via the JS SDK.

::: info

Operations on encrypted handles are not executed on-chain. The contract emits
events, and the off-chain [Runner](/protocol/runner) performs the actual
computation asynchronously inside a TEE enclave. The encrypted result is stored
in the [Handle Gateway](/protocol/handle-gateway) under the deterministic handle
computed on-chain.

:::

## Prerequisites

* **Solidity** ^0.8.0
* **Hardhat 3** or **Foundry**
* **Node.js** 18+ with `npm`, `yarn`, `pnpm`, or `bun`

## Installation

::: code-group

```sh [npm]
npm install @iexec-nox/nox-protocol-contracts
```

```sh [yarn]
yarn add @iexec-nox/nox-protocol-contracts
```

```sh [pnpm]
pnpm add @iexec-nox/nox-protocol-contracts
```

```sh [bun]
bun add @iexec-nox/nox-protocol-contracts
```

:::

The `encrypted-types` package (providing `euint256`, `ebool`, etc.) is installed
automatically as a dependency.

## Imports

```solidity
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
```

Import the `Nox` library along with the encrypted types you need, all from a
single path. The `Nox.sol` file re-exports every type from `EncryptedTypes.sol`,
so there is no need for a separate import.

## Encrypted Types

Encrypted types are custom defined value types backed by `bytes32`. Each type
wraps a **handle**, a 32-byte identifier that references encrypted data stored
off-chain in the Handle Gateway.

| Category          | Types                                | Example                     |
| ----------------- | ------------------------------------ | --------------------------- |
| Boolean           | `ebool`                              | Encrypted true/false        |
| Unsigned integers | `euint8`, `euint16`, ..., `euint256` | Encrypted balances, amounts |
| Signed integers   | `eint8`, `eint16`, ..., `eint256`    | Encrypted signed values     |
| Fixed bytes       | `ebytes1`, ..., `ebytes32`           | Encrypted raw bytes         |

Each type has a corresponding `external*` variant (e.g. `externalEuint256`) used
for handles received from users that need proof validation before use.

## Next Steps

* [Arithmetic](/references/solidity-library/methods/core-primitives/arithmetic):
  `add`, `sub`, `mul`, `div` with wrapping semantics
* [Comparisons](/references/solidity-library/methods/core-primitives/comparisons):
  `eq`, `ne`, `lt`, `le`, `gt`, `ge`
* [Token Operations](/references/solidity-library/methods/advanced/token-operations):
  `transfer`, `mint`, `burn`
* [Access Control](/references/solidity-library/methods/core-primitives/access-control):
  permissions and viewer management
* [JS SDK](/references/js-sdk): encrypt inputs and decrypt results from
  JavaScript
