// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

import {TestamentModule} from "./TestamentModule.sol";

/**
 * @title TestamentRegistry
 * @notice A dead man's switch for a Safe, with the succession plan kept encrypted
 *         until the moment it has to execute.
 *
 * An owner writes a testament: eight encrypted slots, each one packing a beneficiary
 * address together with that beneficiary's share. The registry never sees any of it,
 * it only stores Nox handles. While the owner keeps sending heartbeats the plan stays
 * sealed and readable by the owner alone.
 *
 * Writing is not open to everyone. The Safe that will pay has to enable TestamentModule and
 * then authorize this particular writer, both as Safe transactions that clear the Safe's own
 * threshold. Without that mandate `write` reverts, and one Safe backs at most one live
 * testament at a time. The mandate is checked again at payout, inside the module, so a will
 * cannot outlive the authority it was written under.
 *
 * When the silence outlasts `interval + grace`, anyone can call `release`, which marks
 * the slots publicly decryptable. From that point the plan is public and anyone can
 * fetch a decryption proof from the Handle Gateway and call `execute`, which verifies
 * every proof on-chain before making the Safe pay. There is no trusted keeper: the
 * keeper in this repo is a convenience, not an authority.
 *
 * What stays hidden until release: who inherits, how much each one gets, and how many
 * beneficiaries there are (padded slots are client-side encrypted zeros, so a padded
 * slot is indistinguishable from a real one). What is public from the start: that an
 * owner wrote a testament, which Safe it points at, and the heartbeat cadence.
 */
