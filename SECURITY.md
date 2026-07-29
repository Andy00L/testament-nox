# Security

Testament moves money out of a Safe when its owner stops answering. That is a dangerous
thing to build, and this document is the honest account of what protects it, what does not,
and what is known to be missing.

## This is a testnet demonstration

- **Ethereum Sepolia only.** Nothing here has run on a network where the ETH is worth
  anything, and nothing here should.
- **Unaudited.** No third party has reviewed these contracts. The test suite is thorough
  about the paths it knows to look at, which is not the same thing.
- **Do not use with real funds.**
- **Not legal advice, and not a will.** A testament in this system is a payout instruction
  for one Safe. It has no standing in any jurisdiction and does not replace a legally valid
  will, an executor, or a solicitor.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (the **Security** tab, then
**Report a vulnerability**). That opens a private advisory rather than a public issue, which
matters for anything affecting a funded Safe.

Please include the contract address, the transaction or call sequence, and what an attacker
gains. There is no bounty; this is a hackathon project.

## Supported versions

Only the current `main` is supported. The contracts are immutable, so "patching" always
means deploying a new pair and retiring the old one, and every deployment stands or falls on
its own.

| Version | Supported |
| --- | --- |
| `main`, current deployment | Yes |
| Any previously deployed pair | No, see below |

## Deprecated deployments

An enabled Safe module holds unrestricted spending authority over that Safe for as long as it
stays enabled. Retiring a deployment therefore is not a matter of ignoring an address: every
Safe that enabled the old module has to disable it.

| Contract | Address | Status |
| --- | --- | --- |
| `TestamentRegistry` | `0x53485D9B64032a085c0D3E61A32ffB47639c106C` | Deprecated, do not use |
| `TestamentModule` | `0x8106384a2eD13C727878FA5c401FD1B72965faC8` | Deprecated, **disable it on any Safe that enabled it** |

**Why.** That registry's `write()` accepted any contract address as the paying Safe without
checking that the caller had any relationship to it. Any Safe with that module enabled could
be named by a stranger as the estate paying their own testament, and drained after the
sixty-second minimum interval. The flaw is in deployed bytecode and cannot be patched, only
abandoned.

If you enabled that module on a Safe:

```bash
DISABLE_MODULE_ADDRESS=0x8106384a2eD13C727878FA5c401FD1B72965faC8 \
  bun run --cwd packages/contracts disable-module:sepolia
```

Move the funds out first if the Safe holds anything you care about.

## What the current design guarantees

- **A Safe pays only for a will it authorized.** The Safe enables the module and then names
  one writer, both through Safe transactions that clear its own threshold. `write()` refuses
  anyone else, and `distribute()` re-checks the mandate against the Safe's state at payout,
  so the contract holding the spending power enforces its own precondition.
- **A mandate cannot outlive itself.** Every authorize and revoke bumps a per-Safe nonce, and
  a testament stores the nonce it was written under. Withdrawing or reassigning the mandate
  disarms wills already written.
- **One Safe, one live will.** `activeTestamentOfSafe` stops competing testaments from
  racing over one estate.
- **A mandate does not survive a redeployment.** It lives on one module, and each registry is
  welded to one module at construction, so a new pair starts every Safe at no mandate.
- **Nobody is trusted to decrypt honestly.** `execute()` verifies every gateway decryption
  proof on-chain, so whoever sends the transaction is a courier and not an authority.
- **A refused payment is reported as refused.** The execution event carries planned, paid and
  failed amounts separately.

## Known limitations

These are real and unfixed. They are design gaps, not oversights waiting to be discovered.

- **A mandate is trust in a person, not a spending cap.** Safe's module interface offers no
  limit, so an enabled module can move the Safe's entire native balance. The mandate decides
  whose will it acts on and nothing else. The named writer chooses the heirs and the shares.
- **A failed payment is not recoverable.** A beneficiary that cannot accept ETH is recorded
  and skipped so the rest of the estate still moves, but a testament gets one execution and
  their share simply stays in the Safe with no retry path. A claim-based payout contract
  would fix this and is not built.
- **A beneficiary that burns all the gas can still block the batch.**
  `execTransactionFromModule` offers no gas cap, so this is inherent to the interface. A
  recipient that merely reverts is handled.
- **Release can be front-run.** A late heartbeat and a `release()` can sit in the mempool
  together, and the release can win. The plan then becomes public even though the owner was
  alive. A two-phase release with a challenge window would fix this and is not built.
- **The interval and grace are public.** Encrypting them would mean the contract could not
  evaluate its own release condition without a decryption round trip on every check. Written
  up in [feedback.md](feedback.md).
- **After release the will is public, by construction.** Paying plain addresses is a public
  act. An ERC-7984 confidential payout would fix this and is not built.
- **Onboarding assumes a 1-of-1 Safe.** The scripts and the app build a pre-validated
  signature that only works when a single owner submits the transaction. Multi-owner Safes
  can still enable the module and authorize a writer through the Safe interface, but the
  automated flow here does not collect signatures.
- **The trust root is Intel TDX plus its attestation chain**, not mathematics alone. See
  [Nox's chain of trust](https://docs.noxprotocol.io/protocol/chain-of-trust).
- **Payouts are native ETH only.**

## Reproducibility

Dependency versions are pinned exactly by `bun.lock`, which is committed. Install with
`bun install --frozen-lockfile` to get the same tree the tests and the deployment were built
against; the `package.json` ranges are not what resolves.
