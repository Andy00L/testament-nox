# Feedback on Nox, from building Testament

Notes taken while building a confidential on-chain will during the iExec WTF hackathon.
Everything here is something that actually happened during the build, with the file or doc
page that caused it. Versions used: `@iexec-nox/nox-protocol-contracts@0.2.4`,
`@iexec-nox/handle@0.1.0-beta.13`, `@iexec-nox/nox-hardhat-plugin@0.1.0`, Hardhat 3.11.1,
Node 22, Ethereum Sepolia.

---

## The best thing: on-chain verifiable public decryption

The build plan for this project budgeted a whole day for a risk spike on "how does a
contract get a plaintext back", with a fallback ladder ending in a trusted keeper that
submits values the contract has to believe.

None of that was needed, because `Nox.publicDecrypt(euint256, bytes)` already returns a
verified plaintext:

```solidity
// contracts/sdk/Nox.sol:1220
bytes memory result = _noxComputeContract().validateDecryptionProof(
    euint256.unwrap(handle),
    decryptionProof
);
```

This is the single most useful thing in the library for our use case, and it changed the
product: whoever sends the payout transaction is a courier, not an authority. A forged
proof is rejected by NoxCompute, so the keeper holds no privileged position and a
beneficiary can settle the estate themselves.

**Suggestion:** this deserves to be much louder than it currently is. The
`/guides/manage-handle-access/public-decryption` page covers `allowPublicDecryption` and
the JS `publicDecrypt`, and the JS reference mentions in passing that the proof "can be
passed to a smart contract to verify the decryption and use the plaintext value on-chain",
but there is no page showing the Solidity side of that round trip. We found it by reading
`Nox.sol` directly. A short guide, "getting a verified plaintext back into your contract",
with the three-step flow (mark public, fetch proof off-chain, verify on-chain) would save
every team that needs it a day of spiking, and it is a genuine differentiator worth
advertising.

---

## The one that nearly shipped a privacy bug: `toEuint256` on a padded slot

Our design hides how many beneficiaries a will has by always writing eight slots and
padding the unused ones. The obvious way to pad, from inside the contract, is:

```solidity
euint256 emptySlot = Nox.toEuint256(0);   // looks like "an encrypted zero"
```

It is not an encrypted zero in the sense that matters. The docs do say it, clearly, on
`/references/solidity-library/methods/core-primitives/wrap-as-public-handle`:

> The value you pass here is visible in plain text on-chain.

But the function is called `toEuint256`, it returns an `euint256`, and it sits in the same
namespace as every genuinely confidential operation. Reading a contract that calls it,
nothing at the call site suggests the input was published. Padding this way would have
put a plaintext zero on-chain for every unused slot and let anyone count the beneficiaries,
which is precisely the property we were building.

We now encrypt the padding client-side, through the same `encryptInput` call as a real
slot, so a padded slot is indistinguishable on-chain and in the request pattern.

**Suggestions, in order of how much they would have helped:**

1. Rename, or at least alias, to something that carries the warning at the call site:
   `Nox.fromPublicUint256(...)` or `Nox.wrapPublic(...)`. The doc page is already titled
   "Wrap as Public Handle"; the function name is the only place that word is missing.
2. A lint rule or plugin warning when a `to*` result is stored in long-lived state.
3. In the docs, put the warning box above the usage example rather than below the heading.
   The example is what gets copied.

---

## `allowThis` and `allow`: the footgun is real, and the error is not helpful

Transient-by-default access is the right design and the
`/guides/manage-handle-access/transient-access` page explains it well. We still lost time to
it, because the failure is not at the call site.

A handle you forget to `allowThis` looks completely fine in the transaction that creates it.
The failure comes in a *later* transaction, from a different function, and surfaces as a
generic revert. In our case the write path and the release path are days apart in wall
time, which is the worst possible distance between cause and symptom.

**Suggestions:**

1. A distinct, named error from NoxCompute for "the caller has no persistent access to this
   handle", separate from every other failure. Right now diagnosing it means reasoning
   backwards from a plain revert.
2. A view helper on the library, something like `Nox.isPersisted(handle)`, so a test can
   assert the ACL was persisted at write time rather than discovering it at release time.
3. The docs already call this the number one mistake. Consider making the hardhat plugin
   emit a warning at test time when a handle reaches storage without a persistent ACL
   entry, the way a good linter would.

---

## Missing types force an encoding workaround

`encryptInput` accepts `bool`, `uint16`, `uint256`, `int16`, `int256` at runtime.
`address` is listed in `SolidityType` but documented as coming soon, and there is no
`eaddress` in `encrypted-types@0.0.4`.

