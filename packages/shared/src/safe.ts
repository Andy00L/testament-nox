import { concat, encodeFunctionData, pad, zeroAddress, type Address, type Hex } from "viem";

import { testamentModuleAbi } from "./generated/abis.ts";

/**
 * The Safe entry points Testament drives from off-chain, to enable the module and to read
 * a Safe's configuration before letting an owner sign a will.
 *
 * sourceRef: safe-global/safe-smart-account v1.4.1
 *   contracts/base/ModuleManager.sol   enableModule, isModuleEnabled
 *   contracts/base/OwnerManager.sol    getOwners, getThreshold
 *   contracts/Safe.sol                 nonce, execTransaction
 * `Enum.Operation` is ABI-encoded as uint8: 0 is CALL, 1 is DELEGATECALL.
 */
export const safeManagementAbi = [
  {
    inputs: [{ internalType: "address", name: "module", type: "address" }],
    name: "enableModule",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "module", type: "address" }],
    name: "isModuleEnabled",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "prevModule", type: "address" },
      { internalType: "address", name: "module", type: "address" },
    ],
    name: "disableModule",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "start", type: "address" },
      { internalType: "uint256", name: "pageSize", type: "uint256" },
    ],
    name: "getModulesPaginated",
    outputs: [
      { internalType: "address[]", name: "array", type: "address[]" },
      { internalType: "address", name: "next", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getOwners",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getThreshold",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nonce",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "bytes", name: "data", type: "bytes" },
      { internalType: "uint8", name: "operation", type: "uint8" },
      { internalType: "uint256", name: "safeTxGas", type: "uint256" },
      { internalType: "uint256", name: "baseGas", type: "uint256" },
      { internalType: "uint256", name: "gasPrice", type: "uint256" },
      { internalType: "address", name: "gasToken", type: "address" },
      { internalType: "address payable", name: "refundReceiver", type: "address" },
      { internalType: "bytes", name: "signatures", type: "bytes" },
    ],
    name: "execTransaction",
    outputs: [{ internalType: "bool", name: "success", type: "bool" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

/** Safe operation code for a plain CALL. sourceRef: contracts/libraries/Enum.sol. */
const SAFE_OPERATION_CALL = 0;

/**
 * Builds the signature blob a Safe accepts when the owner is also the transaction sender.
 *
 * Safe reads `v == 1` as "approved hash", takes the approver address out of `r`, and
 * accepts it when `msg.sender` is that owner. So a 1-of-1 Safe whose owner submits the
 * transaction itself needs no off-chain signing at all.
 * sourceRef: safe-smart-account v1.4.1 contracts/Safe.sol, checkNSignatures, the
 * `else if (v == 1)` branch and its GS025 require.
 */
export function encodePrevalidatedSignature(ownerAddress: Address): Hex {
  return concat([
    pad(ownerAddress, { size: 32 }),
    pad("0x00", { size: 32 }),
    "0x01",
  ]);
}

/**
 * The full `execTransaction` argument tuple that enables a module on a Safe.
 * Enabling a module is a Safe self-call: `to` is the Safe itself.
 */
export function buildEnableModuleTransaction(
  safeAddress: Address,
  moduleAddress: Address,
  ownerAddress: Address,
) {
  return {
    address: safeAddress,
    abi: safeManagementAbi,
    functionName: "execTransaction",
    args: [
      safeAddress,
      0n,
      encodeFunctionData({
        abi: safeManagementAbi,
        functionName: "enableModule",
        args: [moduleAddress],
      }),
      SAFE_OPERATION_CALL,
      0n,
      0n,
      0n,
      zeroAddress,
      zeroAddress,
      encodePrevalidatedSignature(ownerAddress),
    ],
  } as const;
}

/**
 * The full `execTransaction` argument tuple that names the writer allowed to draw a will on
 * this Safe.
 *
 * Unlike enabling a module, this is not a Safe self-call: the target is the module, because
 * the module reads the Safe out of `msg.sender`. Going through `execTransaction` is the
 * whole point, since that is what proves the Safe's threshold approved the mandate rather
 * than a single owner asserting it.
 */
export function buildAuthorizeWriterTransaction(
  safeAddress: Address,
  moduleAddress: Address,
  writerAddress: Address,
  ownerAddress: Address,
) {
  return {
    address: safeAddress,
    abi: safeManagementAbi,
    functionName: "execTransaction",
    args: [
      moduleAddress,
      0n,
      encodeFunctionData({
        abi: testamentModuleAbi,
        functionName: "authorizeWriter",
        args: [writerAddress],
      }),
      SAFE_OPERATION_CALL,
      0n,
      0n,
      0n,
      zeroAddress,
      zeroAddress,
      encodePrevalidatedSignature(ownerAddress),
    ],
  } as const;
}

/**
 * The sentinel that heads Safe's linked list of enabled modules.
 * sourceRef: safe-smart-account v1.4.1 contracts/base/ModuleManager.sol, SENTINEL_MODULES.
 */
export const SAFE_SENTINEL_MODULES: Address = "0x0000000000000000000000000000000000000001";

/**
 * The `execTransaction` tuple that turns a module off.
 *
 * Safe keeps modules in a linked list, so removing one needs the entry that points at it.
 * Read the list with `getModulesPaginated` and pass the preceding address, or
 * `SAFE_SENTINEL_MODULES` when the module is first in the list.
 * sourceRef: safe-smart-account v1.4.1 contracts/base/ModuleManager.sol, disableModule.
 */
export function buildDisableModuleTransaction(
  safeAddress: Address,
  previousModuleAddress: Address,
  moduleAddress: Address,
  ownerAddress: Address,
) {
  return {
    address: safeAddress,
    abi: safeManagementAbi,
    functionName: "execTransaction",
    args: [
      safeAddress,
      0n,
      encodeFunctionData({
        abi: safeManagementAbi,
        functionName: "disableModule",
        args: [previousModuleAddress, moduleAddress],
      }),
      SAFE_OPERATION_CALL,
      0n,
      0n,
      0n,
      zeroAddress,
      zeroAddress,
      encodePrevalidatedSignature(ownerAddress),
    ],
  } as const;
}

