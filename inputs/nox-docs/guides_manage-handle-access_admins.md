---
url: /guides/manage-handle-access/admins.md
description: Managing handles admins with Nox
---

# Admins

Admins are addresses that have the most permissions on a handle. Admins can:

* decrypt the handle
* use the handle as input to create new handles
* add other addresses as viewers for the handle
* allow other addresses to become admins for the handle
* make the handle publicly decryptable

## Checking Admins

The Nox protocol smart contract provides a function to check if a specific
address is an allowed admin for a given handle:

::: tip

`isAllowed` checks admin access specifically. To check viewer access, use
`isViewer` instead (see [Manage Viewers](/guides/manage-handle-access/viewers)).

:::

```solidity
function isAllowed(bytes32 handle, address account) external view returns (bool);
```

**`isAllowed` ABI:**

```json
[
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "handle",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "isAllowed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]
```

::: code-group

```ts twoslash [ethers]
import { BrowserProvider, Contract, type AbstractProvider } from 'ethers';

const provider: AbstractProvider = new BrowserProvider(
  (window as any).ethereum
) as AbstractProvider;

const handle = '0xHandle';
const account = '0xAccountAddress';

/**
 * Nox protocol contract address (Ethereum Sepolia).
 * Arbitrum Sepolia: 0xd464B198f06756a1d00be223634b85E0a731c229
 *
 * See the /networks page for all deployments.
 */
const NOX_CONTRACT_ADDRESS: `0x${string}` =
  '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf';

/**
 * `isAllowed` ABI fragment
 */
const NOX_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'handle',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'isAllowed',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
// ---cut---
const noxContract = new Contract(
  NOX_CONTRACT_ADDRESS,
  NOX_CONTRACT_ABI,
  provider
);
const isAllowed: boolean = await noxContract.isAllowed(handle, account);
```

```ts twoslash [viem]
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains'; // or arbitrumSepolia

const handle = '0xHandle';
const account = '0xAccountAddress';

const publicClient = createPublicClient({
  chain: sepolia, // or arbitrumSepolia
  transport: http(),
});

/**
 * Nox protocol contract address (Ethereum Sepolia).
 * Arbitrum Sepolia: 0xd464B198f06756a1d00be223634b85E0a731c229
 *
 * See the /networks page for all deployments.
 */
const NOX_CONTRACT_ADDRESS: `0x${string}` =
  '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf';

/**
 * `isAllowed` ABI fragment
 */
const NOX_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'handle',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'isAllowed',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
// ---cut---
const isAllowed = await publicClient.readContract({
  address: NOX_CONTRACT_ADDRESS,
  abi: NOX_CONTRACT_ABI,
  functionName: 'isAllowed',
  args: [handle, account],
});
```

:::

## Allowing Admins

The Nox protocol smart contract provides a function for admins to allow a
specific address as an admin for a given handle:

::: info

Only allowed admins can allow new admins.

:::

::: warning

Once allowed, an admin cannot be revoked.

This is by design: once an admin has been granted access, they can decrypt and
use the handle at any time. Revoking on-chain permission would give a false
sense of security — the admin may have already decrypted and stored the data
locally via the Handle Gateway.

:::

```solidity
function allow(bytes32 handle, address account) external;
```

**`allow` ABI:**

```json
[
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "handle",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "allow",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]
```

::: code-group

```ts twoslash [ethers]
import {
  BrowserProvider,
  Contract,
  type AbstractSigner,
  type Provider,
} from 'ethers';

const signer: BrowserProvider | AbstractSigner<Provider> = new BrowserProvider(
  (window as any).ethereum
);

const handle = '0xHandle';
const accountToAllow = '0xAccountAddress';

/**
 * Nox protocol contract address (Ethereum Sepolia).
 * Arbitrum Sepolia: 0xd464B198f06756a1d00be223634b85E0a731c229
 *
 * See the /networks page for all deployments.
 */
const NOX_CONTRACT_ADDRESS: `0x${string}` =
  '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf';

/**
 * `allow` ABI fragment
 */
const NOX_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'handle',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'allow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
// ---cut---
const noxContract = new Contract(
  NOX_CONTRACT_ADDRESS,
  NOX_CONTRACT_ABI,
  signer
);
const tx = await noxContract.allow(handle, accountToAllow);
await tx.wait();
```

```ts twoslash [viem]
import {
  createWalletClient,
  http,
  custom,
  type WalletClient,
  type Chain,
} from 'viem';
import { sepolia } from 'viem/chains'; // or arbitrumSepolia

/**
 * Current network.
 */
const CHAIN: Chain = sepolia as Chain; // or arbitrumSepolia

const handle = '0xHandle';
const accountToAllow = '0xAccountAddress';

const walletClient: WalletClient = createWalletClient({
  transport: custom((window as any).ethereum),
  chain: CHAIN,
});

/**
 * Nox protocol contract address (Ethereum Sepolia).
 * Arbitrum Sepolia: 0xd464B198f06756a1d00be223634b85E0a731c229
 *
 * See the /networks page for all deployments.
 */
const NOX_CONTRACT_ADDRESS: `0x${string}` =
  '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf';

/**
 * `allow` ABI fragment
 */
const NOX_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'handle',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'allow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
// ---cut---
const [userAddress] = await walletClient.getAddresses();

await walletClient.writeContract({
  account: userAddress,
  chain: CHAIN,
  address: NOX_CONTRACT_ADDRESS,
  abi: NOX_CONTRACT_ABI,
  functionName: 'allow',
  args: [handle, accountToAllow],
});
```

:::

## Isolating Access via a New Handle

There is no on-chain revoke for admin access. For use cases that require access
isolation (e.g. end of a regulatory audit), the recommended pattern is to
migrate to a fresh handle:

1. Create a new handle with the same value —
   `Nox.add(existingHandle, Nox.toEuint256(0))` produces a new handle with a
   fresh ACL. Use the matching converter for other types (`Nox.toEuint16`,
   `Nox.toEbool`, etc.).
2. Update your contract's storage to point to the new handle.
3. Grant access only to the addresses that should retain access on the new
   handle.

The old handle remains accessible to previous admins, but is no longer used by
your application.

::: info

This pattern costs extra gas and does not destroy the ciphertext on the Handle
Gateway. It is an application-level isolation, not a cryptographic revoke.

:::
