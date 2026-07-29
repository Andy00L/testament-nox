---
url: /guides/manage-handle-access/public-decryption.md
description: Managing public decryption of handles with Nox
---

# Public Decryption

A handle can be made publicly decryptable, allowing anyone to decrypt its value
and use the handle as an input.

::: info

Anyone can get the decrypted value of a publicly decryptable handle with the
[`publicDecrypt` method of the SDK](/references/js-sdk/methods/publicDecrypt).

:::

## Checking Public Decryption

The Nox protocol smart contract provides a function to check if a specific
handle is publicly decryptable:

```solidity
function isPubliclyDecryptable(bytes32 handle) external view returns (bool);
```

**`isPubliclyDecryptable` ABI:**

```json
[
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "handle",
        "type": "bytes32"
      }
    ],
    "name": "isPubliclyDecryptable",
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

/**
 * Nox protocol contract address (Ethereum Sepolia).
 * Arbitrum Sepolia: 0xd464B198f06756a1d00be223634b85E0a731c229
 *
 * See the /networks page for all deployments.
 */
const NOX_CONTRACT_ADDRESS: `0x${string}` =
  '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf';

/**
 * `isPubliclyDecryptable` ABI fragment
 */
const NOX_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'handle',
        type: 'bytes32',
      },
    ],
    name: 'isPubliclyDecryptable',
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
const isPubliclyDecryptable: boolean =
  await noxContract.isPubliclyDecryptable(handle);
```

```ts twoslash [viem]
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains'; // or arbitrumSepolia

const handle = '0xHandle';

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
 * `isPubliclyDecryptable` ABI fragment
 */
const NOX_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'handle',
        type: 'bytes32',
      },
    ],
    name: 'isPubliclyDecryptable',
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
const isPubliclyDecryptable = await publicClient.readContract({
  address: NOX_CONTRACT_ADDRESS,
  abi: NOX_CONTRACT_ABI,
  functionName: 'isPubliclyDecryptable',
  args: [handle],
});
```

:::

## Allowing Public Decryption

The Nox protocol smart contract provides a function for admins to make a handle
publicly decryptable:

::: info

Only allowed admins can make a handle publicly decryptable. (see
[Manage Admins](/guides/manage-handle-access/admins) guide for more details on
admins management).

:::

::: warning

Once a handle is made publicly decryptable, it cannot be reversed.

Anyone can decrypt and store the value once it is public. Revoking public access
would not erase copies already made.

:::

```solidity
function allowPublicDecryption(bytes32 handle) external;
```

**`allowPublicDecryption` ABI:**

```json
[
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "handle",
        "type": "bytes32"
      }
    ],
    "name": "allowPublicDecryption",
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

/**
 * Nox protocol contract address (Ethereum Sepolia).
 * Arbitrum Sepolia: 0xd464B198f06756a1d00be223634b85E0a731c229
 *
 * See the /networks page for all deployments.
 */
const NOX_CONTRACT_ADDRESS: `0x${string}` =
  '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf';

/**
 * `allowPublicDecryption` ABI fragment
 */
const NOX_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'handle',
        type: 'bytes32',
      },
    ],
    name: 'allowPublicDecryption',
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
const tx = await noxContract.allowPublicDecryption(handle);
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
 * `allowPublicDecryption` ABI fragment
 */
const NOX_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'handle',
        type: 'bytes32',
      },
    ],
    name: 'allowPublicDecryption',
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
  functionName: 'allowPublicDecryption',
  args: [handle],
});
```

:::
