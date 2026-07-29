// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ISafe} from "./interfaces/ISafe.sol";

/**
 * @title TestamentModule
 * @notice The only bridge between TestamentRegistry and a Safe, and the place a Safe records
 *         who is allowed to write its will.
 *
 * A Safe owner enables this module once, then the Safe authorizes exactly one writer. Both
 * are Safe transactions, so both clear the Safe's own threshold. From then on the registry,
 * and only the registry, can make that Safe pay the beneficiaries of a testament written by
 * that authorized writer.
 *
 * Enabling a Safe module grants it unrestricted spending authority over that Safe, so the
 * mandate recorded here is the only thing standing between an enabled Safe and a stranger's
 * testament. It is checked twice: once when the will is written, and again when it pays out.
 * The second check is the load-bearing one, because it is enforced by the contract that
 * actually holds the spending power rather than by the caller asking it to spend.
 *
 * Every authorize and every revoke bumps a per-Safe nonce, and a testament carries the nonce
 * it was written under. A mandate that has since been withdrawn or handed to someone else
 * therefore cannot be exercised by a will written under the old one.
 *
 * The registry address is immutable, so an enabled module can never be repointed at a
 * different caller.
 */
contract TestamentModule {
    /**
     * @dev Safe operation code for a plain CALL.
     *      Unit: enum ordinal. sourceRef: safe-smart-account v1.4.1
     *      contracts/libraries/Enum.sol, Operation.Call == 0.
     */
    uint8 private constant OPERATION_CALL = 0;

    /// @dev Entries per batch, bounded by the width of `DistributionResult.paidBitmap`.
    uint256 private constant MAX_RECIPIENTS = 8;

    /// @notice The TestamentRegistry allowed to drive this module.
    address public immutable registry;

    /// @notice The one address each Safe has authorized to write its testament, or zero.
    mapping(address safe => address writer) public authorizedWriter;

    /**
     * @notice How many times a Safe has changed its mandate. Zero means never authorized.
     * @dev uint32 so a testament can carry this value and still fit the registry's record in
     *      two storage slots. Four billion rotations per Safe is not a reachable ceiling.
     */
    mapping(address safe => uint32 nonce) public authorizationNonce;

    /**
     * @notice What a payout actually did, as opposed to what it intended.
     * @dev `distribute` cannot revert on a beneficiary that refuses ETH without stranding
     *      everyone else, so it reports instead. The registry emits these numbers rather
     *      than the total it planned, because a testament that paid three of four heirs
     *      must not go on record as having paid all four.
     */
    struct DistributionResult {
        uint256 amountPaid;
        uint256 amountFailed;
        uint8 successfulTransfers;
        uint8 failedTransfers;
        /// @dev Bit `i` is set when entry `i` of the batch reached its recipient.
        uint8 paidBitmap;
    }

    error RegistryIsZeroAddress();
    error NotRegistry(address caller);
    error LengthMismatch(uint256 recipientCount, uint256 amountCount);
    error TooManyRecipients(uint256 count, uint256 maximum);
    error WriterIsZeroAddress();
    error ModuleNotEnabledOnSafe(address safe);
    error WriterNotAuthorized(address safe, address writer);
    error AuthorizationRotated(address safe, uint32 written, uint32 current);

    event Distributed(address indexed safe, address indexed recipient, uint256 amount);
    /// @notice The Safe could not deliver to this heir. Their share stays in the Safe.
    event DistributionRefused(address indexed safe, address indexed recipient, uint256 amount);
    event WriterAuthorized(address indexed safe, address indexed writer, uint32 nonce);
    event WriterRevoked(address indexed safe, address indexed writer, uint32 nonce);

    constructor(address registryAddress) {
        require(registryAddress != address(0), RegistryIsZeroAddress());
        registry = registryAddress;
    }

    modifier onlyRegistry() {
        require(msg.sender == registry, NotRegistry(msg.sender));
        _;
    }

    // ============ Safe actions ============

    /**
     * @notice Names the single address allowed to write this Safe's testament. The caller is
     *         the Safe itself.
     *
     * @dev `msg.sender` is the Safe only when this runs as the target of a Safe transaction
     *      that already cleared the Safe's threshold, and that is what makes this an
     *      authorization rather than a claim. An owner EOA calling this directly authorizes
     *      a writer for itself and nothing else, which is inert: `authorizeWriter` reverts on
     *      an address with no code, and no testament can name an EOA as its paying Safe.
     *
     *      Requiring the module to be enabled first means a mandate can never be granted on a
     *      Safe that would be unable to honour it. Batch the two calls through MultiSend to
     *      keep it to one signature, `enableModule` first.
     *
     *      Re-authorizing replaces the previous writer and, through the nonce, invalidates
     *      any testament written under the mandate it replaces.
     */
    function authorizeWriter(address writer) external returns (uint32 nonce) {
        require(writer != address(0), WriterIsZeroAddress());

        address safe = msg.sender;
        require(ISafe(safe).isModuleEnabled(address(this)), ModuleNotEnabledOnSafe(safe));

        nonce = ++authorizationNonce[safe];
        authorizedWriter[safe] = writer;

        emit WriterAuthorized(safe, writer, nonce);
    }

    /**
     * @notice Withdraws this Safe's mandate. The caller is the Safe itself.
     * @dev Bumping the nonce is what disarms testaments that already exist: they carry the
     *      old value and can no longer be paid out. Deliberately not gated on the module
     *      still being enabled, so a Safe that has already disabled it can still clean up.
     */
    function revokeWriter() external returns (uint32 nonce) {
        address safe = msg.sender;
        address previousWriter = authorizedWriter[safe];

        nonce = ++authorizationNonce[safe];
        delete authorizedWriter[safe];

        emit WriterRevoked(safe, previousWriter, nonce);
    }

    // ============ Registry actions ============

    /**
     * @notice Sends native ETH from `safe` to each recipient.
     * @param writer The testament's author, as recorded by the registry when it was written.
     * @param nonce The Safe's authorization nonce at that same moment.
     *
     * @dev The mandate is re-checked here, against the Safe's current state, rather than
     *      trusted from the registry's say-so. This module is what holds the Safe's spending
     *      authority, so it is the right place to refuse: a testament whose mandate was
     *      withdrawn or reassigned after it was written cannot pay out, and a registry that
     *      named a Safe nobody authorized gets nothing.
     *
     *      Entries with a zero recipient or a zero amount are padded testament slots and are
     *      skipped, which is how the beneficiary count stays hidden on-chain. Arrays are
     *      index-aligned and always SLOTS long.
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
        address writer,
        uint32 nonce,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyRegistry returns (DistributionResult memory result) {
        require(recipients.length == amounts.length, LengthMismatch(recipients.length, amounts.length));
        // The result reports success as a bitmap, which is one bit per entry, so a batch
        // wider than the bitmap would silently lose its tail.
        require(recipients.length <= MAX_RECIPIENTS, TooManyRecipients(recipients.length, MAX_RECIPIENTS));
        _requireMandate(safe, writer, nonce);

        for (uint256 index; index < recipients.length; ++index) {
            address recipient = recipients[index];
            uint256 amount = amounts[index];
            if (recipient == address(0) || amount == 0) {
                continue;
            }

            bool executed = ISafe(safe).execTransactionFromModule(recipient, amount, "", OPERATION_CALL);
            if (executed) {
                result.amountPaid += amount;
                ++result.successfulTransfers;
                result.paidBitmap |= uint8(1) << uint8(index);
                emit Distributed(safe, recipient, amount);
            } else {
                result.amountFailed += amount;
                ++result.failedTransfers;
                emit DistributionRefused(safe, recipient, amount);
            }
        }
    }

    // ============ Views ============

    /**
     * @notice A Safe's current mandate: who may write its will, and under which nonce.
     * @dev One read for the registry instead of two, and the pair is always consistent.
     */
    function authorizationOf(address safe) external view returns (address writer, uint32 nonce) {
        return (authorizedWriter[safe], authorizationNonce[safe]);
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

    // ============ Internal ============

    function _requireMandate(address safe, address writer, uint32 nonce) private view {
        require(authorizedWriter[safe] == writer, WriterNotAuthorized(safe, writer));
        uint32 currentNonce = authorizationNonce[safe];
        require(currentNonce == nonce, AuthorizationRotated(safe, nonce, currentNonce));
    }
}
