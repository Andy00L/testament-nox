// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/**
 * @title RejectingReceiver
 * @notice A beneficiary that refuses ETH, for tests and for the public retry demo.
 * @dev Proves that a payout the Safe cannot deliver is recorded as a debt rather than
 *      silently swallowed, and that settling it later works. Deployed only by the test suite
 *      and by scripts/demo-retry.ts; never a real beneficiary.
 */
contract RejectingReceiver {
    error TransferRefused();

    /// @notice Whether this heir will take its share. Starts refusing.
    bool public accepts;

    /**
     * @notice Lets the heir change its mind.
     * @dev A refused share is a debt that stays owed, not money lost, so a test needs to be
     *      able to make the refusal stop and prove the retry settles it.
     */
    function setAccepts(bool value) external {
        accepts = value;
    }

    receive() external payable {
        if (!accepts) {
            revert TransferRefused();
        }
    }
}
