import { createViemHandleClient } from "@iexec-nox/handle";
import { createWalletClient, http, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { TESTAMENT_CHAIN } from "@/lib/chain";

/**
 * A Nox client for reading a released will without connecting a wallet.
 *
 * `publicDecrypt` needs no ACL entry and no EIP-712 signature: once a handle is marked
 * publicly decryptable, anyone may read it. The SDK factory still wants a wallet client, so
 * this builds one over a throwaway key that never signs anything and never holds funds.
 *
 * Requiring a real wallet here would have been a worse lie than the one it prevents: an
 * opened testament is public by construction, and a beneficiary should be able to read what
 * they inherited before deciding to connect anything.
 * sourceRef: docs.noxprotocol.io /references/js-sdk/methods/publicDecrypt, "this method does
 * not require the caller to be in the ACL".
 */
export async function createReadOnlyHandleClient() {
  const throwawayAccount = privateKeyToAccount(generatePrivateKey());
  const readOnlyWallet: WalletClient = createWalletClient({
    account: throwawayAccount,
    chain: TESTAMENT_CHAIN,
    transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  });
  return createViemHandleClient(readOnlyWallet);
}
