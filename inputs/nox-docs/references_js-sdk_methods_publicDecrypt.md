---
url: /references/js-sdk/methods/publicDecrypt.md
description: Decrypt a publicly decryptable handle and get a verifiable proof
---

# publicDecrypt

Decrypts a handle that has been marked as **publicly decryptable** on-chain and
returns the plaintext value along with a signed **decryption proof**. Unlike
[`decrypt`](/references/js-sdk/methods/decrypt), this method does not require
the caller to be in the ACL, anyone can call it as long as the handle is public.

The decryption proof is a signed attestation returned by the Handle Gateway that
can be verified in a smart contract to produce the plaintext value on-chain.
Unlike [`decrypt`](/references/js-sdk/methods/decrypt), `publicDecrypt` does not
involve EIP-712 signatures from the caller.

### What happens under the hood

1. The SDK checks on-chain that the handle is publicly decryptable
   (`isPubliclyDecryptable`).
2. It calls the Handle Gateway's public decryption endpoint.
3. The gateway verifies the on-chain flag, decrypts the value internally via
   KMS, and returns a signed `DecryptionProof`.
4. The SDK extracts the plaintext from the proof and decodes it according to the
   Solidity type embedded in the handle.

## Usage

```ts twoslash
declare global {
  interface Window {
    ethereum: any;
  }
}
import type { Handle } from '@iexec-nox/handle';
declare const handle: Handle<'uint256'>;
// ---cut---
import { createViemHandleClient } from '@iexec-nox/handle';
import { createWalletClient, custom } from 'viem';
import { sepolia } from 'viem/chains'; // or arbitrumSepolia

const walletClient = createWalletClient({
  chain: sepolia, // or arbitrumSepolia
  transport: custom(window.ethereum),
});

const handleClient = await createViemHandleClient(walletClient);

const { value, solidityType, decryptionProof } =
  await handleClient.publicDecrypt(handle);
```

## Parameters

### handle&#x20;

**Type:** `Handle<T>` (a `0x`-prefixed hex string, 32 bytes)

The handle to decrypt. It must be marked as publicly decryptable on-chain and
created on the **same chain** as the one the client is connected to.

```ts twoslash
declare global {
  interface Window {
    ethereum: any;
  }
}
import { createViemHandleClient } from '@iexec-nox/handle';
import type { Handle } from '@iexec-nox/handle';
import { createWalletClient, custom } from 'viem';
import { sepolia } from 'viem/chains'; // or arbitrumSepolia

const walletClient = createWalletClient({
  chain: sepolia, // or arbitrumSepolia
  transport: custom(window.ethereum),
});

const handleClient = await createViemHandleClient(walletClient);
declare const handle: Handle<'uint256'>;
// ---cut---
const { value, solidityType, decryptionProof } =
  await handleClient.publicDecrypt(handle); // [!code focus]
```

::: warning

The handle must be publicly decryptable. If it is not, the method throws an
error. Use [`viewACL`](/references/js-sdk/methods/viewACL) to check the
`isPublic` flag before calling `publicDecrypt`.

:::

## Return Value

```ts
{
  value: boolean | string | bigint;
  solidityType: SolidityType;
  decryptionProof: `0x${string}`;
}
```

### value

**Type:** `boolean | string | bigint`

The decrypted plaintext. The JavaScript type depends on the Solidity type
encoded in the handle:

| Solidity type                | JavaScript type | Example         |
| ---------------------------- | --------------- | --------------- |
| `bool`                       | `boolean`       | `true`          |
| `string`                     | `string`        | `"Hello, Nox!"` |
| `address`, `bytes`, `bytesN` | `string`        | `"0x742d…bEb0"` |
| `uintN`, `intN`              | `bigint`        | `1000n`         |

### solidityType

**Type:** `SolidityType`

The Solidity type decoded from the handle (e.g. `"uint256"`, `"bool"`,
`"address"`).

### decryptionProof

**Type:** `string` (`0x`-prefixed hex string)

A signed proof returned by the Handle Gateway. The proof contains the gateway
signature (65 bytes) concatenated with the ABI-encoded decrypted value. This
proof can be passed to a smart contract to verify the decryption and use the
plaintext value on-chain.

```ts twoslash
declare global {
  interface Window {
    ethereum: any;
  }
}
import { createViemHandleClient } from '@iexec-nox/handle';
import type { Handle, SolidityType } from '@iexec-nox/handle';
import { createWalletClient, custom } from 'viem';
import { sepolia } from 'viem/chains'; // or arbitrumSepolia

const walletClient = createWalletClient({
  chain: sepolia, // or arbitrumSepolia
  transport: custom(window.ethereum),
});

const handleClient = await createViemHandleClient(walletClient);
declare const handle: Handle<SolidityType>;
// ---cut---
const { value, solidityType, decryptionProof } =
  await handleClient.publicDecrypt(handle);

// Pass decryptionProof to a smart contract for on-chain verification
console.log(`${solidityType}:`, value);
console.log('proof:', decryptionProof);
```
