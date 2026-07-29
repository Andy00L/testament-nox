---
url: /references/solidity-library/methods/advanced/token-operations.md
description: High-level confidential token operations with all-or-nothing semantics
---

# Token Operations

High-level operations for confidential token contracts. They **never revert**
and follow **all-or-nothing** semantics: if the operation cannot complete
(insufficient balance, overflow), nothing changes and `success` is set to
`false`. The previous ciphertexts are reassigned to the new output handles. This
prevents leaking balance information through transaction success/failure (which
would create a binary oracle).

These operations are composed from
[core primitives](/references/solidity-library/methods/core-primitives/arithmetic)
and executed atomically inside the TEE.

### Usage

```solidity
// Confidential ERC-20 transfer
(ebool ok, euint256 newFrom, euint256 newTo) = Nox.transfer(
    _balances[from],
    _balances[to],
    amount
);
Nox.allowThis(ok);
Nox.allowThis(newFrom);
Nox.allowThis(newTo);
Nox.allow(newFrom, from);
Nox.allow(newTo, to);
_balances[from] = newFrom;
_balances[to] = newTo;
```

## transfer

```solidity
function transfer(
    euint256 balanceFrom,
    euint256 balanceTo,
    euint256 amount
) internal returns (ebool success, euint256 newBalanceFrom, euint256 newBalanceTo)
```

Moves tokens between two balances. If `amount > balanceFrom`, nothing is
transferred and all output handles retain the original values.

Overflow of `balanceTo` is impossible because the total supply is bounded by
`MAX_U`, so `balanceTo + amount <= totalSupply <= MAX_U` is guaranteed.

**Behavior:**

```
if amount > balanceFrom:
    success        = false
    newBalanceFrom = balanceFrom    // ciphertext reassigned to new handle
    newBalanceTo   = balanceTo      // ciphertext reassigned to new handle
else:
    success        = true
    newBalanceFrom = balanceFrom - amount
    newBalanceTo   = balanceTo + amount
```

| balanceFrom | balanceTo | amount | success | newBalanceFrom | newBalanceTo | Reason                                |
| ----------- | --------- | ------ | ------- | -------------- | ------------ | ------------------------------------- |
| 1000        | 500       | 300    | `true`  | 700            | 800          | Normal transfer                       |
| 1000        | 500       | 1000   | `true`  | 0              | 1500         | Full balance transferred              |
| 1000        | 500       | 2000   | `false` | 1000           | 500          | Amount > balance, nothing transferred |
| 100         | 500       | 0      | `true`  | 100            | 500          | Zero amount, no-op                    |

## mint

```solidity
function mint(
    euint256 balanceTo,
    euint256 amount,
    euint256 totalSupply
) internal returns (ebool success, euint256 newBalanceTo, euint256 newTotalSupply)
```

Creates new tokens. If either `balanceTo + amount` or `totalSupply + amount`
overflows, nothing is minted and `success` is `false`.

**Behavior:**

```
if overflow(balanceTo + amount) or overflow(totalSupply + amount):
    success        = false
    newBalanceTo   = balanceTo      // unchanged
    newTotalSupply = totalSupply    // unchanged
else:
    success        = true
    newBalanceTo   = balanceTo + amount
    newTotalSupply = totalSupply + amount
```

| balanceTo | amount | totalSupply | success | newBalanceTo | newTotalSupply | Reason            |
| --------- | ------ | ----------- | ------- | ------------ | -------------- | ----------------- |
| 500       | 300    | 10000       | `true`  | 800          | 10300          | Normal mint       |
| 0         | 1000   | 0           | `true`  | 1000         | 1000           | Mint on empty     |
| 500       | 0      | 10000       | `true`  | 500          | 10000          | Zero amount no-op |

## burn

```solidity
function burn(
    euint256 balanceFrom,
    euint256 amount,
    euint256 totalSupply
) internal returns (ebool success, euint256 newBalanceFrom, euint256 newTotalSupply)
```

Destroys tokens. If `amount > balanceFrom` or `totalSupply - amount` underflows,
nothing is burned and `success` is `false`.

**Behavior:**

```
if amount > balanceFrom or underflow(totalSupply - amount):
    success        = false
    newBalanceFrom = balanceFrom    // ciphertext reassigned to new handle
    newTotalSupply = totalSupply    // ciphertext reassigned to new handle
else:
    success        = true
    newBalanceFrom = balanceFrom - amount
    newTotalSupply = totalSupply - amount
```

| balanceFrom | amount | totalSupply | success | newBalanceFrom | newTotalSupply | Reason                           |
| ----------- | ------ | ----------- | ------- | -------------- | -------------- | -------------------------------- |
| 100         | 50     | 1000        | `true`  | 50             | 950            | Normal burn                      |
| 1000        | 1000   | 10000       | `true`  | 0              | 9000           | Full balance burned              |
| 60          | 100    | 1000        | `false` | 60             | 1000           | Amount > balance, nothing burned |
| 100         | 0      | 1000        | `true`  | 100            | 1000           | Zero amount, no-op               |
