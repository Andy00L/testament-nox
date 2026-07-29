# Testament: architecture and decisions

The record of what was verified against source, and why the build diverges from
`TESTAMENT_BUILD_PLAN.md` where it does. Everything here was checked against the Nox
package, the Safe source, or the frozen docs in `inputs/nox-docs/`, never from memory.

---

## SPIKE-1: the decryption path. Resolved, primary option.

The plan called this the highest risk in the project and budgeted a fallback ladder down to
a trusted keeper. It is not needed. The primary path exists and is trustless.

**What the source says.** `@iexec-nox/nox-protocol-contracts@0.2.4` ships:

```solidity
// contracts/sdk/Nox.sol:1220
function publicDecrypt(euint256 handle, bytes calldata decryptionProof)
    internal view returns (uint256 plaintextValue)
{
    bytes memory result = _noxComputeContract().validateDecryptionProof(
        euint256.unwrap(handle),
        decryptionProof
    );
    require(result.length == 32, MalformedDecryptedData(result));
    return uint256(bytes32(result));
}
```

`NoxCompute.validateDecryptionProof` (`contracts/interfaces/INoxCompute.sol:330`) takes a
compact proof, `signature (65 bytes) || decryptedResult (N bytes)`, verifies the Handle
Gateway's signature, and returns the plaintext or reverts.

**The flow that follows from it:**

1. `release(id)` calls `Nox.allowPublicDecryption` on all eight slots. Permissionless once
   the silence has outlasted `interval + grace`.
2. Off-chain, anyone calls the SDK's `publicDecrypt(handle)` and receives
   `{ value, decryptionProof }`.
3. `execute(id, proofs)` calls `Nox.publicDecrypt(slot, proof)` per slot. The signature is
   verified on-chain before a single wei moves.

**Why this matters for the product.** Whoever calls `execute` is a courier, not an
authority. A forged proof is rejected by NoxCompute, so the keeper in `packages/keeper`
holds no privileged position: a beneficiary, a judge, or a stranger can run exactly the
same transaction and get exactly the same result. Fallback A and fallback B from the plan
are not implemented and are not needed, and there is no "trust the keeper" caveat to
document.

Two transactions are unavoidable. The gateway can only decrypt after it observes the
on-chain flag, so `release` and `execute` cannot be one call. That turns out to suit the
demo: the wind falls, then the estate moves.

---

## Divergences from the build plan

### 1. Padding is encrypted client-side, not with `Nox.toEuint256(0)`

**Plan, section 3.3:** `write()` "pads to SLOTS with `Nox.toEuint256(0)`".

**Why that breaks the privacy claim.** The Nox docs are explicit about what that function
is:

> The value you pass here is visible in plain text on-chain, anyone can read it on a block
> explorer.
> `inputs/nox-docs/references_solidity-library_methods_core-primitives_wrap-as-public-handle.md`

Padding that way would publish a plaintext zero for every unused slot, so anyone could read
off exactly how many beneficiaries a will has. That is the thing section 2 of the plan
promises to hide.

**What is built instead.** The client encrypts all eight slot values through the same
`encryptInput` call, real bequests and zeros alike. Every slot arrives as an
`externalEuint256` with a gateway proof, and a padded slot is indistinguishable from a real
one on-chain and in the request pattern. `packages/shared/src/slots.ts` produces the padding
and `packages/shared/src/nox.ts` sends all eight through the gateway together.

### 2. One packed slot per beneficiary, not two parallel arrays

**Plan, section 3.3:** `euint256[8] beneficiaries` and `euint256[8] sharesBps`.

**What is built:** one `euint256[8] slots`, each plaintext packing
`(uint256(uint160(beneficiary)) << 16) | shareBps`.

**Why.** It halves the Handle Gateway round trips on both the write path (8 encryptions
instead of 16) and the execute path (8 proofs instead of 16). On demo day that is half the
network surface that can fail. It also makes an address/share mismatch structurally
impossible: the pair travels as one value or not at all. The cost is a shift and a mask on
each side, in `packBequest` and in `execute`.

### 3. The module is immutable on the registry, not a per-testament parameter

**Plan, section 3.3:** `write(address safe, address module, ...)`.

**What is built:** `TestamentRegistry` takes the module address in its constructor and
stores it `immutable`. `write` does not accept one.

