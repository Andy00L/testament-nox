---
url: /references/solidity-library/methods/core-primitives/wrap-as-public-handle.md
description: Convert plaintext values to encrypted handles
---

# Wrap as Public Handle

Convert plaintext values to encrypted handles. The contract emits an event, and
the [Runner](/protocol/runner) encrypts the value off-chain inside a TEE. The
encrypted data is stored in the [Handle Gateway](/protocol/handle-gateway).

::: warning

The value you pass here is visible in plain text on-chain — anyone can read it
on a block explorer. This is intentional for constants, state initialization, or
wrapping values that are already public into handles for use with Nox primitives
(which only accept handles as inputs).

If the value must stay private (e.g. a user-submitted amount, vote, or bid), it
must be encrypted before the transaction is sent. →
[Accepting private user inputs](/guides/accept-user-inputs)

:::

### Usage

```solidity
// Initialize encrypted state variables
euint256 initialBalance = Nox.toEuint256(0);
Nox.allowThis(initialBalance);

euint16 threshold = Nox.toEuint16(100);
Nox.allowThis(threshold);

ebool flag = Nox.toEbool(true);
Nox.allowThis(flag);
```

## toEbool

```solidity
function toEbool(bool value) internal returns (ebool)
```

Converts a plaintext boolean to an encrypted boolean handle.

## toEuint16

```solidity
function toEuint16(uint16 value) internal returns (euint16)
```

Converts a plaintext `uint16` to an encrypted handle.

## toEuint256

```solidity
function toEuint256(uint256 value) internal returns (euint256)
```

Converts a plaintext `uint256` to an encrypted handle.

## toEint16

```solidity
function toEint16(int16 value) internal returns (eint16)
```

Converts a plaintext `int16` to an encrypted handle.

## toEint256

```solidity
function toEint256(int256 value) internal returns (eint256)
```

Converts a plaintext `int256` to an encrypted handle.