For a product whose entire secret is a *list of addresses*, that means every beneficiary is
cast to `uint256` by hand. We ended up packing address and share together:

```
(uint256(uint160(beneficiary)) << 16) | shareBps
```

That turned out fine, and it halved our gateway round trips, so we are not unhappy. But it
was a workaround, not a design choice, and the bit-packing lives in three places now
(the client packer, the Solidity unpacker, and the test fixtures).

**Suggestion:** `eaddress` would be the single most valuable type to add next, ahead of the
remaining integer widths. Confidential DeFi is mostly about *who*, not only *how much*.

---

## Toolchain notes

**The starter and the plugin have drifted.** `nox-hardhat-starter`'s
`test/utils/handle-gateway.ts` imports a constant that no longer exists:

```ts
import { HANDLE_GATEWAY_URL } from "@iexec-nox/nox-hardhat-plugin";  // not exported in 0.1.0
```

In plugin 0.1.0 it is a function, `handleGatewayUrl()`, because the host port is assigned by
Docker at boot. Copying the starter's util into a fresh project fails to compile. Worth a
version bump on the starter.

**Docker is a hard requirement and the first run is slow.** Fine once known, but the
hardhat guide's prerequisites list would benefit from a note about image pull time and
about WSL2 specifically, where Docker Desktop needs per-distro integration enabled and the
error message (`docker: could not be found in this WSL 2 distro`) does not point at that
setting.

**Gas is substantial and worth documenting.** Our `write` performs 8 `fromExternal` plus 24
ACL calls (`allowThis`, `allow`, `addViewer` on 8 slots). A rough gas table in the docs,
"what a fromExternal costs, what an allow costs", would let teams size their designs before
building. We chose to pack two values per handle largely to halve this, and we would have
made that decision earlier with published numbers.

**The 100-concurrent `encryptInput` rate limit** is documented and we stayed well under it,
but note that a design like ours (fixed-width padding to hide a count) multiplies encryption
calls by the padding factor, not by the real data size. Padding-for-privacy is a pattern
worth a doc example precisely because of that cost profile.

---

## What Nox made easy that an fhEVM-style stack makes hard

Worth saying plainly, since it drove our choice of primitive:

- **No key management for the developer.** No client-side keypair, no re-encryption dance
  for a user to read their own data. `addViewer(handle, owner)` at write time, and the owner
  reads their own will back with `decrypt`. That is one line where other stacks want a
  protocol.
- **The TEE model means a verifiable plaintext can come back on-chain.** That is the whole
  reason this product's executor can be permissionless. A pure-FHE stack has no equivalent
  of `validateDecryptionProof`, and every design we could think of there ends in either a
  threshold-decryption committee or a trusted relayer.
- **The cost is the trust assumption**, and it should stay stated as plainly as it is:
  Intel TDX plus the attestation chain, not maths alone. The
  `/protocol/chain-of-trust` page is good and we linked it from our own README rather than
  paraphrasing it.

What is harder here than on an fhEVM-style stack: there is no encrypted branching that
resolves on-chain. `select` covers a lot, but any decision that must gate a *state
transition* still needs a plaintext, so release conditions end up public. We kept our
heartbeat interval public for exactly this reason and documented it as a known limitation.

---

## Feature wishlist, ranked by what this product would have used

1. **`eaddress`.** See above.
2. **A Solidity guide for the verified-plaintext round trip.** The capability exists and is
   excellent; it is just hard to find.
3. **Encrypted timestamp comparison that can gate a state transition.** Our deadline is
   public because the contract must evaluate it itself. Being able to keep a release
   condition confidential would let a will hide not just its contents but its schedule.
4. **A named revert for missing persistent ACL access**, and a test-time warning from the
   hardhat plugin.
5. **Published gas costs per primitive.**
6. **A `viewACL` equivalent callable from Solidity in a view**, so a contract can assert its
   own ACL invariants in tests without going off-chain.

---

## Things we expected to be problems and were not

- Deploying a confidential contract with an ordinary wallet and an ordinary Hardhat config.
  No special network, no bridge, no separate deployment step. This is genuinely good.
- `fromExternal` binding a proof to (encrypting wallet, target contract). It caught a real
  mistake in our first draft of the write flow and the revert reason pointed straight at it.
- The local stack matching Sepolia behaviour. Our 41-test suite passes against the Docker
  stack and the same flow then worked on Sepolia unchanged, which is not something we take
  for granted.
