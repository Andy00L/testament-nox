# TESTAMENT - Build Plan
### Confidential on-chain will on Safe, powered by Nox (iExec WTF Hackathon Summer Edition)

One-liner: a dead man's switch for your Safe. Beneficiaries and splits live encrypted in a Nox confidential contract. You send a periodic heartbeat. If silence lasts too long, the protocol decrypts inside the TEE flow and your Safe pays out through a module. Until that moment, nobody knows who inherits or how much. Not even the beneficiaries.

Judge pitch (say this in the video): "Every Safe has a key-person problem. Testament solves it without publishing the will. Nox keeps the succession plan encrypted until the exact moment it must execute."

---

## 1. Hackathon compliance map

| Criterion | How Testament scores it |
|---|---|
| Creativity (3 stars) | Inheritance is a primitive nobody built in the previous VIBE edition or in the suggested targets. Emotional demo, institutional framing (key-person risk for treasuries). |
| Works end-to-end, no mock data (3 stars) | Real Safe on Sepolia, real Nox encrypted handles, real keeper, real payout tx. Demo heartbeat interval is just a short config value (90 s), not a mock. |
| Deployed on ETH Sepolia (2 stars) | TestamentRegistry + TestamentModule deployed and verified on Sepolia. Nox natively targets Sepolia. |
| feedback.md (2 stars) | Skeleton in section 11, filled during the build with real DX notes. |
| 4-min video (2 stars) | Script in section 10. |
| Nox leverage (1 star) | Encrypted external inputs + proofs, encrypted state arrays, ACL (allow / allowThis), public decryption flow, stretch: ERC-7984 confidential payout. |
| UX (1 star) | The curtain scene (section 5) + a guided 3-step flow. |

Rules to respect: declare all pre-existing code in the README (section 12), validate the idea with iExec on Discord before building, publish the repo public, post on X tagging @iEx_ec.

---

## 2. Privacy model (be honest, judges respect it)

Nox provides confidentiality, not anonymity: caller addresses and function calls stay visible on-chain. So:

Hidden until release:
- Who the beneficiaries are (stored as encrypted handles).
- How much each one gets (encrypted split in basis points).
- Whether a given address is a beneficiary (the claim page shows the same neutral state to everyone before release - important UX detail, see 5.6).

Visible (documented as known limitations in README):
- That the owner wrote a testament (their tx to the registry is public).
- Heartbeat cadence and the interval value (kept public for a pragmatic release gate).
- After release, payout transfers are public (inherent to paying plain addresses).

Mitigations built in:
- One shared registry for all users, so beneficiary handles are just anonymous ciphertext pointers in a pool.
- Beneficiary slots padded to a fixed size (8) with encrypted zeros, so the count never leaks.

Stretch mitigation: pay out in an ERC-7984 confidential token (Nox has an ERC20-to-ERC7984 wrapper guide), so even post-mortem amounts stay hidden. Only attempt after Phase 4 is green.

---

## 3. Architecture

```
Owner wallet ──write()/heartbeat()──▶ TestamentRegistry (Nox confidential contract, Sepolia)
                                          │ stores euint256 handles (beneficiaries, shares)
                                          │ ACL: Nox.allowThis + Nox.allow(owner)
Keeper (cron) ──release(id)──▶ registry checks block.timestamp > lastHeartbeat + interval + grace
                                          │ marks handles publicly decryptable / requests decryption
                                          ▼
                              execute() with decrypted values
                                          │
                              TestamentModule (Safe module) ──execTransactionFromModule──▶ Safe pays beneficiaries
```

### 3.1 Confirmed Nox facts (from docs.noxprotocol.io, verified today)
- Package: `@iexec-nox/nox-protocol-contracts`, import `{Nox, euint256, externalEuint256} from ".../contracts/sdk/Nox.sol"`. Solidity `^0.8.27`. Deploys to Ethereum Sepolia with a normal wallet.
- Pattern: client encrypts with the JS SDK (`encryptInput`) and sends a handle + proof. Contract calls `Nox.fromExternal(handle, proof)`, then encrypted ops (`Nox.add`, `Nox.sub`, `safeAdd`, comparisons, `select`).
- THE number one bug per the docs: after every operation producing a new handle, call `Nox.allowThis(x)` and `Nox.allow(x, owner)` before the function returns. Transient access is cleared at end of tx. Put this in CLAUDE.md as a hard rule for the Implémenteur agent.
- JS SDK methods: `encryptInput`, `decrypt`, `publicDecrypt`, `viewACL`.
- Handles are 32-byte pointers, encrypted data lives off-chain, ACL enforced on-chain, compute in Intel TDX TEEs.