**Why.** A testament naming an arbitrary contract as its "module" is a needless degree of
freedom in the one place that moves money. Immutable also costs less gas and removes a
storage slot.

**How the two are wired without a setter.** Each holds an immutable reference to the other,
so the module has to know the registry address before the registry exists. Rather than add a
one-shot setter (and with it an owner, and a window where the pair is half-wired), the
deploy script derives the registry's address from the deployer's next nonce, deploys the
module against it, then deploys the registry and asserts the prediction held
(`packages/contracts/lib/deployment.ts`). A wrong prediction fails loudly at deploy time
instead of producing a bricked module.

### 4. No `eaddress`, so addresses are cast (plan risk R3, confirmed)

`encrypted-types@0.0.4` defines `ebool`, `euint16`, `euint256`, `eint16`, `eint256` and
nothing else. Separately, `encryptInput` rejects `address` at runtime:

> Only `bool`, `uint16`, `uint256`, `int16`, and `int256` are currently supported at runtime.
> `inputs/nox-docs/references_js-sdk_methods_encryptInput.md`

So the uint256 cast the plan proposed as a fallback is in fact the only option.

### 5. Over-allocated shares are capped, not reverted

Shares are encrypted, so the contract cannot check that they sum to 10000 at write time.
The client enforces it (`packBequests`), but the client is not a security boundary.

`execute` therefore carries a running `remainingBps` budget and clamps each share to what is
left. A malformed will under-distributes; it can never over-distribute, and it can never
brick itself into an unexecutable state by reverting forever.

### 6. Next.js and Bun, not Vite and pnpm

`SKILL_GENERAL.md` section 4.1 requires Next.js App Router and Bun for any new frontend and
forbids Vite; the build plan named Vite and pnpm. The conflict was raised and the standards
were confirmed as governing. The contracts package still runs Hardhat 3, installed by Bun.

### 7. No RainbowKit

The plan named RainbowKit. Its modal is one of the most recognisable pieces of UI in the
ecosystem, which is the opposite of what a product whose whole argument is "this looks like
nothing else" wants in its nav. `packages/web` uses wagmi directly with a connect control
drawn in the product's own material, and treats the WalletConnect project id as optional so
a missing key degrades one connector rather than the app.

---

## The shape of the system

```
Owner ──write()──▶ TestamentRegistry            (Nox confidential, Sepolia)
                     8 encrypted slots, ACL: allowThis + allow(owner) + addViewer(owner)
Owner ──heartbeat()─▶ resets lastHeartbeat. Accepted late, as long as nobody released.

  silence > interval + grace
        │
Anyone ──release()──▶ allowPublicDecryption on all 8 slots
        │
   off-chain: SDK publicDecrypt(slot) per slot ──▶ 8 gateway-signed proofs
        │
Anyone ──execute(id, proofs)──▶ Nox.publicDecrypt verifies each proof on-chain
                                 snapshots safe.balance once
                                 ──▶ TestamentModule.distribute
                                      ──▶ Safe.execTransactionFromModule per heir
```

The registry never holds funds. The Safe is never modified: it enables one module, once.

## What is hidden, and what is not

Hidden until release: who the beneficiaries are, what each one gets, and how many there
are. Visible from the start: that an address wrote a testament, which Safe it points at,
the heartbeat cadence, and every heartbeat's timing. After release the will is public by
construction, because paying a plain address is a public act.

The interval and grace are deliberately public. Encrypting them would mean the contract
could not evaluate its own release condition without a decryption round trip on every check.

## Package layout

| Package | What it is |
| --- | --- |
| `packages/contracts` | `TestamentRegistry`, `TestamentModule`, `ISafe`, test doubles, Hardhat 3, deploy and e2e scripts |
| `packages/shared` | The slot codec, testament state maths, Nox and Safe helpers, generated ABIs. One compiled form, consumed by all three other packages |
| `packages/keeper` | A permissionless watcher that releases and executes. Holds no authority |
| `packages/web` | Next.js App Router front end: the curtain, the ritual, the door |

`packages/shared` ships TypeScript source rather than a build artifact so the contracts
tests, the keeper and the browser cannot drift onto different copies of the slot codec. The
ABIs in `packages/shared/src/generated/abis.ts` are regenerated from Hardhat artifacts by
`bun run --cwd packages/contracts build`.
