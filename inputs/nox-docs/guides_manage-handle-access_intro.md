---
url: /guides/manage-handle-access/intro.md
description: >-
  Learn how to manage viewers, admins, and public decryption for encrypted data
  handles in Nox
---

# Managing Handle Access

Welcome to the guide on managing handle access with Nox. This section will help
you get started with controlling access to encrypted data.

## Overview

Handles are the on-chain representation of encrypted data. Managing access to
handles is crucial for ensuring that only authorized parties can decrypt and use
the data. With Nox, you can easily manage handle access through direct
interactions with the Nox protocol contract.

Addresses can have different roles written in the handle ACL contract, which
determine their permissions:

| role \ permissions | decrypt | use as input | add viewer | allow admin | make public |
| ------------------ | ------- | ------------ | ---------- | ----------- | ----------- |
| none               | ❌      | ❌           | ❌         | ❌          | ❌          |
| viewer             | ✅      | ❌           | ❌         | ❌          | ❌          |
| admin              | ✅      | ✅           | ✅         | ✅          | ✅          |
| transient          | ✅      | ✅           | ❌         | ❌          | ❌          |

::: info

Transient access expires automatically at the end of the transaction — no revoke
needed. See [Transient Access](/guides/manage-handle-access/transient-access).

:::

## What You'll Learn

* Manage transient access
  * Understand the default transient behavior of new handles
  * Persist contract access with `allowThis`
  * Pass handles between contracts with `allowTransient`
* Manage viewers
  * Check if an address is a viewer for a handle
  * Add viewers to a handle
* Manage admins
  * Check if an address is an admin for a handle
  * Add admins to a handle
* Manage public decryption
  * Check if a handle is publicly decryptable
  * Enable public decryption for a handle

## Next Steps

* [Transient Access](/guides/manage-handle-access/transient-access) - Learn
  about the default transient behavior and how to persist handle access
* [Manage viewers](/guides/manage-handle-access/viewers) - Learn how to manage
  viewers for a handle
* [Manage admins](/guides/manage-handle-access/admins) - Learn how to manage
  admins for a handle
* [Manage public decryption](/guides/manage-handle-access/public-decryption) -
  Learn how to manage public decryption for a handle
