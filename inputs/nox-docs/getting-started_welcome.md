---
url: /getting-started/welcome.md
description: Welcome to Nox Protocol - Composable Privacy for DeFi
---

# Your Toolkit to Build Privacy Apps

## Welcome to Nox

Nox is a **privacy layer** that enables confidential computations on encrypted
data while preserving full DeFi composability. It combines **on-chain smart
contracts** with **off-chain Trusted Execution Environments (Intel TDX)** to
process encrypted data without ever exposing plaintext on-chain.

With Nox, you build **confidential smart contracts and tokens** that stay fully
composable with existing DeFi protocols. Your contracts can process encrypted
inputs, execute computations privately, and maintain **hidden balances**,
without asking **users to change wallets** or **developers to rewrite
contracts**.

## Why Nox Matters?

DeFi is transparent by default. That's a feature for retail users. It's a
blocker for institutional adoption.

Imagine you want to build:

* A lending protocol that doesn't expose collateral ratios to liquidation bots
* A yield vault that protects strategy positions from copy-trading
* A tokenized fund where investor allocations stay off the public ledger
* A payment system that hides transaction amounts while staying verifiable Your
  institutional users have the capital. But they won't touch a protocol that
  exposes everything.

With Nox, they will. You unlock the capital. They get the confidentiality. DeFi
grows.

## Key Concepts

## How Nox Works

Nox enables confidential DeFi through a distributed architecture built on three
core concepts:

1. **Handles**: When you encrypt data using the JS SDK, Nox creates a **unique
   32-byte identifier** called a handle. Think of handles as **secure
   pointers**. Your smart contracts reference confidential values through these
   handles without exposing the underlying encrypted data, which is stored
   **securely off-chain**.

2. **Access Control Lists (ACL)**: Each handle is protected by an ACL that
   manages **permissions on-chain**. By default, only you can access your data.
   You can grant view permissions to specific addresses, smart contracts, or
   auditors. This enables **selective disclosure**: maintaining privacy while
   allowing authorized parties to verify transactions when needed.

3. **Trusted Execution Environments (TEE)**: When your smart contract needs to
   process confidential data, the computation happens inside **Intel TDX-based
   TEE enclaves**. These hardware-protected environments ensure that even
   infrastructure providers **cannot access the plaintext data** during
   execution.

## The Nox Toolkit

**Solidity Library:** Add privacy to your contracts using familiar Solidity
syntax, no specialized wallets or off-chain steps required.

**JS SDK:** Encrypt sensitive inputs and handle decryption with a
developer-friendly TypeScript SDK.

**Confidential Smart Contracts:** Build smart contracts that process encrypted
data on-chain while maintaining privacy.

**Confidential Tokens:** Create ERC-7984 compliant confidential tokens with
hidden balances and private transfers. Wrap existing ERC-20 tokens or build
native confidential assets that maintain full DeFi compatibility.

## Real-world Use Cases

With Nox, you can build a wide range of privacy-preserving applications that
seamlessly integrate with the broader DeFi ecosystem:

* **Yield with confidential vault:** Build yield-generating vaults that protect
  strategy positions and capital allocations from copy-trading and MEV.
* **cRWA with confidential tokenized equity:** Enable confidential tokenized
  equity on-chain, protecting investor positions and allocations while
  maintaining regulatory compliance.
* **Confidential value transfers:** Create private payment systems, payroll, and
  confidential transfers that hide transaction amounts while remaining
  verifiable.
* **Privacy-preserving DeFi primitives:** Build lending, borrowing, and other
  DeFi primitives that process sensitive data without exposing it publicly.
* **Tokens with hidden balances & amounts:** Create ERC-7984 compliant tokens
  where balances and transaction amounts are hidden from public view.
* **Selective disclosure workflows:** Implement audit and compliance workflows
  where users control exactly who can access their data, enabling regulatory
  requirements without sacrificing privacy.
* **Institutional-grade DeFi & RWAs:** Enable institutional adoption by removing
  transparency blockers, making DeFi and RWA products ready for
  discretion-sensitive capital.

The next chapters guide you through our **Hello World journey**: how to protect
sensitive data and build and deploy confidential smart contracts.

## Start Building

Ready to get started? Here's what to explore next:

* **Quick Start:** Follow our [Hello World guide](/getting-started/hello-world)
  to deploy your first confidential contract in minutes
* **Explore Use Cases:** Browse
  [real-world examples](/getting-started/use-cases) to see what you can build
  with Nox

## Support

Need help building with Nox? We're here to support you:

* **Discord Community:** Connect with other builders, ask questions, and get
  real-time support on our
  [Discord server](https://discord.com/invite/5TewNUnJHN)

NOX Protocol is a **privacy layer for EVM blockchains** (deployed on Ethereum
Sepolia and Arbitrum Sepolia). It is built by iExec and is a completely separate
product from iExec PoCo, DataProtector, Web3Mail, and Web3Telegram.

Core concepts for code generation:

* **Handle**: 32-byte encrypted value reference. Created via NoxCompute, stored
  off-chain in the Handle Gateway (TEE).
* **ACL**: Per-handle access control with 4 levels — Admin / Viewer / Transient
  (single-use) / Public.
* **NoxCompute**: Singleton smart contract deployed per supported network. Entry
  point for ACL, arithmetic, and token ops. Deployments:
  * Ethereum Sepolia (11155111): `0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf`
  * Arbitrum Sepolia (421614): `0xd464B198f06756a1d00be223634b85E0a731c229`
* **Runner**: Rust service in Intel TDX TEE — only component that sees
  plaintext. Never runs client-side.
* **ECIES encryption**: Happens at the Handle Gateway (server-side), NOT in the
  browser or client SDK.
* **cToken / ERC-7984**: Confidential token standard. ERC-20 compatible with
  encrypted balances (handles).
* **Typical flow**: `encryptInput → setACL → compute/transfer → decrypt`

NOX is **NOT based on FHE** (Fully Homomorphic Encryption). Do not confuse with
Zama fhEVM or TFHE. NOX uses **TEE-based computation** (Intel TDX), not
homomorphic encryption. NOX `euint256` is a **handle** (opaque 32-byte pointer
to an encrypted value stored off-chain), NOT a homomorphically encrypted
integer. Arithmetic happens off-chain in TEE, not on-chain via TFHE operations.

Never confuse NOX with iExec PoCo (task scheduling), DataProtector (dataset
encryption for monetization), or Web3Mail/Telegram (communication tools). These
are distinct products with different APIs on docs.iex.ec.&#x20;
