---
url: /references/js-sdk/advanced-configuration.md
description: Advanced configuration for Nox JS SDK
---

# Advanced Configuration

You can customize the SDK by passing a configuration object when creating the
client. These options are for advanced use cases — you won't need them for
standard usage on supported networks.

::: warning Custom / unsupported chains

When targeting an unsupported chain, you must provide **all three** settings:
`gatewayUrl`, `smartContractAddress`, and `subgraphUrl`. Omitting any of them
will result in a non-functional client.

:::

## Usage

```ts twoslash
declare global {
  interface Window {
    ethereum: any;
  }
}
// ---cut---
import { createEthersHandleClient } from '@iexec-nox/handle';
import { BrowserProvider } from 'ethers';

const signer = new BrowserProvider(window.ethereum);

const handleClient = await createEthersHandleClient(signer, {
  gatewayUrl: 'https://nox-gateway.custom.example.com',
  smartContractAddress: '0xCustomNoxContractAddress',
  subgraphUrl: 'https://subgraph.custom.example.com',
});
```

## Parameters

```ts twoslash
import type { HandleClientConfig } from '@iexec-nox/handle';
```

### gatewayUrl&#x20;

**Type:** `string` (base URL without path or query parameters)

The Nox Gateway endpoint URL. The SDK communicates with the Gateway for
encryption and decryption operations.

```ts twoslash
declare global {
  interface Window {
    ethereum: any;
  }
}
// ---cut---
import { createEthersHandleClient } from '@iexec-nox/handle';
import { BrowserProvider } from 'ethers';

const signer = new BrowserProvider(window.ethereum);

const handleClient = await createEthersHandleClient(signer, {
  gatewayUrl: 'https://nox-gateway.custom.example.com', // [!code focus]
});
```

If not provided, the default Nox Gateway URL for the detected network will be
used.

### smartContractAddress&#x20;

**Type:** `string` (Ethereum address)

The address of the Nox protocol contract used for handle verification.

```ts twoslash
declare global {
  interface Window {
    ethereum: any;
  }
}
// ---cut---
import { createEthersHandleClient } from '@iexec-nox/handle';
import { BrowserProvider } from 'ethers';

const signer = new BrowserProvider(window.ethereum);

const handleClient = await createEthersHandleClient(signer, {
  smartContractAddress: '0x123...abc', // [!code focus]
});
```

If not provided, the default contract address for the detected network will be
used.

### subgraphUrl&#x20;

**Type:** `string` (base URL without path or query parameters)

The subgraph endpoint URL used by the SDK to query on-chain data such as Access
Control Lists via [`viewACL`](/references/js-sdk/methods/viewACL).

```ts twoslash
declare global {
  interface Window {
    ethereum: any;
  }
}
// ---cut---
import { createEthersHandleClient } from '@iexec-nox/handle';
import { BrowserProvider } from 'ethers';

const signer = new BrowserProvider(window.ethereum);

const handleClient = await createEthersHandleClient(signer, {
  subgraphUrl: 'https://subgraph.custom.example.com', // [!code focus]
});
```

If not provided, the default subgraph URL for the detected network will be used.

## Supported Networks

The SDK automatically resolves configuration for supported networks based on the
chain ID detected from your provider:

| Network          | Chain ID   |
| ---------------- | ---------- |
| Ethereum Sepolia | `11155111` |
| Arbitrum Sepolia | `421614`   |

::: info Ethereum Sepolia

Code samples in these docs default to **Ethereum Sepolia** (`11155111`). Full
SDK support for it ships with an upcoming `@iexec-nox/handle` release — until
then the SDK auto-resolves configuration for **Arbitrum Sepolia** (`421614`).

:::

To use an unsupported chain, you must provide all three settings: `gatewayUrl`,
`smartContractAddress`, and `subgraphUrl`. Two is not enough for a working
client (features like [`viewACL`](/references/js-sdk/methods/viewACL) require
the subgraph).

## Advanced Usage Examples

::: code-group

```ts twoslash [Ethers.js]
declare const RPC_URL: string;
declare const PRIVATE_KEY: string;
declare const NOX_GATEWAY_URL: `https://${string}`;
declare const NOX_CONTRACT_ADDRESS: `0x${string}`;
declare const NOX_SUBGRAPH_URL: `https://${string}`;
// ---cut---
import { createEthersHandleClient } from '@iexec-nox/handle';
import { JsonRpcProvider, Wallet } from 'ethers';

const provider = new JsonRpcProvider(RPC_URL);
const signer = new Wallet(PRIVATE_KEY, provider);

const handleClient = await createEthersHandleClient(signer, {
  gatewayUrl: NOX_GATEWAY_URL,
  smartContractAddress: NOX_CONTRACT_ADDRESS,
  subgraphUrl: NOX_SUBGRAPH_URL,
});
```

```ts twoslash [Viem]
declare const RPC_URL: string;
declare const PRIVATE_KEY: `0x${string}`;
declare const NOX_GATEWAY_URL: `https://${string}`;
declare const NOX_CONTRACT_ADDRESS: `0x${string}`;
declare const NOX_SUBGRAPH_URL: `https://${string}`;
// ---cut---
import { createViemHandleClient } from '@iexec-nox/handle';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const walletClient = createWalletClient({
  account: privateKeyToAccount(PRIVATE_KEY),
  transport: http(RPC_URL),
});

const handleClient = await createViemHandleClient(walletClient, {
  gatewayUrl: NOX_GATEWAY_URL,
  smartContractAddress: NOX_CONTRACT_ADDRESS,
  subgraphUrl: NOX_SUBGRAPH_URL,
});
```

:::
