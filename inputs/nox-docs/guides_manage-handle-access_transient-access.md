---
url: /guides/manage-handle-access/transient-access.md
description: >-
  Understanding default transient handle access and how to persist it with
  allowThis and allowTransient
---

# Transient Access

Every new handle starts with **transient** access — valid only for the current
transaction. This is the default: no additional call is needed to grant it, and
it expires automatically at the end of the transaction.

## Why allowThis is the most important call

When a handle is created inside a transaction, the calling contract has
transient access to it. Once the transaction ends, that access is gone. Without
calling `allowThis`, the contract will not be able to use the handle in any
future transaction — including storing and reading it in the next call.

```solidity
// ❌ The contract loses access to newBalance after this transaction
euint256 newBalance = Nox.add(balance, deposit);
_balances[msg.sender] = newBalance;

// ✅ The contract retains access across future transactions
euint256 newBalance = Nox.add(balance, deposit);
Nox.allowThis(newBalance);
_balances[msg.sender] = newBalance;
```

**`allowThis` is a shorthand for `allow(handle, address(this))`** — it grants
the calling contract persistent admin access to the handle.

```solidity
function allowThis(euint256 value) internal
```

A common pattern for a balance update:

```solidity
euint256 newBalance = Nox.add(balance, deposit);
Nox.allowThis(newBalance);                 // contract keeps access
Nox.allow(newBalance, msg.sender);         // user can compute with this handle
Nox.addViewer(newBalance, msg.sender);     // user can decrypt their balance
_balances[msg.sender] = newBalance;
```

## Passing handles between contracts (allowTransient)

`allowTransient` grants **one-time** access to another address or contract for
the current transaction only. The access expires automatically — no revoke is
needed.

```solidity
function allowTransient(euint256 value, address account) internal
```

This is useful when delegating a computation to a helper contract within the
same transaction without giving it permanent access:

```solidity
// Grant the helper contract access to compute with the handle
Nox.allowTransient(encryptedAmount, address(helperContract));
helperContract.process(encryptedAmount);
// After the transaction ends, helperContract can no longer access encryptedAmount
```

::: info

`allowTransient` is not a substitute for granting viewer or admin access to a
user. It is scoped to contracts interacting within the same transaction.

:::

## allowThis vs allowTransient

|                  | `allowThis`                            | `allowTransient`                             |
| ---------------- | -------------------------------------- | -------------------------------------------- |
| Who gets access  | The calling contract                   | Any address or contract                      |
| Duration         | Persistent (across transactions)       | Current transaction only                     |
| Permission level | Admin                                  | Admin (transient)                            |
| Typical use      | Store a handle the contract will reuse | Pass a handle to a helper within the same tx |
