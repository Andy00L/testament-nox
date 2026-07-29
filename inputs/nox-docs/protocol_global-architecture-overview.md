---
url: /protocol/global-architecture-overview.md
description: >-
  High-level overview of Nox protocol architecture, components, data flows, and
  how they interact to enable confidential computation on encrypted data
---

# Global Architecture Overview

Nox is a confidential computation protocol for DeFi. It allows smart contracts
to operate on encrypted data without ever exposing plaintext on-chain. The
protocol coordinates six components: on-chain smart contracts, an event listener
(Ingestor), a message queue (NATS), a computation engine (Runner), an encrypted
data store (Handle Gateway), and a key management service (KMS).

![Nox Protocol Architecture](../assets/images/nox_protocol.png)

## End-to-End Flow

A confidential computation in Nox follows three phases: **input**, **compute**,
and **output**. The diagram below shows the complete lifecycle of an encrypted
operation, from user input to result retrieval.

```mermaid
sequenceDiagram
    participant U as User (SDK)
    participant GW as Handle Gateway
    participant KMS as KMS
    participant SC as NoxCompute
    participant BC as Blockchain
    participant I as Ingestor
    participant NATS as NATS JetStream
    participant R as Runner

    rect rgb(59, 130, 246, 0.1)
    note right of U: Phase 1: Input
    U->>GW: POST /v0/secrets (plaintext, type, owner)
    GW->>KMS: GET /v0/public-key
    KMS-->>GW: pubkey_KMS
    GW->>GW: ECIES encrypt with pubkey_KMS
    GW-->>U: handle + EIP-712 proof
    U->>SC: Call operation (e.g. add(handleA, handleB))
    SC->>SC: Validate handle proofs + types
    SC->>SC: Compute deterministic result handle
    SC->>SC: Grant transient ACL on result
    SC->>BC: Emit event (e.g. Add)
    end

    rect rgb(245, 158, 11, 0.1)
    note right of I: Phase 2: Compute
    I->>BC: Poll new blocks
    BC-->>I: Logs from NoxCompute
    I->>NATS: Publish TransactionMessage
    R->>NATS: Pull next message
    R->>GW: GET /v0/compute/operands (RSA pubkey)
    GW->>KMS: POST /v0/delegate (K, RSA pubkey)
    KMS-->>GW: encryptedSharedSecret
    GW-->>R: ciphertext + encryptedSharedSecret + nonce
    R->>R: Decrypt inputs locally
    R->>R: Execute computation
    R->>R: Re-encrypt result (ECIES)
    R->>GW: POST /v0/compute/results
    R->>NATS: Acknowledge message
    end

    rect rgb(16, 185, 129, 0.1)
    note right of U: Phase 3: Output
    U->>U: Generate ephemeral RSA keypair
    U->>GW: GET /v0/secrets/:handle (RSA pubkey + EIP-712 auth)
    GW->>GW: Verify signature + check on-chain ACL
    GW->>KMS: POST /v0/delegate (K, RSA pubkey)
    KMS-->>GW: encryptedSharedSecret
    GW-->>U: ciphertext + encryptedSharedSecret + nonce
    U->>U: RSA decrypt, HKDF, AES-GCM decrypt
    end
```

### Phase 1: Input

The user encrypts sensitive data off-chain and submits it to a smart contract
using opaque **handles** (32-byte identifiers that reference the encrypted data
stored in the Handle Gateway).

