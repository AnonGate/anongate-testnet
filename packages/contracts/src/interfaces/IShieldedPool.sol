// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IShieldedPool
/// @notice Canonical MVP interface for Absolute Privacy.
/// @dev Implemented by ShieldedPool. claimRewards remains unimplemented in MVP.
interface IShieldedPool {
    event Deposited(
        address indexed from,
        uint256 amount,
        uint256 fee,
        uint256[] commitmentIndices,
        bytes32[] commitments,
        uint8 tierCode,
        uint256 timestamp
    );

    event Transferred(
        bytes32[] nullifiers, uint256[] commitmentIndices, bytes32[] commitments, uint256 fee
    );

    event Withdrawn(
        address indexed recipient,
        address indexed submitter,
        uint256 amount,
        uint256 fee,
        bytes32[] nullifiers
    );

    event RewardsClaimed(uint256 amount, uint8 mode, bytes32 claimId);

    event OpsFeesWithdrawn(address indexed to, uint256 amount);

    event MerkleRootRecorded(bytes32 indexed merkleRoot, uint256 commitmentCount);

    event GasReserveFunded(address indexed from, uint256 amount);

    event GasRebatePaid(address indexed relayer, uint256 amount);

    event GasRebateSkipped(address indexed relayer, uint256 amount);

    event TokenRebatePaid(address indexed relayer, uint256 amount);

    event TokenRebateSkipped(address indexed relayer, uint256 amount);

    function poolAsset() external view returns (address);

    function feeParameters()
        external
        view
        returns (uint32 depositFeePpm, uint16 transferFeeBps, uint32 withdrawFeePpm);

    function rewardParameters()
        external
        view
        returns (uint16 liquidityShareBps, uint16 opsShareBps, uint16 reserveShareBps);

    function currentStateAnchor()
        external
        view
        returns (bytes32 commitmentRoot, uint256 commitmentCount);

    function isNullifierSpent(bytes32 nullifier) external view returns (bool);

    function isKnownRoot(bytes32 merkleRoot) external view returns (bool);

    function knownRootOccurrences(bytes32 merkleRoot) external view returns (uint256);

    function rootHistoryLength() external view returns (uint256);

    function rootHistoryTotalRecorded() external view returns (uint256);

    function rootHistoryAt(uint256 index) external view returns (bytes32);

    function deposit(
        uint256 amount,
        bytes32[] calldata commitments,
        uint8 tierCode,
        bytes calldata proof
    ) external payable;

    /// @dev Shielded note-to-note transfer was removed from the protocol (withdraw-only spend path).

    function withdraw(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32[] calldata nullifiers,
        address recipient,
        uint256 amount,
        bytes calldata publicFeeData
    ) external;

    function withdraw1(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32[] calldata nullifiers,
        address recipient,
        uint256 amount,
        bytes calldata publicFeeData
    ) external;

    function withdrawPartial1(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32[] calldata nullifiers,
        address recipient,
        uint256 amount,
        bytes32 outCommitment,
        bytes calldata publicFeeData
    ) external;

    function claimRewards(bytes calldata claimData, uint256 amount, address recipient, uint8 mode)
        external;

    /// @notice Leftover pull path. Current pools push fees to `feeRecipient` immediately.
    function withdrawOpsFees(address to, uint256 amount) external;

    function feeRecipient() external view returns (address);

    function opsFeeRecipient() external view returns (address);

    function gasRebateWei() external view returns (uint256);

    function tokenRebateAmount() external view returns (uint256);

    function gasReserveBalance() external view returns (uint256);

    function fundGasReserve() external payable;

    function isNativeAsset() external view returns (bool);
}
