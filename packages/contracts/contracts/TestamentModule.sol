// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ISafe} from "./interfaces/ISafe.sol";

/**
 * @title TestamentModule
 * @notice The only bridge between TestamentRegistry and a Safe.
 *
 * A Safe owner enables this module once. From then on the registry, and only the
 * registry, can make the Safe pay the beneficiaries of an executed testament. The
 * module holds no funds, no encrypted state, and no privileged data: it forwards
 * value transfers and nothing else.
 *
 * The registry address is immutable, so an enabled module can never be repointed
 * at a different caller.
 */
contract TestamentModule {
    /**
     * @dev Safe operation code for a plain CALL.
     *      Unit: enum ordinal. sourceRef: safe-smart-account v1.4.1
     *      contracts/libraries/Enum.sol, Operation.Call == 0.
     */
    uint8 private constant OPERATION_CALL = 0;

    /// @notice The TestamentRegistry allowed to drive this module.
    address public immutable registry;

    error RegistryIsZeroAddress();
    error NotRegistry(address caller);
    error LengthMismatch(uint256 recipientCount, uint256 amountCount);

    event Distributed(address indexed safe, address indexed recipient, uint256 amount);
    /// @notice The Safe could not deliver to this heir. Their share stays in the Safe.
    event DistributionRefused(address indexed safe, address indexed recipient, uint256 amount);

    constructor(address registryAddress) {
        require(registryAddress != address(0), RegistryIsZeroAddress());
        registry = registryAddress;
    }

    modifier onlyRegistry() {
        require(msg.sender == registry, NotRegistry(msg.sender));
        _;
    }

    /**
     * @notice Sends native ETH from `safe` to each recipient.
     * @dev Entries with a zero recipient or a zero amount are padded testament slots
     *      and are skipped, which is how the beneficiary count stays hidden on-chain.
     *      Arrays are index-aligned and always SLOTS long.
     *
     *      A recipient that cannot accept ETH does NOT abort the payout. One heir naming a
     *      contract with a reverting `receive` would otherwise revert the whole batch and
     *      lock every other heir's inheritance in the Safe for good, since a testament gets
     *      exactly one execution. The failure is recorded and the estate keeps moving.
     *
     *      This distinguishes correctly between the two failure modes: Safe reverts with
     *      GS104 when this module is not enabled, which still aborts everything as it must,
     *      and returns false only when the inner transfer itself failed.
     *      sourceRef: safe-smart-account v1.4.1 contracts/base/ModuleManager.sol,
     *      execTransactionFromModule.
     */
    function distribute(
        address safe,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyRegistry {
        require(recipients.length == amounts.length, LengthMismatch(recipients.length, amounts.length));

        for (uint256 index; index < recipients.length; ++index) {
            address recipient = recipients[index];
            uint256 amount = amounts[index];
            if (recipient == address(0) || amount == 0) {
                continue;
            }

            bool executed = ISafe(safe).execTransactionFromModule(recipient, amount, "", OPERATION_CALL);
            if (executed) {
                emit Distributed(safe, recipient, amount);
            } else {
                emit DistributionRefused(safe, recipient, amount);
            }
        }
    }

    /**
     * @notice Whether `safe` has enabled this module. Used by the app before letting an
     *         owner sign a testament, and by the keeper before attempting an execution.
     * @dev Returns false instead of reverting when `safe` is not a Safe (or not a
     *      contract at all), so a mistyped address surfaces as a plain "not enabled"
     *      in the UI rather than an opaque revert.
     */
    function isEnabledOn(address safe) external view returns (bool) {
        (bool succeeded, bytes memory returnData) = safe.staticcall(
            abi.encodeCall(ISafe.isModuleEnabled, (address(this)))
        );
        if (!succeeded || returnData.length != 32) {
            return false;
        }
        return abi.decode(returnData, (bool));
    }
}
