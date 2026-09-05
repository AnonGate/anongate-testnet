// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";
import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";
import {IPoseidon2} from "./interfaces/IPoseidon2.sol";
import {IShieldedPool} from "./interfaces/IShieldedPool.sol";
import {IncrementalMerkleTree} from "./lib/IncrementalMerkleTree.sol";

/// @title ShieldedPool
/// @notice Non-custodial privacy pool: one ERC-20 asset, or native ETH when `asset` is address(0).
/// @dev No admin keys. No emergency withdrawal. Proof verification is delegated to immutable verifier contracts.
///      Native mode: deposits via msg.value; gas rebate uses tracked `gasReserveEth` (never user principal).
contract ShieldedPool is IShieldedPool {
    using IncrementalMerkleTree for IncrementalMerkleTree.Data;

    uint256 public constant ROOT_HISTORY_SIZE = 64;
    /// @notice Parts-per-million denominator (1e6). 110 ppm = 0.011%, 400 ppm = 0.04%.
    uint256 public constant FEE_DENOMINATOR = 1_000_000;

    uint32 public immutable depositFeePpm;
    uint32 public immutable withdrawFeePpm;
    uint32 public immutable treeDepth;

    IERC20Minimal public immutable asset;
    IPoseidon2 public immutable poseidon;
    IGroth16Verifier public immutable depositVerifier;
    IGroth16Verifier public immutable withdrawVerifier;
    /// @notice 1-in / 0-out full withdraw verifier (redesign v2).
    IGroth16Verifier public immutable withdraw1Verifier;
    /// @notice 1-in / 1-out partial withdraw + change verifier (redesign v2).
    IGroth16Verifier public immutable withdrawPartialVerifier;
    /// @notice Immutable EOA that receives 100% of protocol fees as they are taken.
    address public immutable feeRecipient;
    /// @notice ETH paid to msg.sender after a successful withdraw path (0 = disabled).
    uint256 public immutable gasRebateWei;
    /// @notice Optional asset tip from reserveFeeBalance after withdraw (0 = disabled).
    uint256 public immutable tokenRebateAmount;

    IncrementalMerkleTree.Data private _tree;

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public totalFeesCollected;
    uint256 public rewardIndex;

    mapping(uint256 => bytes32) public commitments;
    mapping(uint256 => uint256) public commitmentTimestamps;
    mapping(bytes32 => bool) public nullifierSpent;
    bytes32[ROOT_HISTORY_SIZE] private _rootHistory;
    mapping(bytes32 => uint256) private _knownRootOccurrences;
    uint256 public rootHistoryTotalRecorded;

    uint256 public liquidityRewardBalance;
    uint256 public opsFeeBalance;
    uint256 public reserveFeeBalance;
    /// @notice ETH earmarked for Relayer gas rebates only (excluded from user principal).
    uint256 public gasReserveEth;

    error ZeroAmount();
    error EmptyCommitments();
    error InvalidTier();
    error InvalidProof();
    error NullifierAlreadySpent();
    error TransferFailed();
    error InsufficientLiquidity();
    error InvalidFeeData();
    error RewardsNotImplemented();
    error ZeroAddress();
    error NotOpsFeeRecipient();
    error InsufficientOpsFees();
    error InvalidLeafIndex();
    error InvalidTopology();
    error DuplicateNullifier();
    error UnknownMerkleRoot();
    error UnexpectedEthValue();
    error InvalidRootHistoryIndex();

    struct ProofData {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    constructor(
        address asset_,
        address poseidon_,
        address depositVerifier_,
        address withdrawVerifier_,
        address withdraw1Verifier_,
        address withdrawPartialVerifier_,
        uint32 treeDepth_,
        uint32 depositFeePpm_,
        uint32 withdrawFeePpm_,
        address feeRecipient_,
        uint256 gasRebateWei_,
        uint256 tokenRebateAmount_
    ) {
        if (
            poseidon_ == address(0) || depositVerifier_ == address(0)
                || withdrawVerifier_ == address(0) || withdraw1Verifier_ == address(0)
                || withdrawPartialVerifier_ == address(0) || feeRecipient_ == address(0)
        ) {
            revert ZeroAddress();
        }
        // asset_ == address(0) means native ETH pool; token rebate only applies to ERC-20 pools.
        if (asset_ == address(0) && tokenRebateAmount_ != 0) revert InvalidFeeData();
        if (depositFeePpm_ >= FEE_DENOMINATOR || withdrawFeePpm_ >= FEE_DENOMINATOR) {
            revert InvalidFeeData();
        }

        asset = IERC20Minimal(asset_);
        poseidon = IPoseidon2(poseidon_);
        depositVerifier = IGroth16Verifier(depositVerifier_);
        withdrawVerifier = IGroth16Verifier(withdrawVerifier_);
        withdraw1Verifier = IGroth16Verifier(withdraw1Verifier_);
        withdrawPartialVerifier = IGroth16Verifier(withdrawPartialVerifier_);
        feeRecipient = feeRecipient_;
        gasRebateWei = gasRebateWei_;
        tokenRebateAmount = tokenRebateAmount_;

        depositFeePpm = depositFeePpm_;
        withdrawFeePpm = withdrawFeePpm_;
        treeDepth = treeDepth_;

        _tree.initialize(treeDepth_, poseidon);
        _recordRoot(_tree.root);
    }

    /// @notice Fund ETH gas reserve used by gasRebateWei payouts.
    receive() external payable {
        _fundGasReserve();
    }

    /// @notice Explicit ETH top-up for the Relayer gas rebate reserve.
    function fundGasReserve() external payable {
        _fundGasReserve();
    }

    function gasReserveBalance() external view returns (uint256) {
        return gasReserveEth;
    }

    /// @notice True when this pool holds native ETH (asset address is zero).
    function isNativeAsset() external view returns (bool) {
        return address(asset) == address(0);
    }

    function poolAsset() external view returns (address) {
        return address(asset);
    }

    /// @notice Alias kept so existing clients that call `opsFeeRecipient()` still resolve.
    function opsFeeRecipient() external view returns (address) {
        return feeRecipient;
    }

    function feeParameters()
        external
        view
        returns (uint32 depositFeePpm_, uint16 transferFeeBps_, uint32 withdrawFeePpm_)
    {
        // transferFeeBps is permanently 0 — shielded transfer was removed from the protocol.
        return (depositFeePpm, 0, withdrawFeePpm);
    }

    function rewardParameters()
        external
        pure
        returns (uint16 liquidityShareBps, uint16 opsShareBps, uint16 reserveShareBps)
    {
        // Fees are pushed in full to `feeRecipient`; share buckets are unused.
        return (0, 0, 0);
    }

    function currentStateAnchor()
        external
        view
        returns (bytes32 commitmentRoot, uint256 commitmentCount)
    {
        return (_tree.root, _tree.nextIndex);
    }

    function isNullifierSpent(bytes32 nullifier) external view returns (bool) {
        return nullifierSpent[nullifier];
    }

    function isKnownRoot(bytes32 merkleRoot) public view returns (bool) {
        return _knownRootOccurrences[merkleRoot] != 0;
    }

    function knownRootOccurrences(bytes32 merkleRoot) external view returns (uint256) {
        return _knownRootOccurrences[merkleRoot];
    }

    function rootHistoryLength() public view returns (uint256) {
        return
            rootHistoryTotalRecorded < ROOT_HISTORY_SIZE
                ? rootHistoryTotalRecorded
                : ROOT_HISTORY_SIZE;
    }

    /// @notice Returns a retained root by age, where index 0 is the oldest retained root.
    function rootHistoryAt(uint256 index) external view returns (bytes32) {
        uint256 length = rootHistoryLength();
        if (index >= length) revert InvalidRootHistoryIndex();
        uint256 oldestSlot = rootHistoryTotalRecorded <= ROOT_HISTORY_SIZE
            ? 0
            : rootHistoryTotalRecorded % ROOT_HISTORY_SIZE;
        return _rootHistory[(oldestSlot + index) % ROOT_HISTORY_SIZE];
    }

    /// @notice Deposit `amount` and insert commitments whose private values sum to `amount - fee`.
    /// @dev Native pool: `msg.value` must equal `amount`. ERC-20 pool: `msg.value` must be 0.
    ///      `proof` must verify under depositVerifier with publics = [commitments..., netValue].
    function deposit(
        uint256 amount,
        bytes32[] calldata newCommitments,
        uint8 tierCode,
        bytes calldata proof
    ) external payable {
        if (amount == 0) revert ZeroAmount();
        if (newCommitments.length != 1) revert InvalidTopology();
        if (tierCode > 2) revert InvalidTier();

        uint256 fee = (amount * uint256(depositFeePpm)) / FEE_DENOMINATOR;
        uint256 netValue = amount - fee;

        ProofData memory parsed = _parseProof(proof);
        uint256[] memory publics = new uint256[](newCommitments.length + 1);
        for (uint256 i = 0; i < newCommitments.length;) {
            publics[i] = uint256(newCommitments[i]);
            unchecked {
                ++i;
            }
        }
        publics[newCommitments.length] = netValue;
        if (!depositVerifier.verifyProof(parsed.a, parsed.b, parsed.c, publics)) {
            revert InvalidProof();
        }

        _pullDeposit(amount);

        _payFee(fee);

        uint256[] memory indices = new uint256[](newCommitments.length);
        for (uint256 i = 0; i < newCommitments.length;) {
            uint32 index = _tree.insert(newCommitments[i], poseidon);
            _recordRoot(_tree.root);
            commitments[index] = newCommitments[i];
            commitmentTimestamps[index] = block.timestamp;
            indices[i] = index;
            unchecked {
                ++i;
            }
        }

        totalDeposited += amount;
        emit Deposited(msg.sender, amount, fee, indices, newCommitments, tierCode, block.timestamp);
    }

    /// @dev publicFeeData = abi.encode(withdrawFee) only.
    ///      Spent leaf indices are private witnesses inside the ZK proof (membership vs merkleRoot).
    ///      No on-chain withdraw delay — timing privacy is user choice (WITHDRAW_TIMING_POLICY_V1.md).
    ///      Fee must be at least amount * withdrawFeePpm / 1e6 (silent send may pay more).
    function withdraw(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32[] calldata nullifiers,
        address recipient,
        uint256 amount,
        bytes calldata publicFeeData
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (nullifiers.length != 2) revert InvalidTopology();
        if (!isKnownRoot(merkleRoot)) revert UnknownMerkleRoot();

        uint256 fee = abi.decode(publicFeeData, (uint256));
        if (fee > amount) revert InvalidFeeData();
        uint256 minFee = (amount * uint256(withdrawFeePpm)) / FEE_DENOMINATOR;
        if (fee < minFee) revert InvalidFeeData();

        ProofData memory parsed = _parseProof(proof);
        // publics: root, nullifiers[2], recipient, amount, fee
        uint256[] memory publics = new uint256[](6);
        publics[0] = uint256(merkleRoot);
        for (uint256 i = 0; i < nullifiers.length;) {
            if (nullifierSpent[nullifiers[i]]) revert NullifierAlreadySpent();
            for (uint256 j = i + 1; j < nullifiers.length;) {
                if (nullifiers[i] == nullifiers[j]) revert DuplicateNullifier();
                unchecked {
                    ++j;
                }
            }
            publics[1 + i] = uint256(nullifiers[i]);
            unchecked {
                ++i;
            }
        }
        publics[3] = uint256(uint160(recipient));
        publics[4] = amount;
        publics[5] = fee;

        if (!withdrawVerifier.verifyProof(parsed.a, parsed.b, parsed.c, publics)) {
            revert InvalidProof();
        }

        for (uint256 i = 0; i < nullifiers.length;) {
            nullifierSpent[nullifiers[i]] = true;
            unchecked {
                ++i;
            }
        }

        uint256 payout = amount - fee;
        if (_spendableAssetBalance() < amount) revert InsufficientLiquidity();

        _payFee(fee);
        totalWithdrawn += amount;

        _payAsset(recipient, payout);
        emit Withdrawn(recipient, msg.sender, amount, fee, nullifiers);
        _maybeRebateRelayer();
    }

    /// @notice Full withdraw of a single note (1-in / 0-out).
    /// @dev publicFeeData = abi.encode(withdrawFee). Spent leaf index is private in the proof.
    function withdraw1(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32[] calldata nullifiers,
        address recipient,
        uint256 amount,
        bytes calldata publicFeeData
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (nullifiers.length != 1) revert InvalidTopology();
        if (!isKnownRoot(merkleRoot)) revert UnknownMerkleRoot();

        uint256 fee = abi.decode(publicFeeData, (uint256));
        if (fee > amount) revert InvalidFeeData();
        uint256 minFee = (amount * uint256(withdrawFeePpm)) / FEE_DENOMINATOR;
        if (fee < minFee) revert InvalidFeeData();

        ProofData memory parsed = _parseProof(proof);
        // publics: root, nullifier, recipient, amount, fee
        uint256[] memory publics = new uint256[](5);
        publics[0] = uint256(merkleRoot);
        if (nullifierSpent[nullifiers[0]]) revert NullifierAlreadySpent();
        publics[1] = uint256(nullifiers[0]);
        publics[2] = uint256(uint160(recipient));
        publics[3] = amount;
        publics[4] = fee;

        if (!withdraw1Verifier.verifyProof(parsed.a, parsed.b, parsed.c, publics)) {
            revert InvalidProof();
        }

        nullifierSpent[nullifiers[0]] = true;

        uint256 payout = amount - fee;
        if (_spendableAssetBalance() < amount) revert InsufficientLiquidity();

        _payFee(fee);
        totalWithdrawn += amount;

        _payAsset(recipient, payout);
        emit Withdrawn(recipient, msg.sender, amount, fee, nullifiers);
        _maybeRebateRelayer();
    }

    /// @notice Partial withdraw: pay `amount` publicly and insert one change commitment.
    /// @dev Conservation in circuit: inValue === amount + changeValue.
    ///      publicFeeData = abi.encode(withdrawFee). Spent leaf index is private in the proof.
    function withdrawPartial1(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32[] calldata nullifiers,
        address recipient,
        uint256 amount,
        bytes32 outCommitment,
        bytes calldata publicFeeData
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (outCommitment == bytes32(0)) revert EmptyCommitments();
        if (nullifiers.length != 1) revert InvalidTopology();
        if (!isKnownRoot(merkleRoot)) revert UnknownMerkleRoot();

        uint256 fee = abi.decode(publicFeeData, (uint256));
        if (fee > amount) revert InvalidFeeData();
        uint256 minFee = (amount * uint256(withdrawFeePpm)) / FEE_DENOMINATOR;
        if (fee < minFee) revert InvalidFeeData();

        ProofData memory parsed = _parseProof(proof);
        // publics: root, nullifier, recipient, amount, fee, outCommitment
        uint256[] memory publics = new uint256[](6);
        publics[0] = uint256(merkleRoot);
        if (nullifierSpent[nullifiers[0]]) revert NullifierAlreadySpent();
        publics[1] = uint256(nullifiers[0]);
        publics[2] = uint256(uint160(recipient));
        publics[3] = amount;
        publics[4] = fee;
        publics[5] = uint256(outCommitment);

        if (!withdrawPartialVerifier.verifyProof(parsed.a, parsed.b, parsed.c, publics)) {
            revert InvalidProof();
        }

        nullifierSpent[nullifiers[0]] = true;

        uint32 changeIndex = _tree.insert(outCommitment, poseidon);
        _recordRoot(_tree.root);
        commitments[changeIndex] = outCommitment;
        commitmentTimestamps[changeIndex] = block.timestamp;

        uint256 payout = amount - fee;
        if (_spendableAssetBalance() < amount) revert InsufficientLiquidity();

        _payFee(fee);
        totalWithdrawn += amount;

        _payAsset(recipient, payout);
        emit Withdrawn(recipient, msg.sender, amount, fee, nullifiers);
        bytes32[] memory outs = new bytes32[](1);
        outs[0] = outCommitment;
        uint256[] memory indices = new uint256[](1);
        indices[0] = changeIndex;
        emit Transferred(nullifiers, indices, outs, fee);
        _maybeRebateRelayer();
    }

    function claimRewards(bytes calldata, uint256, address, uint8) external pure {
        // MVP: intentionally unimplemented. See MVP_REWARDS_SCOPE_V1.md.
        // Ops fee skim uses withdrawOpsFees — not this path.
        revert RewardsNotImplemented();
    }

    /// @notice Leftover pull path. New pools push fees immediately, so this balance stays 0.
    function withdrawOpsFees(address to, uint256 amount) external {
        if (msg.sender != feeRecipient) revert NotOpsFeeRecipient();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > opsFeeBalance) revert InsufficientOpsFees();

        opsFeeBalance -= amount;
        _payAsset(to, amount);
        emit OpsFeesWithdrawn(to, amount);
    }

    function _isNative() internal view returns (bool) {
        return address(asset) == address(0);
    }

    /// @dev User principal + fee buckets; excludes gasReserveEth on native pools.
    function _spendableAssetBalance() internal view returns (uint256) {
        if (_isNative()) {
            uint256 bal = address(this).balance;
            uint256 reserved = gasReserveEth;
            return bal > reserved ? bal - reserved : 0;
        }
        return asset.balanceOf(address(this));
    }

    function _pullDeposit(uint256 amount) internal {
        if (_isNative()) {
            if (msg.value != amount) revert UnexpectedEthValue();
            return;
        }
        if (msg.value != 0) revert UnexpectedEthValue();
        if (!asset.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    function _payAsset(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (_isNative()) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
            return;
        }
        if (!asset.transfer(to, amount)) revert TransferFailed();
    }

    function _fundGasReserve() internal {
        if (msg.value == 0) revert ZeroAmount();
        gasReserveEth += msg.value;
        emit GasReserveFunded(msg.sender, msg.value);
    }

    /// @dev Non-fatal: empty reserve / failed send must never revert a successful withdraw.
    ///      ETH rebates spend only gasReserveEth so native user principal is never used.
    function _maybeRebateRelayer() internal {
        uint256 ethRebate = gasRebateWei;
        if (ethRebate > 0) {
            if (gasReserveEth >= ethRebate) {
                gasReserveEth -= ethRebate;
                (bool ok,) = msg.sender.call{value: ethRebate}("");
                if (ok) {
                    emit GasRebatePaid(msg.sender, ethRebate);
                } else {
                    gasReserveEth += ethRebate;
                    emit GasRebateSkipped(msg.sender, ethRebate);
                }
            } else {
                emit GasRebateSkipped(msg.sender, ethRebate);
            }
        }

        uint256 tokenRebate = tokenRebateAmount;
        if (tokenRebate > 0 && !_isNative()) {
            if (reserveFeeBalance >= tokenRebate && asset.balanceOf(address(this)) >= tokenRebate) {
                reserveFeeBalance -= tokenRebate;
                if (asset.transfer(msg.sender, tokenRebate)) {
                    emit TokenRebatePaid(msg.sender, tokenRebate);
                } else {
                    // Restore accounting if transfer fails; do not revert withdraw.
                    reserveFeeBalance += tokenRebate;
                    emit TokenRebateSkipped(msg.sender, tokenRebate);
                }
            } else {
                emit TokenRebateSkipped(msg.sender, tokenRebate);
            }
        }
    }

    /// @dev Push the full fee to `feeRecipient` in the same transaction. Empty fee is a no-op.
    function _payFee(uint256 fee) internal {
        if (fee == 0) return;
        totalFeesCollected += fee;
        _payAsset(feeRecipient, fee);
    }

    function _recordRoot(bytes32 merkleRoot) internal {
        uint256 total = rootHistoryTotalRecorded;
        uint256 slot = total % ROOT_HISTORY_SIZE;
        if (total >= ROOT_HISTORY_SIZE) {
            bytes32 evictedRoot = _rootHistory[slot];
            unchecked {
                _knownRootOccurrences[evictedRoot] -= 1;
            }
        }
        _rootHistory[slot] = merkleRoot;
        _knownRootOccurrences[merkleRoot] += 1;
        rootHistoryTotalRecorded = total + 1;
        emit MerkleRootRecorded(merkleRoot, _tree.nextIndex);
    }

    function _parseProof(bytes calldata proof) internal pure returns (ProofData memory parsed) {
        // Expected encoding: abi.encode(uint256[2], uint256[2][2], uint256[2])
        if (proof.length != 32 * (2 + 4 + 2)) revert InvalidProof();
        (parsed.a, parsed.b, parsed.c) = abi.decode(proof, (uint256[2], uint256[2][2], uint256[2]));
    }
}