1. The user sends a plaintext value to the **Handle Gateway** via the SDK
2. The Handle Gateway encrypts it with
   [ECIES](/protocol/kms#ecies-encryption-scheme) using the KMS public key and
   stores the ciphertext in an **AWS S3 bucket**.
3. The Handle Gateway returns a **handle** and an **EIP-712 signed proof**
   attesting the handle's validity.
4. The user calls a function on a smart contract that uses the **NoxCompute**
   library (e.g. `Nox.add(handleA, handleB)`)
5. NoxCompute validates handle proofs and type compatibility, computes a
   deterministic result handle, grants transient ACL access on it, and **emits
   an event** containing the input and output handles.

At this point, the on-chain transaction is complete. The encrypted result does
not exist yet: it will be computed off-chain.

### Phase 2: Compute

The off-chain pipeline picks up the event and executes the computation inside a
secure environment.

1. The **Ingestor** polls new blocks from the blockchain RPC, filters NoxCompute
   logs, groups events by transaction, and publishes a `TransactionMessage` to
   **NATS JetStream**.
2. The **Runner** pulls the next message from the queue.
3. The Runner requests the encrypted operands from the **Handle Gateway**,
   providing an ephemeral RSA public key.
4. The Handle Gateway retrieves the object from its **AWS S3 bucket** and
   coordinates with the **KMS** to perform
   [decryption delegation](/protocol/kms): the KMS computes the ECDH shared
   secret and encrypts it with the Runner's RSA key.
5. The Runner decrypts the inputs locally (RSA decrypt the shared secret, HKDF
   key derivation, AES-GCM decrypt), executes the computation, and encrypts the
   result with ECIES using the KMS public key.
6. The Runner submits the encrypted result to the Handle Gateway and
   acknowledges the `TransactionMessage` received from **NATS JetStream**.

### Phase 3: Output

When the user wants to read a result, the protocol performs decryption
delegation so that only the authorized user can recover the plaintext.

1. The user generates an ephemeral RSA keypair and sends a decryption request to
   the Handle Gateway, authenticated with an EIP-712 signature.
2. The Handle Gateway verifies the signature and checks the **on-chain ACL** to
   confirm the user has viewer permission on the handle.
3. The Handle Gateway requests decryption delegation from the KMS: the KMS
   computes the shared secret and encrypts it with the user's RSA public key
4. The user receives the ciphertext, encrypted shared secret, and nonce, then
   decrypts locally: RSA decrypt the shared secret, derive the AES key via HKDF,
   and AES-GCM decrypt the ciphertext

The KMS never sees plaintext data. Only the final recipient (user or Runner)
performs the actual decryption.

## Handles

A **handle** is a 32-byte identifier that references an encrypted value stored
in the Handle Gateway. It does not contain the ciphertext itself.

```
[0]      [1------4]    [5]     [6]     [7---------------------31]
Version   Chain ID    Type   Attrs       prehandle (25 bytes)
```

| Segment    | Size     | Description                                                                              |
| ---------- | -------- | ---------------------------------------------------------------------------------------- |
| Version    | 1 byte   | Handle format version (currently `0x00`)                                                 |
| Chain ID   | 4 bytes  | Chain ID encoded as uint32; binds the handle to a specific blockchain                    |
| Type       | 1 byte   | Solidity type of the encrypted value (uint8, bool, address, etc.)                        |
| Attributes | 1 byte   | Handle attributes/properties (e.g. uniqueness)                                           |
| Prehandle  | 25 bytes | Truncated keccak256 hash (deterministic for computation results, random for user inputs) |

For computation results, the prehandle is derived from the operator, input
handles, contract address, caller, timestamp, and output index. This makes
handles **deterministic**: the same operation on the same inputs in the same
transaction always produces the same handle.

For user inputs created via the Handle Gateway, the prehandle is a random value.
The handle is validated on-chain via an EIP-712 signed proof from the Handle
Gateway.

For the full handle specification, see
[Nox Smart Contracts](/protocol/nox-smart-contracts#handle-structure).

## Access Control

The **ACL** contract manages who can use a handle as a computation input and who
can decrypt the underlying data.

| Permission    | Granted by                    | Capability                                                 |
| ------------- | ----------------------------- | ---------------------------------------------------------- |
| **Admin**     | `ACL.allow()`                 | Use handle as computation input, manage permissions        |
| **Transient** | NoxCompute (automatic)        | One-time use within the current transaction, cleared after |
| **Viewer**    | `ACL.addViewer()`             | Decrypt the associated data via the Handle Gateway         |
| **Public**    | `ACL.allowPublicDecryption()` | Anyone can decrypt                                         |

When NoxCompute creates a result handle, it automatically grants **transient**
access to the calling contract. The contract must persist this permission with
`ACL.allow()` if the handle needs to be used in subsequent transactions.

The Handle Gateway checks ACL permissions on-chain (via `isViewer`) before
serving decryption material to a user.

## Encryption

All encrypted data in Nox is protected with **ECIES** (Elliptic Curve Integrated
Encryption Scheme) on secp256k1, using the KMS public key as the encryption
target.

```mermaid
flowchart LR
    A[Plaintext] --> B[Generate ephemeral key k]
    B --> C["ECDH: S = k * pubkey_KMS"]
    C --> D["HKDF-SHA256 → AES-256 key"]
    D --> E["AES-256-GCM encrypt"]
    E --> F["Store: ciphertext + K + nonce"]

    style A fill:#4a9eff,color:#fff
    style F fill:#7c3aed,color:#fff
```

The KMS holds the corresponding private key but **never decrypts data
directly**. Instead, it performs **decryption delegation**: it computes the ECDH
shared secret and encrypts it with the requester's RSA public key. The requester
then derives the AES key locally and decrypts the ciphertext.

For the full cryptographic protocol, see [KMS](/protocol/kms).

## Learn More

* [Protocol Vision](/protocol/protocol-vision): long-term architecture and
  design principles
* [Nox Smart Contracts](/protocol/nox-smart-contracts): on-chain contracts,
  handle structure, and ACL
* [Ingestor](/protocol/ingestor): blockchain monitoring and event pipeline
* [Runner](/protocol/runner): computation engine and supported operations
* [Handle Gateway](/protocol/handle-gateway): encryption, storage, and API
  reference
* [KMS](/protocol/kms): cryptographic protocol and decryption delegation
* [Solidity Library](/references/solidity-library): full reference of all
  operations
