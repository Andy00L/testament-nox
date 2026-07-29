// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/**
 * @title ISafe
 * @notice The two Safe entry points TestamentModule needs. Nothing else.
 * @dev sourceRef: safe-global/safe-smart-account v1.4.1
 *      contracts/base/ModuleManager.sol
 *        - execTransactionFromModule(address,uint256,bytes,Enum.Operation) returns (bool)
 *        - isModuleEnabled(address) returns (bool)
 *      contracts/libraries/Enum.sol
 *        - Operation { Call, DelegateCall }
 *      `Enum.Operation` is ABI-encoded as uint8, so it is declared as uint8 here to keep
 *      this interface free of a Safe source dependency. The selectors are identical.
 *
 *      execTransactionFromModule returns false on a failed inner call instead of
 *      reverting, so every caller must check the returned bool.
 */
interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external returns (bool success);

    function isModuleEnabled(address module) external view returns (bool);
}
