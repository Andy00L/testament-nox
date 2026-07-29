---
url: /references/solidity-library.md
description: >-
  Nox Solidity library for building confidential smart contracts with encrypted
  types and TEE-backed computation
---

# Solidity Library

The `Nox` library is the developer-facing Solidity SDK for building confidential
smart contracts. It provides type-safe wrappers around encrypted values, handles
proof validation, manages access control, and triggers off-chain TEE
computation, all through a single `import`.

## Quick Overview

```solidity
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

contract ConfidentialVault {
    mapping(address => euint256) private _balances;

    function deposit(externalEuint256 encryptedAmount, bytes calldata proof) external {
        euint256 amount = Nox.fromExternal(encryptedAmount, proof);
        euint256 balance = _balances[msg.sender];

        if (!Nox.isInitialized(balance)) {
            balance = Nox.toEuint256(0);
            Nox.allowThis(balance);
        }

        euint256 newBalance = Nox.add(balance, amount);
        Nox.allowThis(newBalance);
        Nox.allow(newBalance, msg.sender);
        _balances[msg.sender] = newBalance;
    }
}
```

## Confidential Functions

The Nox library organizes its functions into three layers, each building on the
previous one.

![Confidential Functions by Nox](../assets/images/confidential-primitive.png)

### Core Primitives

The foundational building blocks for confidential computation. These low-level
operations let you perform arithmetic, comparisons, and conditional logic
directly on encrypted values.

* [Wrap as Public Handle](/references/solidity-library/methods/core-primitives/wrap-as-public-handle):
  convert plaintext values to encrypted handles
* [fromExternal](/references/solidity-library/methods/core-primitives/fromExternal):
  validate user-submitted handles with EIP-712 proofs
* [Arithmetic](/references/solidity-library/methods/core-primitives/arithmetic):
  `add`, `sub`, `mul`, `div` with wrapping semantics
* [Safe Arithmetic](/references/solidity-library/methods/core-primitives/safe-arithmetic):
  `safeAdd`, `safeSub`, `safeMul`, `safeDiv` with overflow detection
* [Comparisons](/references/solidity-library/methods/core-primitives/comparisons):
  `eq`, `ne`, `lt`, `le`, `gt`, `ge` returning `ebool`
* [select](/references/solidity-library/methods/core-primitives/select):
  encrypted conditional branching
* [Access Control](/references/solidity-library/methods/core-primitives/access-control):
  `allow`, `allowThis`, `addViewer`, `allowPublicDecryption` and more

### Advanced Functions

Higher-level operations composed from core primitives. These provide
ready-to-use logic for common DeFi patterns with built-in safety guarantees
(all-or-nothing semantics).

* [Token Operations](/references/solidity-library/methods/advanced/token-operations):
  `transfer`, `mint`, `burn` for confidential token contracts

### Custom Functions

::: info Coming Soon

Developers will be able to define their own confidential functions (e.g. `swap`,
`borrow`, `repay`) by composing core primitives and advanced functions into
custom on-chain logic executed inside TEEs.

:::

## Next Steps

* [Getting Started](/references/solidity-library/getting-started): installation
  and project setup