### 3.2 The one open technical question (SPIKE-1, do this first)
The release path needs plaintext addresses and shares to execute Safe transfers. The docs have a "Manage Public Decryption" guide; its exact mechanism (on-chain callback vs mark-decryptable + off-chain `publicDecrypt`) must be validated day one with a toy contract:
- Primary: whatever request/callback pattern the public-decryption guide defines, wired so the callback calls `execute()`.
- Fallback A: `release()` marks the handles publicly decryptable, keeper runs SDK `publicDecrypt`, submits plaintexts to `execute()`, contract verifies them against the handles if Nox provides verifiable decryption results.
- Fallback B (demo-only, documented as limitation): keeper is trusted to submit correct plaintexts, `execute()` gated to keeper address. Ship this only if A fails, and say so in feedback.md, iExec loves real DX feedback.
Ask on the iExec Discord the same day; the rules explicitly invite questions.

### 3.3 Contracts

TestamentRegistry.sol (confidential):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

contract TestamentRegistry {
    uint8 constant SLOTS = 8;
    struct Testament {
        address owner;
        address safe;
        address module;
        uint64 interval;      // seconds between heartbeats (public, pragmatic gate)
        uint64 grace;         // extra silence before release
        uint64 lastHeartbeat;
        bool released;
        euint256[SLOTS] beneficiaries; // address cast to uint256, encrypted; unused slots = encrypted 0
        euint256[SLOTS] sharesBps;     // basis points, encrypted; must sum to 10000 client-side
    }
    mapping(uint256 => Testament) public testaments;

    function write(address safe, address module, uint64 interval, uint64 grace,
                   externalEuint256[] calldata benH, bytes[] calldata benP,
                   externalEuint256[] calldata shareH, bytes[] calldata shareP)
        external returns (uint256 id);
    // loops Nox.fromExternal, pads to SLOTS with Nox.toEuint256(0),
    // Nox.allowThis + Nox.allow(owner) on every stored handle, sets lastHeartbeat

    function heartbeat(uint256 id) external;   // onlyOwner, lastHeartbeat = block.timestamp
    function revoke(uint256 id) external;      // onlyOwner, wipes the testament
    function release(uint256 id) external;     // permissionless once expired: triggers decryption per SPIKE-1
    function execute(uint256 id, address[] calldata to, uint256[] calldata bps /* + proof per SPIKE-1 */) external;
    // computes amount_i = safeBalance * bps_i / 10000, calls module.distribute, sets released
}
```

TestamentModule.sol (plain Solidity, standard Safe module):
```solidity
interface ISafe { function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8 operation) external returns (bool); }

