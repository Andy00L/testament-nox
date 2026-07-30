# Testament, the 4-minute demo script

Target runtime 3:40, hard cap 4:00. Spoken voice-over is ~540 words, which reads
naturally at talking speed. One take per scene is enough; the cuts do the pacing.

Style: cold open on the stakes, short sentences, keep moving, never read the screen out
loud. Every claim on camera is backed by something clickable on screen.

## Pre-flight, before recording

- Two browser windows side by side: the app (https://testament-nox-web.vercel.app) and
  Etherscan Sepolia.
- Owner wallet connected (0x1F74…5b8F), Safe funded (0.02 ETH), module already enabled.
- The registry allows one active testament per owner, so free the slot right before
  recording: `cd packages/contracts && bun run revoke:sepolia`.
- Interval 90 s, grace 30 s, so the silence expires during one coffee sip of footage.
- Heir tabs ready: Etherscan on 0x71De…a7f2 and 0xe5aF…F484 balances.
- After filming, restore the long-lived demo testament for judges:
  `cd packages/contracts && bun run write-demo:sepolia`.

## Script

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00 | Black screen, then the roof and curtain fade in. | Billions in crypto are sitting in wallets whose owners died. The keys died with them. The families got nothing. |
| 0:12 | Home page, cursor sweeps the curtain, chimes ring. | This is Testament. It makes sure your Safe outlives you, without telling anyone anything while you're alive. Watch. |
| 0:25 | Click "How it works", scroll the parchment slowly past the five steps. | The idea is one sentence: you write a will, it's encrypted, and the day you stop giving signs of life, it opens itself and your Safe pays your heirs. No lawyer, no notary, no one to trust. |
| 0:45 | Home page, connected. Click "Write the testament". | So let's write one from zero, live, on a real testnet. No staging, no mock data, and you can replay every single step yourself. |
| 1:00 | "Write the testament" page. Type heir 1 address, 60. Add heir 2, 40. | Two heirs. Sixty forty. Here's the trick though: these names and numbers will never touch the blockchain in clear. They're encrypted right here, in my browser, by iExec Nox, before anything leaves this laptop. |
| 1:20 | Fill Safe address, interval 90, grace 30. Camera on the hint "The module is already enabled on this Safe." | The vault is a real Gnosis Safe. Testament never takes my funds. It just gets permission to make the Safe pay, later, if I go silent for too long. Today, silence means ninety seconds. |
| 1:35 | Press the seal. Wallet pops. Confirm. The seal stamps. Click "View the transaction on Etherscan". | Sealed. That's a real transaction on Ethereum Sepolia. And look at what the chain actually stores: eight encrypted slots. Not two. Eight. Nobody can even tell how many heirs I have. |
| 1:55 | Open the shared door link `/porte?id=…` in a second window. The closed door: "The door is closed." | This is the link my heirs get. And this is all they see. The door is closed. The countdown is public, the will is not. My kids know a testament exists. They have no idea what's in it. |
| 2:10 | Back to home. Hold the heartbeat button, the wind rises in the curtain. | Staying alive is one gesture: hold, and the clock resets. Do this once a month in real life. Miss it, and the machine wakes up. |
| 2:22 | Cut card: "90 seconds of silence later…". The door page again, now: "The wind has fallen." | So let's die. Ninety seconds of silence, plus the grace period, and the door unlocks for anyone. Not just heirs. Anyone. Because opening it gives you no power at all. |
| 2:38 | Click "Open the testament". Confirm. State flips to "The door is opening." then the decrypted shares appear. | Now, and only now, the will decrypts. There are the two heirs, sixty forty, straight from the encrypted slots. |
| 2:52 | Click "Trigger the payout". Confirm. "The vault has paid." appears. | One more click and here's my favorite part. The gateway signs a decryption proof for every slot, and the smart contract verifies every single proof on-chain before moving a single wei. Whoever pushes this button is a courier. They can't redirect a cent. |
| 3:12 | Etherscan: the execute transaction, then both heir balances ticking up. | And the Safe just paid. Sixty percent there, forty percent there. Real transactions, real testnet, zero mock data. You can replay every step from the repo. |
| 3:25 | README hero, then the architecture diagram, quick. | Under the hood: two Solidity contracts, a Safe module, iExec Nox for encrypted state and on-chain proof verification, and a full test suite. Built solo for the iExec WTF hackathon. |
| 3:37 | Live site, the curtain, seal on screen. URL and repo on a closing card. | Your Safe will outlive you. Your keys will not. Now there's something for that. Link below. |

## Closing card text

- testament-nox-web.vercel.app
- github.com/Andy00L/testament-nox
- Built on iExec Nox · Ethereum Sepolia

## Recording notes

- Record at 1440p or higher, browser at 100 percent zoom, cursor visible.
- Kill notifications. The chimes are the only sound besides the voice; let them ring once
  at 0:12 and once on the seal.
- The 90-second wait is one hard cut with the caption card; do not speed-ramp footage.
- If a wallet popup stalls a take, keep rolling; cut on the confirm.
