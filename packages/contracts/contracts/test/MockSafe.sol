// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/**
 * @title MockSafe
 * @notice The two Safe behaviours TestamentModule depends on, for tests only.
 * @dev Mirrors safe-smart-account v1.4.1 where it matters:
 *      - execTransactionFromModule reverts with GS104 for a caller that is not an
 *        enabled module (contracts/base/ModuleManager.sol, line 88)
 *      - it returns false on a failed inner call instead of reverting, which is why
 *        TestamentModule has to check the returned bool
 *      Never deployed outside tests.
 */
contract MockSafe {
    mapping(address module => bool enabled) private _enabledModules;

    receive() external payable {}

    function enableModule(address module) external {
        _enabledModules[module] = true;
    }

    function disableModule(address module) external {
        _enabledModules[module] = false;
    }

    function isModuleEnabled(address module) external view returns (bool) {
        return _enabledModules[module];
    }

    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external returns (bool success) {
        // GS104 is the Safe revert string for "caller is not an enabled module".
        require(_enabledModules[msg.sender], "GS104");
        require(operation == 0, "MockSafe: only CALL is supported");

        (success, ) = to.call{value: value}(data);
    }
}