contract TestamentModule {
    address public immutable registry;
    modifier onlyRegistry() { require(msg.sender == registry); _; }
    function distribute(address safe, address[] calldata to, uint256[] calldata amounts) external onlyRegistry {
        for (uint i; i < to.length; i++) {
            if (to[i] == address(0) || amounts[i] == 0) continue; // padded slots
            require(ISafe(safe).execTransactionFromModule(to[i], amounts[i], "", 0), "exec failed");
        }
    }
}
```
Notes for the AI:
- Payout v1 = native ETH from the Safe (value transfer, empty data). WETH/ERC-20 = Phase 5. ERC-7984 = stretch.
- Check the Nox Solidity library reference for an `eaddress` type; if it exists, prefer it over the euint256 cast.
- Safe v1.4.1 on Sepolia; the module is enabled on the Safe by the owner (in-app via `@safe-global/protocol-kit`, manual fallback via Safe Transaction Builder).
- The registry never holds funds. The Safe stays untouched, the module is the only bridge. Say this sentence in the video, it is the "clean integration" the brief asks for.

### 3.4 Keeper
`keeper/keeper.ts`: viem script on a cron (every 60 s in demo). Reads active testament ids, calls `release(id)` when `block.timestamp > lastHeartbeat + interval + grace`. Runs locally during the demo, plus a GitHub Actions cron for the hosted version. Anyone can also press "release" in the UI once expired (permissionless = judges can trigger it themselves).

### 3.5 Frontend stack
- Vite + React + TypeScript (fast, no SSR headaches with canvas).
- wagmi v2 + viem, RainbowKit (needs WalletConnect project id).
- Nox JS SDK for encryptInput / decrypt.
- @safe-global/protocol-kit for Safe creation-optional + module enable flow.
- Canvas 2D Verlet physics for the curtain (adapted from the Strings pen), Tone.js for chimes.
- Deployed on Vercel.

---

## 4. Repo structure (pnpm monorepo)

```
testament/
├── requirements.md            <- this file
├── ANTI_SLOP.md               <- design law, read in full before any UI work
├── CLAUDE.md                  <- Thierno's standards + Nox allowThis rule + git ban
├── inputs/
│   ├── nox-docs/              <- doc pages saved as markdown (see section 9)
│   └── inspiration/           <- strings.js from the pen, captures of the Budarina China page
├── packages/
│   ├── contracts/             <- based on iExec-Nox/nox-hardhat-starter
│   │   ├── contracts/{TestamentRegistry.sol, TestamentModule.sol, interfaces/ISafe.sol}
│   │   ├── deploy/ test/ hardhat.config.ts
│   ├── web/
│   │   ├── src/scene/{curtain.ts, wind.ts, audio.ts, seal.ts}
│   │   ├── src/pages/{Home.tsx, Write.tsx, Door.tsx}
│   │   ├── src/lib/{nox.ts, safe.ts, contracts.ts}
│   │   └── public/fonts/
│   └── keeper/keeper.ts
├── feedback.md
└── README.md
```

---

## 5. UI spec - "the curtain" (the part that wins UX + creativity)

### 5.0 Inspiration sources (all of it, explicitly)
1. Marina Budarina, chimes site, China page: https://marinabudarina.github.io/chimes/#home . The reference experience: a painted Chinese roof at the top of the viewport, a full-width curtain of hanging strands beneath it, cursor as wind, ambient sound behind a Play control, a Chinese word with pinyin and meaning as the poetic device (she uses 缘分 Yuánfèn, "a destined meeting"), a serif headline with evocative copy. She was inspired by beaded doorway curtains.
2. Liam Egan, "Strings" pen: https://codepen.io/shubniggurath/pen/xbwOJye . Verlet physics: particle grid pinned at the top, vertical constraints, gravity + damping, pointer applies radial force, grab-and-drag. Budarina herself credits Egan's strings physics, so the two references are one coherent system: his physics, her art direction. CodePen public pens are MIT, credit him in the README.
3. pols.dev ANTI_SLOP.md: the law. Take the design LANGUAGE from Budarina (curtain, roof, wind, word device), never her assets or copy. Redraw everything.

### 5.1 Concept
Testament is a door. In Chinese homes a beaded curtain hangs in the doorway; you pass through it while you live. Your testament is that curtain: each strand is a bequest, the wind is your heartbeat, and the day the wind stops, the curtain falls and the door opens for your heirs.

Hero word device: 传承 (chuánchéng), "what is passed on". Displayed like Budarina does 缘分: hanzi large, pinyin, one-line meaning. Product wordmark stays TESTAMENT.

### 5.2 Design tokens
- Palette (warm, deliberately NOT the blue-charcoal dark default): lacquer near-black `#171210` (background, like aged beam wood), cinnabar `#9E2B25` (the seal, the single strong accent, used almost nowhere else), aged brass `#C9A227` -> `#8A6D1F` (chime strands, gradient with grain), warm ink text `#EAE0CE`, muted tone steps of the background for surfaces. Grain overlay at very low opacity BEHIND content. No pure gradients without noise.
- Type: one characterful display face from Fontshare, self-hosted woff2 (candidates: Gambarino, Sentient, Tanker; render all three on the actual headline and pick, per the anti-slop field notes; do NOT use Clash Display or General Sans). Body: system-ui. Hanzi: Noto Serif SC, self-hosted subset (just the glyphs used).
- No lucide defaults, no pills, no glows, no countdown-box widget, no gradient buttons. ANTI_SLOP.md wins every conflict.

