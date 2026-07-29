// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/**
 * @title RejectingReceiver
 * @notice A beneficiary that refuses ETH, for tests only.
 * @dev Proves that a payout the Safe cannot deliver surfaces as SafeExecutionFailed
 *      rather than being silently swallowed. Never deployed outside tests.
 */
contract RejectingReceiver {
    error TransferRefused();

    receive() external payable {
        revert TransferRefused();
    }
}