contract TestamentRegistry is ReentrancyGuard {
    // ============ Constants ============

    /**
     * @notice Beneficiary slots per testament, always written and always read in full.
     * @dev A fixed width is the reason the beneficiary count never leaks. Unused slots
     *      carry a client-side encrypted zero, which costs exactly what a real slot costs
     *      and looks exactly like one on-chain.
     */
    uint256 public constant SLOTS = 8;

    /// @notice Basis points denominator. Unit: bps, 10000 bps == 100%.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Bit width reserved for the share inside a packed slot. Unit: bits.
    uint256 private constant SHARE_BITS = 16;

    /// @dev Mask for the share half of a packed slot. Covers SHARE_BITS bits.
    uint256 private constant SHARE_MASK = 0xFFFF;

    /// @notice Shortest heartbeat interval accepted. Unit: seconds. Low enough for a 90 s demo.
    uint32 public constant MIN_INTERVAL = 60;

    /// @notice Longest heartbeat interval accepted. Unit: seconds.
    uint32 public constant MAX_INTERVAL = 365 days;

    /// @notice Longest extra silence accepted after the interval. Unit: seconds.
    uint32 public constant MAX_GRACE = 30 days;

    // ============ Types ============

    /**
     * @dev `None` stays at zero so an unwritten id reads as absent. `PartiallyExecuted` sits
     *      between `Released` and `Executed` because that is the order a will moves through:
     *      an heir whose wallet refuses ETH leaves the estate mid-settlement, and the record
     *      has to be able to say so instead of claiming a payout that did not happen.
     *      A will never moves backwards.
     */
    enum TestamentState {
        None,
        Active,
        Released,
        PartiallyExecuted,
        Executed,
        Revoked
    }

    /**
     * @dev `interval` and `grace` are uint32 seconds (136 years of range) and `authNonce` is
     *      uint32, so the whole record still fits in two storage slots next to the address
     *      fields: owner, interval, grace and state in the first, safe, lastHeartbeat and
     *      authNonce in the second.
     */
    struct Testament {
        address owner;
        uint32 interval;
        uint32 grace;
        TestamentState state;
        address safe;
        uint64 lastHeartbeat;
        uint32 authNonce;
        euint256[SLOTS] slots;
    }

    // ============ Storage ============

    /// @notice The Safe module this registry drives. Set once, at deployment.
    TestamentModule public immutable module;

    /// @notice Id of the last testament written. Ids start at 1, so 0 means "none".
    uint256 public lastTestamentId;

    /// @notice The current unreleased testament of an owner, or 0. One at a time.
    mapping(address owner => uint256 testamentId) public activeTestamentOf;

    /**
     * @notice The current unreleased testament drawn on a Safe, or 0. One at a time.
     * @dev Keyed by the paying Safe and not by the writer, so a Safe can never end up with
     *      several live wills competing over one estate.
     */
    mapping(address safe => uint256 testamentId) public activeTestamentOfSafe;

    mapping(uint256 testamentId => Testament testament) private _testaments;

    /**
     * @notice The last mandate nonce a Safe has already spent on a testament.
     * @dev One authorization buys one will. `write` requires the Safe's current nonce to be
     *      above whatever was spent here, so a mandate cannot be reused to draw a second will
     *      after the first is revoked or paid out. The Safe simply authorizes again.
     */
    mapping(address safe => uint32 nonce) public consumedAuthNonce;

    /**
     * @notice Slots this testament owes, and slots it has actually paid. Bit `i` is slot `i`.
     * @dev Both are written at execution. A will is finished only when they are equal, which
     *      is what makes a refused heir a retryable debt rather than a rounding error.
     */
    mapping(uint256 testamentId => uint8 slots) public plannedSlots;
    mapping(uint256 testamentId => uint8 slots) public paidSlots;

    /**
     * @dev The settled plan, written once at execution and read by every retry. Persisting it
     *      is what makes a retry safe: the caller supplies nothing but an id and a slot, so
     *      there is no heir, share, amount or proof for them to bend. It also pins each share
     *      to the estate as it stood at execution, so a retry after the Safe has partly
     *      drained still pays what the will actually allocated.
     *
     *      Storing plaintext here leaks nothing: a testament is only executable once released,
     *      and release is the moment the whole plan becomes public by construction.
     */
    mapping(uint256 testamentId => address[SLOTS] recipients) private _plannedRecipients;
    mapping(uint256 testamentId => uint256[SLOTS] amounts) private _plannedAmounts;

    // ============ Errors ============

    error ModuleIsZeroAddress();
    error SafeIsZeroAddress();
    error SafeIsNotAContract(address safe);
    error IntervalOutOfRange(uint32 interval, uint32 minInterval, uint32 maxInterval);
    error GraceOutOfRange(uint32 grace, uint32 maxGrace);
    error SlotCountMismatch(uint256 handleCount, uint256 proofCount, uint256 expected);
    error OwnerAlreadyHasTestament(address owner, uint256 testamentId);
    error SafeAlreadyHasTestament(address safe, uint256 testamentId);
    error WriterNotAuthorized(address safe, address writer);
    error NotOwner(uint256 testamentId, address caller);
    error UnexpectedState(uint256 testamentId, TestamentState actual, TestamentState expected);
    error NotExpiredYet(uint256 testamentId, uint64 deadline, uint64 nowTimestamp);
    error NothingToDistribute(uint256 testamentId, address safe);
    error NoValidBequests(uint256 testamentId);
    error ModuleNotEnabled(address safe);
    error InvalidRange(uint256 fromId, uint256 toId);
    error AuthorizationAlreadyUsed(address safe, uint32 nonce);
    error SlotOutOfRange(uint8 slot, uint256 slotCount);
    error SlotNotPlanned(uint256 testamentId, uint8 slot);
    error SlotAlreadyPaid(uint256 testamentId, uint8 slot);

    // ============ Events ============

    event TestamentWritten(
        uint256 indexed testamentId,
        address indexed owner,
        address indexed safe,
        uint32 interval,
        uint32 grace,
        uint32 authNonce
    );
    event Heartbeat(uint256 indexed testamentId, address indexed owner, uint64 occurredAt);
    event TestamentRevoked(uint256 indexed testamentId, address indexed owner);
    event TestamentReleased(uint256 indexed testamentId, address indexed releasedBy, uint64 occurredAt);
    /**
     * @dev Three numbers, not one. A beneficiary that refuses ETH does not abort the payout,
     *      so what the will allocated and what the Safe actually moved can differ, and the
     *      record has to say which is which.
     */
    event TestamentExecuted(
        uint256 indexed testamentId,
        address indexed executedBy,
        uint256 plannedAmount,
        uint256 paidAmount,
        uint256 failedAmount
    );

    event HeirPaymentSucceeded(
        uint256 indexed testamentId,
        uint8 indexed slot,
        address indexed heir,
        uint256 amount
    );
    event HeirPaymentFailed(
        uint256 indexed testamentId,
        uint8 indexed slot,
        address indexed heir,
        uint256 amount
    );
    /// @notice Some heirs are owed money still sitting in the Safe. Retry is open to anyone.
    event TestamentPartiallyExecuted(
        uint256 indexed testamentId,
        uint256 paidAmount,
        uint256 failedAmount
    );
    /// @notice Every heir the will named has been paid. The estate is settled.
    event TestamentFullyExecuted(uint256 indexed testamentId, uint256 totalPaid);

    // ============ Constructor ============

    constructor(address moduleAddress) {
        require(moduleAddress != address(0), ModuleIsZeroAddress());
        module = TestamentModule(moduleAddress);
    }

    // ============ Owner actions ============

    /**
     * @notice Seals a testament. The caller becomes its owner.
     * @param safe The Safe that will pay out. It must already have TestamentModule enabled
     *        and must have authorized the caller as its writer, both through Safe
     *        transactions. Neither is something the caller can do on the Safe's behalf.
     * @param interval Seconds of silence tolerated between heartbeats.
     * @param grace Extra seconds of silence before anyone may release.
     * @param slotHandles Exactly SLOTS encrypted slots. Each plaintext packs one
     *        beneficiary and one share as `(uint256(uint160(beneficiary)) << 16) | shareBps`.
     *        Unused slots are an encrypted zero produced by the same SDK call as a real one.
     * @param slotProofs The Handle Gateway proof for each slot, index-aligned.
     *
     * @dev The caller must be the wallet that encrypted the slots and must call this
     *      contract directly: Nox binds each input proof to (encrypting wallet, target
     *      contract). sourceRef: docs.noxprotocol.io /references/solidity-library/methods/
     *      core-primitives/fromExternal, "the wallet that encrypts an input must be the
     *      direct caller".
     *
     *      Shares are checked client-side to sum to 10000. On-chain they are encrypted
     *      and cannot be checked here, so `execute` caps the running total instead. A
     *      malformed testament therefore under-distributes, it can never over-distribute.
     */
    function write(
        address safe,
        uint32 interval,
        uint32 grace,
        externalEuint256[] calldata slotHandles,
        bytes[] calldata slotProofs
    ) external returns (uint256 testamentId) {
        require(safe != address(0), SafeIsZeroAddress());
        // A mistyped Safe address would produce a testament that can never execute, and the
        // owner would only find out after their own death. Caught at write time instead.
        require(safe.code.length > 0, SafeIsNotAContract(safe));
        require(
            interval >= MIN_INTERVAL && interval <= MAX_INTERVAL,
            IntervalOutOfRange(interval, MIN_INTERVAL, MAX_INTERVAL)
        );
        require(grace <= MAX_GRACE, GraceOutOfRange(grace, MAX_GRACE));
        require(
            slotHandles.length == SLOTS && slotProofs.length == SLOTS,
            SlotCountMismatch(slotHandles.length, slotProofs.length, SLOTS)
        );

        uint256 existingId = activeTestamentOf[msg.sender];
        require(existingId == 0, OwnerAlreadyHasTestament(msg.sender, existingId));

        uint256 existingSafeId = activeTestamentOfSafe[safe];
        require(existingSafeId == 0, SafeAlreadyHasTestament(safe, existingSafeId));

        // A Safe can grant a mandate and later disable the module. Catching that here keeps
        // wills that could never be paid out of the registry, instead of letting the owner
        // find out years after they stopped being able to do anything about it.
        require(module.isEnabledOn(safe), ModuleNotEnabled(safe));

        // The Safe's own mandate, granted by a Safe transaction that cleared its threshold.
        // Enabling a module hands it unrestricted spending authority, so without this check
        // any stranger could name any module-enabled Safe as the estate paying their will.
        (address mandatedWriter, uint32 authNonce) = module.authorizationOf(safe);
        require(mandatedWriter == msg.sender, WriterNotAuthorized(safe, msg.sender));
        // One authorization buys one will. Spending it here means a Safe whose testament was
        // revoked or settled has to say yes again before another can be drawn on it.
        require(
            authNonce > consumedAuthNonce[safe],
            AuthorizationAlreadyUsed(safe, authNonce)
        );

        testamentId = ++lastTestamentId;
        Testament storage testament = _testaments[testamentId];
        testament.owner = msg.sender;
        testament.safe = safe;
        testament.interval = interval;
        testament.grace = grace;
        testament.lastHeartbeat = uint64(block.timestamp);
        testament.authNonce = authNonce;
        testament.state = TestamentState.Active;

        for (uint256 index; index < SLOTS; ++index) {
            euint256 slot = Nox.fromExternal(slotHandles[index], slotProofs[index]);
            // Every handle this contract intends to keep must have its access persisted
            // before the transaction ends. Handles start with transient access only, so
            // skipping allowThis would leave the registry unable to release its own slots.
            // sourceRef: docs.noxprotocol.io /guides/manage-handle-access/transient-access
            Nox.allowThis(slot);
            // The owner stays admin of their own will, and viewer so the app can decrypt
            // and show it back to them. Both permissions are permanent by design.
            Nox.allow(slot, msg.sender);
            Nox.addViewer(slot, msg.sender);
            testament.slots[index] = slot;
        }

        activeTestamentOf[msg.sender] = testamentId;
        activeTestamentOfSafe[safe] = testamentId;
        consumedAuthNonce[safe] = authNonce;
        emit TestamentWritten(testamentId, msg.sender, safe, interval, grace, authNonce);
    }

    /**
     * @notice Resets the silence clock. Owner only.
     * @dev Accepted even past the deadline, as long as nobody has released yet: coming
     *      back late is exactly the case a dead man's switch must forgive.
     */
    function heartbeat(uint256 testamentId) external {
        Testament storage testament = _requireOwnedAndActive(testamentId);
        testament.lastHeartbeat = uint64(block.timestamp);
        emit Heartbeat(testamentId, msg.sender, uint64(block.timestamp));
    }

    /**
     * @notice Cancels a testament for good. Owner only.
     * @dev Clears the stored handles and frees the owner to write a new testament. The
     *      ciphertext itself lives off-chain and Nox permissions cannot be revoked, but a
     *      revoked testament can never be released, so its slots are never made publicly
     *      decryptable and stay readable by the owner alone.
     */
    function revoke(uint256 testamentId) external {
        Testament storage testament = _requireOwnedAndActive(testamentId);
        testament.state = TestamentState.Revoked;
        delete activeTestamentOf[msg.sender];
        delete activeTestamentOfSafe[testament.safe];

        for (uint256 index; index < SLOTS; ++index) {
            testament.slots[index] = euint256.wrap(bytes32(0));
        }

        emit TestamentRevoked(testamentId, msg.sender);
    }

    // ============ Permissionless actions ============

    /**
     * @notice Opens the will once the silence has outlasted interval + grace.
     *         Anyone may call this, including a beneficiary or a judge.
     * @dev Marks every slot publicly decryptable. This is irreversible and is the single
     *      moment the plan stops being confidential. The plaintext still has to come back
     *      through `execute`, which verifies it on-chain.
     */
    function release(uint256 testamentId) external {
        Testament storage testament = _testaments[testamentId];
        require(
            testament.state == TestamentState.Active,
            UnexpectedState(testamentId, testament.state, TestamentState.Active)
        );

        uint64 deadline = _deadlineOf(testament);
        require(block.timestamp > deadline, NotExpiredYet(testamentId, deadline, uint64(block.timestamp)));

        testament.state = TestamentState.Released;

        for (uint256 index; index < SLOTS; ++index) {
            Nox.allowPublicDecryption(testament.slots[index]);
        }

        emit TestamentReleased(testamentId, msg.sender, uint64(block.timestamp));
    }

    /**
     * @notice Pays the beneficiaries out of the Safe. Anyone may call this.
     * @param decryptionProofs One Handle Gateway decryption proof per slot, index-aligned,
     *        obtained off-chain with the SDK once the testament is released.
     *
     * @dev Every proof is verified on-chain by `Nox.publicDecrypt`, which forwards to
     *      `NoxCompute.validateDecryptionProof` and reverts on a bad signature. The caller
     *      supplies the transport, never the trust.
     *      sourceRef: package "iexec-nox/nox-protocol-contracts", contracts/sdk/Nox.sol,
     *      publicDecrypt(euint256,bytes).
     *
     *      The Safe balance is snapshotted once, before any transfer, so every share is
     *      computed against the same estate. Reading it per iteration would shrink the
     *      estate as the payouts land and short-change the later beneficiaries.
     *
     *      Division truncates, so a few wei of dust can stay in the Safe. Intentional.
     */
    function execute(uint256 testamentId, bytes[] calldata decryptionProofs) external nonReentrant {
        Testament storage testament = _testaments[testamentId];
        require(
            testament.state == TestamentState.Released,
            UnexpectedState(testamentId, testament.state, TestamentState.Released)
        );
        require(
            decryptionProofs.length == SLOTS,
            SlotCountMismatch(SLOTS, decryptionProofs.length, SLOTS)
        );

        address safe = testament.safe;
        uint256 estateValue = safe.balance;
        // An empty Safe is recoverable: leave the testament released so execution can be
        // retried once it is funded, rather than burning the one execution it gets.
        require(estateValue > 0, NothingToDistribute(testamentId, safe));

        (
            address[] memory recipients,
            uint256[] memory amounts,
            uint256 totalPlanned,
            uint8 planned
        ) = _decryptAndPlan(testament, estateValue, decryptionProofs);

        // Eight encrypted zeros, or eight zero shares, decrypt to a will that pays nobody.
        // Spending the single execution on that would record a payout that never happened
        // and leave a funded Safe behind a spent testament, so it refuses instead.
        require(totalPlanned > 0, NoValidBequests(testamentId));
        plannedSlots[testamentId] = planned;
        _storePlan(testamentId, recipients, amounts);

        // Effects before interactions: leaving Released here means a beneficiary that calls
        // back in cannot start a second settlement of the same estate, quite apart from the
        // reentrancy guard. The final state depends on what the Safe manages to pay.
        testament.state = TestamentState.PartiallyExecuted;

        // The module checks the mandate again, against the Safe's state right now, and
        // reverts if it has been withdrawn or reassigned since this will was written. What
        // comes back is which heirs the Safe actually reached, slot by slot.
        TestamentModule.DistributionResult memory result = module.distribute(
            safe,
            testament.owner,
            testament.authNonce,
            recipients,
            amounts
        );

        (uint256 paidAmount, uint256 failedAmount) = _recordSlotResults(
            testamentId,
            planned,
            result.paidBitmap,
            recipients,
            amounts
        );

        emit TestamentExecuted(testamentId, msg.sender, totalPlanned, paidAmount, failedAmount);
        _concludeSettlement(testamentId, testament, paidAmount, failedAmount);
    }

    /**
     * @notice Pays one heir that a settled will still owes. Anyone may call this.
     *
     * @dev Takes nothing but an id and a slot. The heir, the share and the amount all come
     *      from what `execute` decrypted, verified and wrote down, so a caller has no heir
     *      address to redirect, no share to inflate, no proof to forge and no way to pay a
     *      slot twice. Their only power is to spend gas on someone else's behalf.
     *
     *      The reentrancy guard is load-bearing here rather than decorative: the slot is
     *      marked paid after the transfer returns, so a recipient that calls back in before
     *      that would otherwise be paid twice out of the same debt.
     */
    function retryPayment(uint256 testamentId, uint8 slot) external nonReentrant {
        Testament storage testament = _testaments[testamentId];
        require(
            testament.state == TestamentState.PartiallyExecuted,
            UnexpectedState(testamentId, testament.state, TestamentState.PartiallyExecuted)
        );
        require(slot < SLOTS, SlotOutOfRange(slot, SLOTS));

        uint8 bit = uint8(1) << slot;
        uint8 planned = plannedSlots[testamentId];
        require(planned & bit != 0, SlotNotPlanned(testamentId, slot));
        require(paidSlots[testamentId] & bit == 0, SlotAlreadyPaid(testamentId, slot));

        // One filled entry in a full-width batch, so the module's bitmap still lines up with
        // slot numbers and every other heir is left alone.
        address[] memory recipients = new address[](SLOTS);
        uint256[] memory amounts = new uint256[](SLOTS);
        recipients[slot] = _plannedRecipients[testamentId][slot];
        amounts[slot] = _plannedAmounts[testamentId][slot];

        TestamentModule.DistributionResult memory result = module.distribute(
            testament.safe,
            testament.owner,
            testament.authNonce,
            recipients,
            amounts
        );

        (uint256 paidAmount, uint256 failedAmount) = _recordSlotResults(
            testamentId,
            planned,
            result.paidBitmap,
            recipients,
            amounts
        );

        _concludeSettlement(testamentId, testament, paidAmount, failedAmount);
    }

    // ============ Views ============

    /// @notice Timestamp after which `release` is allowed. Unit: seconds since epoch.
    function deadlineOf(uint256 testamentId) external view returns (uint64) {
        return _deadlineOf(_testaments[testamentId]);
    }

    /**
     * @notice Everything standing between a released will and its payout, as four booleans.
     * @dev The Safe can walk away at any time, by disabling the module or withdrawing the
     *      mandate, and a will written before that keeps sitting in the registry looking
     *      alive. The interface and the keeper need to be able to say which of those is
     *      wrong without simulating a transaction and reading the revert.
     */
    function executionReadiness(
        uint256 testamentId
    )
        external
        view
        returns (bool moduleEnabled, bool writerAuthorized, bool safeFunded, bool executable)
    {
        Testament storage testament = _testaments[testamentId];
        address safe = testament.safe;
        if (safe == address(0)) {
            return (false, false, false, false);
        }

        moduleEnabled = module.isEnabledOn(safe);
        (address writer, uint32 nonce) = module.authorizationOf(safe);
        writerAuthorized = writer == testament.owner && nonce == testament.authNonce;
        safeFunded = safe.balance > 0;
        // Partially executed counts: the estate still owes heirs, and a retry is open.
        executable =
            (testament.state == TestamentState.Released ||
                testament.state == TestamentState.PartiallyExecuted) &&
            moduleEnabled &&
            writerAuthorized &&
            safeFunded;
    }

    /// @notice Slots this will still owes, as a bitmap. Zero means nothing is outstanding.
    function unpaidSlots(uint256 testamentId) external view returns (uint8) {
        return plannedSlots[testamentId] & ~paidSlots[testamentId];
    }

    /**
     * @notice What one settled slot owes and whether it has been paid.
     * @dev Only meaningful once a will has been executed at least once: before that there is
     *      no plan, because the shares are still encrypted.
     */
    function plannedPaymentOf(
        uint256 testamentId,
        uint8 slot
    ) external view returns (address heir, uint256 amount, bool paid) {
        require(slot < SLOTS, SlotOutOfRange(slot, SLOTS));
        heir = _plannedRecipients[testamentId][slot];
        amount = _plannedAmounts[testamentId][slot];
        paid = paidSlots[testamentId] & (uint8(1) << slot) != 0;
    }

    /// @notice Whether the silence has already outlasted interval + grace.
    function isExpired(uint256 testamentId) external view returns (bool) {
        Testament storage testament = _testaments[testamentId];
        if (testament.state != TestamentState.Active) {
            return false;
        }
        return block.timestamp > _deadlineOf(testament);
    }

    /**
     * @notice The public half of a testament. The encrypted half is in `slotsOf`.
     * @dev `authNonce` comes last so positional readers written against the previous shape
     *      keep working. Compare it with the module's current nonce for the Safe to know
     *      whether this will can still be paid out.
     */
    function testamentOf(
        uint256 testamentId
    )
        external
        view
        returns (
            address owner,
            address safe,
            uint32 interval,
            uint32 grace,
            uint64 lastHeartbeat,
            TestamentState state,
            uint32 authNonce
        )
    {
        Testament storage testament = _testaments[testamentId];
        return (
            testament.owner,
            testament.safe,
            testament.interval,
            testament.grace,
            testament.lastHeartbeat,
            testament.state,
            testament.authNonce
        );
    }

    /**
     * @notice The raw Nox handles of a testament, in slot order.
     * @dev Returned as bytes32 so the JS SDK can pass them straight to decrypt,
     *      publicDecrypt, or viewACL without unwrapping a custom type.
     */
    function slotsOf(uint256 testamentId) external view returns (bytes32[SLOTS] memory handles) {
        Testament storage testament = _testaments[testamentId];
        for (uint256 index; index < SLOTS; ++index) {
            handles[index] = euint256.unwrap(testament.slots[index]);
        }
    }

    /**
     * @notice Ids in `[fromId, toId]` that are active and past their deadline.
     * @dev One call for the keeper instead of one round trip per testament. Entries are
     *      zero-padded at the end, the caller stops at the first zero.
     */
    function releasableIds(uint256 fromId, uint256 toId) external view returns (uint256[] memory ids) {
        uint256 upperBound = _clampRange(fromId, toId);
        ids = new uint256[](upperBound >= fromId ? upperBound - fromId + 1 : 0);

        uint256 found;
        for (uint256 testamentId = fromId; testamentId <= upperBound; ++testamentId) {
            Testament storage testament = _testaments[testamentId];
            if (testament.state == TestamentState.Active && block.timestamp > _deadlineOf(testament)) {
                ids[found] = testamentId;
                ++found;
            }
        }
    }

    /**
     * @notice Ids in `[fromId, toId]` that are released and still waiting to be paid out.
     * @dev The second half of the keeper's loop. Zero-padded like `releasableIds`.
     */
    function executableIds(uint256 fromId, uint256 toId) external view returns (uint256[] memory ids) {
        uint256 upperBound = _clampRange(fromId, toId);
        ids = new uint256[](upperBound >= fromId ? upperBound - fromId + 1 : 0);

        uint256 found;
        for (uint256 testamentId = fromId; testamentId <= upperBound; ++testamentId) {
            if (_testaments[testamentId].state == TestamentState.Released) {
                ids[found] = testamentId;
                ++found;
            }
        }
    }

    /**
     * @notice Ids in `[fromId, toId]` that paid some heirs and still owe others.
     * @dev The third of the keeper's loops, after releasable and executable. Pair it with
     *      `unpaidSlots` to know which slots to push. Zero-padded like the others.
     */
    function retryableIds(uint256 fromId, uint256 toId) external view returns (uint256[] memory ids) {
        uint256 upperBound = _clampRange(fromId, toId);
        ids = new uint256[](upperBound >= fromId ? upperBound - fromId + 1 : 0);

        uint256 found;
        for (uint256 testamentId = fromId; testamentId <= upperBound; ++testamentId) {
            if (_testaments[testamentId].state == TestamentState.PartiallyExecuted) {
                ids[found] = testamentId;
                ++found;
            }
        }
    }

    // ============ Internal ============

    /**
     * @dev Decrypts every slot, works out who is owed what against one estate snapshot, and
     *      writes the plan down. Split out of `execute` because the two of them together put
     *      more locals on the stack than the EVM can reach.
     *
     *      Division truncates, so a few wei of dust can stay in the Safe. Intentional.
     */
    function _decryptAndPlan(
        Testament storage testament,
        uint256 estateValue,
        bytes[] calldata decryptionProofs
    )
        private
        view
        returns (
            address[] memory recipients,
            uint256[] memory amounts,
            uint256 totalPlanned,
            uint8 planned
        )
    {
        recipients = new address[](SLOTS);
        amounts = new uint256[](SLOTS);
        uint256 remainingBps = BPS_DENOMINATOR;

        for (uint256 index; index < SLOTS; ++index) {
            uint256 packedSlot = Nox.publicDecrypt(testament.slots[index], decryptionProofs[index]);

            address beneficiary = address(uint160(packedSlot >> SHARE_BITS));
            uint256 shareBps = packedSlot & SHARE_MASK;
            if (beneficiary == address(0) || shareBps == 0) {
                // Padded slot, or a slot the owner left empty. Nothing to pay.
                continue;
            }

            // Defensive cap. Shares are validated client-side but are encrypted here, so
            // this is the only place the contract can bound them.
            if (shareBps > remainingBps) {
                shareBps = remainingBps;
            }
            remainingBps -= shareBps;

            uint256 amount = (estateValue * shareBps) / BPS_DENOMINATOR;
            if (amount == 0) {
                // Truncation left this heir nothing. Recording a zero debt would make the
                // will impossible to finish, because a zero transfer is never attempted.
                continue;
            }

            recipients[index] = beneficiary;
            amounts[index] = amount;
            totalPlanned += amount;
            planned |= uint8(1) << uint8(index);
        }
    }

    /**
     * @dev Persists the plan so every retry reads back the same heir and the same amount.
     *      A separate pass from the decryption above, both because writing storage is a
     *      different concern from working out the split, and because the two together put
     *      more locals on the stack than the EVM can reach.
     */
    function _storePlan(
        uint256 testamentId,
        address[] memory recipients,
        uint256[] memory amounts
    ) private {
        for (uint256 index; index < SLOTS; ++index) {
            if (recipients[index] == address(0)) {
                continue;
            }
            _plannedRecipients[testamentId][index] = recipients[index];
            _plannedAmounts[testamentId][index] = amounts[index];
        }
    }

    /**
     * @dev Marks the slots that landed, announces each heir either way, and reports the two
     *      totals for this attempt. Entries left at the zero address are slots this attempt
     *      did not touch, which is how a single-slot retry leaves the rest of the will alone.
     */
    function _recordSlotResults(
        uint256 testamentId,
        uint8 planned,
        uint8 justPaid,
        address[] memory recipients,
        uint256[] memory amounts
    ) private returns (uint256 paidAmount, uint256 failedAmount) {
        uint8 settled = paidSlots[testamentId];

        for (uint256 index; index < SLOTS; ++index) {
            uint8 bit = uint8(1) << uint8(index);
            if (planned & bit == 0 || recipients[index] == address(0)) {
                continue;
            }

            if (justPaid & bit != 0) {
                settled |= bit;
                paidAmount += amounts[index];
                emit HeirPaymentSucceeded(testamentId, uint8(index), recipients[index], amounts[index]);
            } else {
                failedAmount += amounts[index];
                emit HeirPaymentFailed(testamentId, uint8(index), recipients[index], amounts[index]);
            }
        }

        paidSlots[testamentId] = settled;
    }

    /**
     * @dev A will is finished only when every slot it owes has been paid. Until then it stays
     *      partially executed and keeps its hold on the Safe, because the estate still owes
     *      money that is sitting in it.
     */
    function _concludeSettlement(
        uint256 testamentId,
        Testament storage testament,
        uint256 paidAmount,
        uint256 failedAmount
    ) private {
        if (paidSlots[testamentId] != plannedSlots[testamentId]) {
            emit TestamentPartiallyExecuted(testamentId, paidAmount, failedAmount);
            return;
        }

        testament.state = TestamentState.Executed;
        delete activeTestamentOf[testament.owner];
        delete activeTestamentOfSafe[testament.safe];
        emit TestamentFullyExecuted(testamentId, _totalPaidOf(testamentId));
    }

    /// @dev Everything paid across the first execution and every retry since.
    function _totalPaidOf(uint256 testamentId) private view returns (uint256 total) {
        uint8 settled = paidSlots[testamentId];
        for (uint256 index; index < SLOTS; ++index) {
            if (settled & (uint8(1) << uint8(index)) != 0) {
                total += _plannedAmounts[testamentId][index];
            }
        }
    }

    function _clampRange(uint256 fromId, uint256 toId) private view returns (uint256 upperBound) {
        require(fromId >= 1 && fromId <= toId, InvalidRange(fromId, toId));
        return toId > lastTestamentId ? lastTestamentId : toId;
    }

    function _deadlineOf(Testament storage testament) private view returns (uint64) {
        return testament.lastHeartbeat + testament.interval + testament.grace;
    }

    function _requireOwnedAndActive(uint256 testamentId) private view returns (Testament storage testament) {
        testament = _testaments[testamentId];
        require(testament.owner == msg.sender, NotOwner(testamentId, msg.sender));
        require(
            testament.state == TestamentState.Active,
            UnexpectedState(testamentId, testament.state, TestamentState.Active)
        );
    }
}
