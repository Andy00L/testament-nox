---
url: /references/js-sdk/methods/decrypt.md
description: Retrieve the plaintext value from an encrypted handle
---

# decrypt

Requests the original plaintext value associated with an encrypted handle. The
connected wallet must be **authorized by the on-chain ACL** to access the data —
only handle owners or explicitly allowed addresses can decrypt.

Decryption is **gasless**: the SDK authenticates the request with an EIP-712
signature, not an on-chain transaction.

### What happens under the hood

1. The SDK generates an ephemeral RSA keypair and builds an EIP-712 message.
2. Your wallet signs the message (no transaction, no gas).
3. The Handle Gateway verifies the signature and checks the on-chain ACL.
4. The KMS performs **decryption delegation**: it computes the ECIES shared
   secret and RSA-OAEP-encrypts **it** (not the plaintext) with your ephemeral
   RSA public key. The KMS never sees the plaintext.
5. The SDK RSA-decrypts the shared secret locally, derives the AES-256 key via
   HKDF, and decrypts the ciphertext — the plaintext never travels over the
   network.

See [KMS — Decryption delegation](/protocol/kms#decryption-delegation-flow) for
the full cryptographic flow.

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

const { value, solidityType } = await handleClient.decrypt(handle);
```

## Parameters

### handle&#x20;

**Type:** `Handle<T>` (a `0x`-prefixed hex string, 32 bytes)

The handle to decrypt. It must have been created on the **same chain** as the
one the client is connected to.

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
const { value, solidityType } = await handleClient.decrypt(handle); // [!code focus]
```

::: tip Gasless operation

Decryption uses an EIP-712 signature for authentication — it does not submit an
on-chain transaction and costs no gas.

:::

::: warning Access control

The connected wallet must be authorized to decrypt the handle. Authorization is
managed through the on-chain ACL: only the handle owner or addresses explicitly
granted access can request decryption.

:::

::: tip Publicly decryptable handles

For handles that have been marked as **publicly decryptable**, use
[`publicDecrypt`](/references/js-sdk/methods/publicDecrypt) instead. It does not
require ACL authorization or an EIP-712 signature.

:::

## Return Value

```ts
{
  value: boolean | string | bigint;
  solidityType: SolidityType;
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
`"address"`). Useful when you receive a handle without knowing its type ahead of
time.

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
const { value, solidityType } = await handleClient.decrypt(handle);

console.log(`${solidityType}:`, value);
// e.g. "uint256: 1000n" or "bool: true"
```