### 5.3 The signature artifact: the curtain scene
Full-viewport hero that owns the fold:
- Top: a hand-drawn SVG painted eave / roof beam (own illustration, inspired by but not copied from the reference; simple silhouette + painted band is enough).
- Hanging from it: the curtain. 24 to 40 strands, each a Verlet chain (from Strings pen: pinned top row, vertical constraints, ~14 segments each, small bead/chime shapes at intervals along the strand). Pointer movement = wind force. Idle: a slow ambient breeze loop.
- Sound: Tone.js, D major pentatonic (D E F# A B), metallic FM synth, note velocity from collision impulse when strands cross. Muted by default, a small "Play" control like the reference. Never autoplay.
- prefers-reduced-motion: curtain renders static, breeze off. Content is NEVER gated on animation (anti-slop law: visible by default).

State drives the scene:
- Healthy (recent heartbeat): warm brass, lively breeze.
- Aging (past 60% of interval): breeze slows, strands desaturate toward cold iron. The scene itself is the countdown. Remaining time shown only as one quiet text line ("le vent tombe dans 3 j 04 h" style), never a DAYS/HRS/MIN widget.
- Released: strands detach and fall out of frame, beads scatter, the doorway behind is revealed open. One-time orchestrated moment.

### 5.4 Screens
1. Home / scene. The curtain + 传承 device + one sentence + one action ("Écrire le testament" or connect). No default hero stack, no button pair.
2. Write flow (the ritual). A vertical scroll-like panel over the scene. Add a beneficiary (address + share in %): a NEW STRAND physically drops into the curtain with a chime, unlabeled (they are anonymous even here in the visual). Set interval + grace. Then the signature moment: SIGN = press a carved seal; a cinnabar stamp mark (custom SVG, slightly imperfect edges) is pressed onto the panel while the wallet signature request opens. Stamp = encrypt inputs via SDK + send `write()` tx. Then a second small step: enable the module on the Safe (protocol-kit tx, or show the Transaction Builder fallback instructions inline).
3. Heartbeat. Press-and-hold the central strand or bell: holding charges a gust (strands lean), releasing sends `heartbeat()` and the gust sweeps the curtain with a pentatonic run. This is the interaction people will screen-record.
4. The Door (beneficiary page, /door). Before release: a closed door, the same neutral copy for EVERY visitor ("La porte est fermée."), zero indication of whether the connected wallet is named. After release: the door open, one strand descends carrying the visitor's inheritance if their address matches a decrypted beneficiary, with the payout tx link.
5. Release control: once expired, a quiet "le vent est tombé" state with a permissionless release action (judges can press it).

### 5.5 Anti-slop checklist specific to this build
One signature artifact (the curtain), atmosphere everywhere (lacquer + grain carries down the whole page, never flat fill after the hero), depth (roof / curtain / content layers, content crosses the curtain layer), character display face, one bespoke silhouette (the seal stamp + the eave), treated nav (wordmark + wallet only, floating, no link row), real specificity (real Sepolia addresses, real tx hashes in the UI). Full ANTI_SLOP.md re-check pass before calling the UI done.

### 5.6 Copy rules
Bilingual FR/EN toggle is overkill; ship French UI with English README + video (hackathon is FR-community heavy via DeVinci, judges are iExec). Short lines, active voice, no marketing filler.

---

## 6. Build phases (for the pipeline, with acceptance criteria)

Phase 0 - Setup (Thierno, manual, see section 9). AI starts only when section 9 checklist is green.

Phase 1 - SPIKE-1: decryption path (highest risk, do first).
- Toy contract: store one euint256, gate on a timestamp, run the full public-decryption flow from the docs guide on Sepolia.
- Acceptance: a plaintext value provably obtained post-deadline and consumed by a second function. Decision recorded in ARCHITECTURE.md: primary / fallback A / fallback B.

Phase 2 - Contracts.
- Clone nox-hardhat-starter into packages/contracts, wire hardhat config for Sepolia.
- Implement TestamentRegistry + TestamentModule per 3.3, unit tests (write, heartbeat gates, revoke, release gating, padded slots, allowThis/allow on every handle).
- Deploy + verify on Sepolia (Etherscan API key).
- Acceptance: scripted e2e on Sepolia via hardhat tasks: write -> heartbeat -> expire -> release -> execute -> Safe pays 2 beneficiary EOAs. No frontend yet.

Phase 3 - Safe wiring.
- Enable module on the pre-created Safe (protocol-kit script), fund checks, negative tests (module refuses non-registry caller; execute refuses before expiry; refuses double release).
- Acceptance: payout tx visible on Sepolia Etherscan from the Safe.

Phase 4 - Frontend.
- Scene first (curtain physics + audio + states, standalone with fake local state), then wire chain data (wagmi reads, SDK encryptInput on write, heartbeat tx, door page states).
- Acceptance: full flow clickable on Sepolia against deployed contracts; Lighthouse sanity; reduced-motion path; mobile playable.

Phase 5 - Keeper + hosted e2e.
- keeper.ts + GitHub Actions cron; Vercel deploy; demo config (interval 90 s, grace 30 s via env for the video; sane defaults like 30 d / 7 d otherwise).
- Acceptance: leave the hosted app alone, come back, testament released automatically, door open.

Phase 6 - Polish + deliverables.
- ANTI_SLOP full re-check pass on the UI. README (install, deploy, usage, architecture, privacy model, limitations, Existing work section). feedback.md filled. Video recorded from the script. X post drafted. WETH payout if time. ERC-7984 payout only if everything else is green.

Sécurité agent focus list: module caller gating, re-entrancy on distribute, release/execute idempotence, handle ACL correctness (the allowThis footgun), share sum enforcement client-side + defensive cap on-chain, zero-address padded slots skipped, owner-only heartbeat/revoke.

---

## 7. Testing plan
- Hardhat unit tests for every registry function + module gating.
- One scripted Sepolia e2e task (`pnpm e2e:sepolia`) that runs the whole life cycle with 3 throwaway keys; this doubles as the "works end to end without mock data" proof and as the video rehearsal.
- Frontend: Playwright smoke on the write flow with a mocked wallet only in CI (real wallet in the demo).

---

## 8. Env template

```
# packages/contracts/.env + keeper
SEPOLIA_RPC_URL=            # Alchemy or Infura
DEPLOYER_PRIVATE_KEY=       # fresh throwaway, funded
ETHERSCAN_API_KEY=
SAFE_ADDRESS=               # created in section 9
REGISTRY_ADDRESS=           # after deploy
MODULE_ADDRESS=             # after deploy
DEMO_INTERVAL=90
DEMO_GRACE=30

# packages/web/.env
VITE_WALLETCONNECT_PROJECT_ID=
VITE_SEPOLIA_RPC_URL=
VITE_REGISTRY_ADDRESS=
VITE_MODULE_ADDRESS=
```

---

## 9. What Thierno prepares BEFORE launching the pipeline

Accounts, keys, funds:
1. Three fresh throwaway Sepolia keys: deployer/owner, beneficiary A, beneficiary B. Never reuse real keys.
2. Sepolia ETH, at least ~0.5 total (Alchemy faucet, Google Cloud Web3 faucet, sepolia-faucet pow). Nox tx flow will burn plenty during iteration.
3. Alchemy or Infura account -> SEPOLIA_RPC_URL.
4. Etherscan API key (verification is part of the Sepolia criterion looking clean).
5. WalletConnect Cloud project id (RainbowKit).
6. Vercel account (hosting; the prize even covers a year of hosting).
7. X account ready for the submission post; iExec Discord joined, WTF channel, VALIDATE THE IDEA with them (the rules invite it, do it before coding).

Safe:
8. Create a 1-of-1 Safe on https://app.safe.global (Sepolia) with the owner key. Fund it 0.05-0.1 ETH. Note SAFE_ADDRESS. (In-app Safe creation is a stretch; pre-created is fine and faster.)

Repos and docs into inputs/ (the docs site is marked "under development", so freeze what the agents read):
9. Clone locally: `iExec-Nox/nox-hardhat-starter`, `iExec-Nox/nox-hardhat-plugin` (reference), `safe-global/safe-smart-account` (reference for module interface only).
10. On docs.noxprotocol.io use "Copy page as Markdown for LLMs" and save into `inputs/nox-docs/`: getting-started/hello-world, getting-started/networks, getting-started/use-ai, guides/build-confidential-smart-contracts/hardhat, guides/accept-user-inputs, guides/manage-handle-access/public-decryption (CRITICAL for SPIKE-1), references/solidity-library/getting-started, references/js-sdk/getting-started. Also check the cDeFi wizard (https://cdefi-wizard.iex.ec/) and drop any generated scaffold that looks useful into inputs/.
11. Save the Strings pen JS into `inputs/inspiration/strings.js` + a screen recording / screenshots of the Budarina China page for the design agents.

Design assets:
12. Download woff2 from Fontshare for the 3 display candidates (Gambarino, Sentient, Tanker) into `packages/web/public/fonts/`, plus a Noto Serif SC subset for the hanzi.

Process files at repo root:
13. `requirements.md` = this file. `ANTI_SLOP.md`. Your `CLAUDE.md` standards, with two additions: (a) hard rule "after every Nox operation producing a handle: Nox.allowThis + Nox.allow before return", (b) reminder that the git ban applies: agents print git commands, you run them, and the final push to the public GitHub repo is you.

---

## 10. Demo video script (4:00 max)

- 0:00-0:25 Hook over the curtain scene: "Your Safe can outlive you. Your keys can't. Today, planning for that means publishing your will on-chain. Testament keeps it secret until the moment it must execute."
- 0:25-0:55 How: Nox handles, ACL, TEE, one diagram. "The Safe is never modified. One module, one registry, everything else stays composable."
- 0:55-2:15 Live: write the testament (show the SDK encrypting -> handles in the tx), stamp the seal, enable the module, send a heartbeat (the gust).
- 2:15-3:15 Silence: fast-forward the 90 s interval, keeper fires, release -> decryption -> Safe pays out on Sepolia (show Etherscan), the door opens for the beneficiary, their strand descends.
- 3:15-4:00 Privacy model honesty (what is hidden vs visible), the padded slots detail, feedback.md teaser, repo + live link. End on the curtain falling still.

Record at demo interval 90 s. Rehearse with the `pnpm e2e:sepolia` task first.

---

## 11. feedback.md skeleton (fill with real notes during the build)

- Onboarding: hello-world quality, what was missing, docs marked "under development" and where that hurt.
- The allowThis/allow footgun: how it bit us, error messages quality, suggestion (lint rule or plugin warning).
- Public decryption: how discoverable, how the SPIKE went, callback vs off-chain clarity.
- Hardhat plugin + starter DX, versions, anything broken.
- cDeFi wizard: useful or not for this use case.
- What Nox made easy that fhEVM-style stacks make hard (TEE model), and vice versa.
- Feature wishlist: eaddress type (if absent), encrypted timestamps comparisons for fully hidden deadlines, verifiable public-decryption results for permissionless executors.

---

## 12. README "Existing work" section (required by the rules)

Declare: built during the hackathon on top of iExec-Nox/nox-hardhat-starter (scaffold); curtain physics adapted from Liam Egan's "Strings" CodePen (MIT); visual direction inspired by Marina Budarina's chimes site (design language only, all assets redrawn); Safe module pattern per safe-global/safe-smart-account interfaces. Everything else written during the hackathon.

---

## 13. Risks and fallbacks

- R1 Public decryption mechanics unclear -> SPIKE-1 day one, Discord same day, fallback ladder in 3.2.
- R2 Docs under development / API drift -> pin package versions from the starter's lockfile, freeze docs in inputs/nox-docs.
- R3 No eaddress type -> euint256 cast (address -> uint256), already the default plan.
- R4 Module exec from callback context (gas, msg.sender) -> module gated to registry address only, tested on Sepolia in Phase 3 before any frontend work.
- R5 Sepolia flakiness before deadline -> deploy early (Phase 2), keep addresses stable, record the video as soon as Phase 5 passes, polish after.
- R6 Scene perf on mobile -> cap strands (24 mobile / 40 desktop), 2D canvas only, reduced-motion static render.

---

## 14. Source links (everything referenced)

- Hackathon page: DoraHacks iExec WTF Summer Edition (rules, deliverables, criteria).
- Nox docs: https://docs.noxprotocol.io/getting-started/welcome , /getting-started/hello-world , /getting-started/networks , /getting-started/use-ai , /guides/build-confidential-smart-contracts/hardhat , /guides/accept-user-inputs , /guides/manage-handle-access/public-decryption , /references/solidity-library/getting-started , /references/js-sdk/getting-started
- npm org: https://www.npmjs.com/org/iexec-nox
- Starters: https://github.com/iExec-Nox/nox-hardhat-starter , https://github.com/iExec-Nox/nox-hardhat-plugin
- Wizard: https://cdefi-wizard.iex.ec/
- Safe: https://app.safe.global , https://github.com/safe-global/safe-smart-account
- UI refs: https://marinabudarina.github.io/chimes/#home (China page), https://codepen.io/shubniggurath/pen/xbwOJye (Strings, Liam Egan)
- Zama S3 winners (context/positioning): https://www.zama.org/post/announcing-the-developer-program-mainnet-season-3-winners
- Design law: pols.dev ANTI_SLOP.md (local copy at repo root)
- iExec Discord: https://discord.gg/RXYHBJceMe
