---
url: /guides/manage-handle-access/viewers.md
description: Managing handles viewers with Nox
---

# Viewers

Viewers are addresses that have permission to decrypt the data associated with a
handle. Managing viewers is essential for controlling who can view the decrypted
data.

::: info

An account which is a viewer for a handle can get the decrypted value of a
handle with the
[`decrypt` method of the SDK](/references/js-sdk/methods/decrypt).

:::

## Checking Viewers

The Nox protocol smart contract provides a function to check if a specific
address is a viewer for a given handle:

```solidity
function isViewer(bytes32 handle, address account) external view returns (bool);
```

**`isViewer` ABI:**

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
        "name": "viewer",
        "type": "address"
      }
    ],
    "name": "isViewer",
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
 * `isViewer` ABI fragment
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
        name: 'viewer',
        type: 'address',
      },
    ],
    name: 'isViewer',
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
const isViewer: boolean = await noxContract.isViewer(handle, account);
```

```ts twoslash [viem]
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains'; // or arbitrumSepolia

const handle = '0xHandle';
const viewerAddress = '0xViewerAddress';

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
 * `isViewer` ABI fragment
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
        name: 'viewer',
        type: 'address',
      },
    ],
    name: 'isViewer',
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
const isViewer = await publicClient.readContract({
  address: NOX_CONTRACT_ADDRESS,
  abi: NOX_CONTRACT_ABI,
  functionName: 'isViewer',
  args: [handle, viewerAddress],
});
```

:::

## Adding Viewers

The Nox protocol smart contract provides a function for admins to add a specific
address as a viewer for a given handle:

::: info

Only allowed admins can add viewers. (see
[Manage Admins](/guides/manage-handle-access/admins) guide for more details on
admins management).

:::

::: warning

Once added, a viewer cannot be removed.

This is by design: once a viewer has been granted access, they can decrypt the
handle at any time. Revoking on-chain permission would give a false sense of
security — the viewer may have already decrypted and stored the data locally via
the Handle Gateway.

:::

```solidity
function addViewer(bytes32 handle, address account) external;
```

**`addViewer` ABI:**

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
        "name": "viewer",
        "type": "address"
      }
    ],
    "name": "addViewer",
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
const viewerAddress = '0xViewerAddress';

/**
 * Nox protocol contract address (Ethereum Sepolia).
 * Arbitrum Sepolia: 0xd464B198f06756a1d00be223634b85E0a731c229
 *
 * See the /networks page for all deployments.
 */
const NOX_CONTRACT_ADDRESS: `0x${string}` =
  '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf';

/**
 * `addViewer` ABI fragment
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
        name: 'viewer',
        type: 'address',
      },
    ],
    name: 'addViewer',
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
const tx = await noxContract.addViewer(handle, viewerAddress);
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
const viewerAddress = '0xViewerAddress';

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
 * `addViewer` ABI fragment
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
        name: 'viewer',
        type: 'address',
      },
    ],
    name: 'addViewer',
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
  functionName: 'addViewer',
  args: [handle, viewerAddress],
});
```

:::

## Isolating Access via a New Handle

There is no on-chain revoke for viewer access. For use cases that require access
isolation (e.g. end of a regulatory audit), the recommended pattern is to
migrate to a fresh handle:

1. Create a new handle with the same value —
   `Nox.add(existingHandle, Nox.toEuint256(0))` produces a new handle with a
   fresh ACL. Use the matching converter for other types (`Nox.toEuint16`,
   `Nox.toEbool`, etc.).
2. Update your contract's storage to point to the new handle.
3. Grant access only to the addresses that should retain access on the new
   handle.

The old handle remains accessible to previous viewers, but is no longer used by
your application.

::: info

This pattern costs extra gas and does not destroy the ciphertext on the Handle
Gateway. It is an application-level isolation, not a cryptographic revoke.

:::
