---
url: /references/js-sdk.md
description: JavaScript SDK for Nox
---

# JS SDK

The Nox JavaScript SDK (`@iexec-nox/handle`) provides a simple and secure
interface for interacting with the Nox protocol from JavaScript/TypeScript
applications. It enables developers to encrypt data and decrypt handles without
dealing with the underlying cryptographic complexity.

## Key Features

* **Easy Integration**: Works with both Ethers.js and Viem
* **Account Abstraction**: Supports ERC-4337 Smart Accounts via Viem
* **Type-Safe**: Full TypeScript support with type inference
* **Secure**: Handles encryption, decryption, and signature management
  automatically
* **Gasless Decryption**: Uses EIP-712 signatures for authentication without
  requiring gas

## Core Concepts

### Handles

A handle is a 32-byte identifier that references encrypted data stored
off-chain. Handles are deterministic and can be verified on-chain through
cryptographic proofs.

### Handle Proofs

When encrypting data, the Handle Gateway returns a `handleProof` - a signed
EIP-712 payload that proves the handle was created by a legitimate Handle
Gateway. This proof is used when verifying handles in smart contracts.

### Access Control

Handles are protected by Access Control Lists (ACLs) managed on-chain. Only
authorized addresses (admin or viewers) can decrypt handles.

## Documentation

* [Getting Started](/references/js-sdk/getting-started) - Installation and basic
  usage
* **Methods**
  * [encryptInput](/references/js-sdk/methods/encryptInput) - Encrypt data and
    create handles
  * [decrypt](/references/js-sdk/methods/decrypt) - Decrypt handles
  * [publicDecrypt](/references/js-sdk/methods/publicDecrypt) - Decrypt publicly
    decryptable handles with proof
  * [viewACL](/references/js-sdk/methods/viewACL) - View the Access Control List
    of a handle
* [Advanced Configuration](/references/js-sdk/advanced-configuration) - Custom
  configuration options
