---
url: /references/solidity-library/methods/core-primitives/access-control.md
description: 'Manage permissions on encrypted handles, control who can compute and decrypt'
---

# Access Control

Every new handle starts with **transient** access (valid only for the current
transaction). You must explicitly persist access so handles can be reused in
future transactions and decrypted by authorized users.

For a detailed explanation of the permission model, see
[Nox Smart Contracts: ACL](/protocol/nox-smart-contracts#acl-access-control-list).

**Supported types:** `ebool`, `euint16`, `euint256`, `eint16`, `eint256`

## Usage

```solidity
euint256 newBalance = Nox.add(balance, deposit);
Nox.allowThis(newBalance);                   // contract keeps access
Nox.allow(newBalance, msg.sender);           // user can compute with this handle
Nox.addViewer(newBalance, msg.sender);       // user can decrypt their balance
_balances[msg.sender] = newBalance;
```

## isInitialized

```solidity
function isInitialized(euint256 handle) internal pure returns (bool)
```

Returns `true` if the handle is non-zero (has been assigned a value). Use this
to check whether a mapping entry has been set before performing operations on
it.

## allow

```solidity
function allow(euint256 value, address account) internal
```

Grants persistent **admin** access to `account` on the handle. The account can
use the handle as input in future computations and manage its permissions.

::: warning

* The caller must already have access to the handle. You cannot grant access to
  a handle you do not control.
* This permission is permanent and cannot be revoked. See
  [Managing Admins](/guides/manage-handle-access/admins#isolating-access-via-a-new-handle)
  for the new-handle isolation pattern.

:::

## allowThis

```solidity
function allowThis(euint256 value) internal
```

Shorthand for `allow(value, address(this))`. Grants persistent access to the
calling contract so the handle can be reused in future transactions.

## allowTransient

```solidity
function allowTransient(euint256 value, address account) internal
```

Grants **one-time** access to `account` for the current transaction only.
Transient permissions are cleared at the end of the transaction. Useful for
passing handles to another contract within the same transaction without giving
permanent access.

## isAllowed

```solidity
function isAllowed(euint256 handle, address account) internal view returns (bool)
```

Returns `true` if `account` has admin access (persistent or transient) to the
handle.

::: tip

Working from JavaScript? `isAllowed` is the on-chain Solidity function. In the
JS SDK, use [`handleClient.viewACL(handle)`](/references/js-sdk/methods/viewACL)
to fetch the handle's **persistent** ACL from the subgraph (transient access is
not reflected off-chain) instead of calling the contract directly.

:::

## addViewer

```solidity
function addViewer(euint256 value, address viewer) internal
```

Grants **viewer** permission to `viewer`. Viewers can decrypt the handle's data
through the Handle Gateway using the
[JS SDK](/references/js-sdk/methods/decrypt) but cannot use the handle as input
in computations.

::: warning

This permission is permanent and cannot be revoked. See
[Managing Viewers](/guides/manage-handle-access/viewers#isolating-access-via-a-new-handle)
for the new-handle isolation pattern.

:::

## isViewer

```solidity
function isViewer(euint256 handle, address viewer) internal view returns (bool)
```

Returns `true` if `viewer` has viewer permission on the handle.

## allowPublicDecryption

```solidity
function allowPublicDecryption(euint256 value) internal
```

Makes the handle's data decryptable by anyone. Use this for values that should
be publicly visible (e.g. total supply, auction results, public counters).

::: warning

This permission is permanent and cannot be revoked. Once public, anyone can
decrypt and store the value. See
[Manage Public Decryption](/guides/manage-handle-access/public-decryption) for
details.

:::

## isPubliclyDecryptable

```solidity
function isPubliclyDecryptable(euint256 handle) internal view returns (bool)
```

Returns `true` if the handle is marked as publicly decryptable.
