// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ISkillNFT.sol";

/**
 * @title SkillRoyaltySplitter
 * @notice Splits Agent Services payments between operator, skill creator, and platform.
 *         Used for x402 / MPP / direct service payments.
 *
 *         Default split: 80% operator / 15% creator / 5% platform
 *
 * @dev Audit fixes applied:
 *      - C-02: ReentrancyGuard on pay()
 *      - M-05: Consistent custom errors
 *      - L-02: FeeSplitUpdated event
 *      - L-03: PlatformWalletUpdated event
 *      - AUDIT-2 M-2: pull-then-push pattern (USDC blacklist DoS fix)
 *      - AUDIT-2 M-3: operator must hold skill NFT (unconstrained operator fix)
 *      - AUDIT-2 L-4: check skill active status before payment
 *      - AUDIT-2 Lead: MIN_AMOUNT to prevent zero-rounding
 *      - AUDIT-2 Lead: rescueTokens for stuck funds
 */
contract SkillRoyaltySplitter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ──────────────────────────────────────────────
    IERC20    public immutable usdc;
    ISkillNFT public immutable skillNft;
    IERC1155  public immutable skillNftERC1155;

    uint16 public operatorBps = 8000;   // 80%
    uint16 public creatorBps  = 1500;   // 15%
    uint16 public platformBps = 500;    // 5%
    address public platformWallet;

    /// @notice F3: pending withdrawals per recipient (withdrawal pattern).
    /// @dev Replaces push-transfer so a USDC-blacklisted creator cannot DoS pay().
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Aggregate USDC owed through {pendingWithdrawals}.
    uint256 public totalPendingWithdrawals;

    /// @notice Minimum payment amount: 0.01 USDC (10000 units at 6 decimals)
    /// @dev Prevents zero-rounding where operator/creator get 0 on tiny amounts
    uint256 public constant MIN_AMOUNT = 10000;

    // ── Events ─────────────────────────────────────────────
    event ServicePayment(
        uint256 indexed skillId,
        address indexed operator,
        address indexed creator,
        uint256 amount,
        uint256 operatorAmt,
        uint256 creatorAmt,
        uint256 platformAmt
    );
    event Withdrawn(address indexed recipient, uint256 amount);

    event FeeSplitUpdated(uint16 operatorBps, uint16 creatorBps, uint16 platformBps);
    event PlatformWalletUpdated(address indexed newWallet);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // ── Errors ─────────────────────────────────────────────
    error InvalidAddress();
    error ZeroAmount();
    error AmountTooLow(uint256 amount, uint256 minAmount);
    error InvalidSkill(uint256 skillId);
    error SkillInactive(uint256 skillId);
    error UnauthorizedOperator(address operator, uint256 skillId);
    error InvalidFeeSplit();
    error OperatorBpsTooLow();
    error TransferFailed(address recipient);
    error InsufficientSurplus(uint256 requested, uint256 available);
    error NothingToWithdraw();

    // ── Constructor ────────────────────────────────────────
    constructor(
        address _usdc,
        address _skillNft,
        address _platformWallet
    ) Ownable(msg.sender) {
        if (_usdc == address(0) || _skillNft == address(0) || _platformWallet == address(0)) {
            revert InvalidAddress();
        }
        usdc = IERC20(_usdc);
        skillNft = ISkillNFT(_skillNft);
        skillNftERC1155 = IERC1155(_skillNft);
        platformWallet = _platformWallet;
    }

    // ── Payment ────────────────────────────────────────────

    /**
     * @notice Pay for an agent service. Caller pays USDC, splits to operator/creator/platform.
     *
     * @dev AUDIT-2 fixes:
     *      - M-2: Pull full amount to contract first, then push to each recipient.
     *             If any push fails, funds stay in contract for rescueTokens().
     *      - M-3: Operator must hold the skill NFT (balanceOf > 0).
     *      - L-4: Skill must be active.
     *      - Lead: MIN_AMOUNT enforced.
     *
     * @param skillId  The skill being used (to look up creator for royalty)
     * @param operator The agent operator running the service (must hold skill NFT)
     * @param amount   Total USDC amount (6 decimals, min 0.01 USDC)
     */
    function pay(uint256 skillId, address operator, uint256 amount) external nonReentrant {
        if (operator == address(0)) revert InvalidAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount < MIN_AMOUNT) revert AmountTooLow(amount, MIN_AMOUNT);

        // AUDIT-2 L-4: check skill is active
        if (!skillNft.getSkillActive(skillId)) revert SkillInactive(skillId);

        // AUDIT-2 M-3: operator must hold skill NFT
        if (skillNftERC1155.balanceOf(operator, skillId) == 0) {
            revert UnauthorizedOperator(operator, skillId);
        }

        address creator = skillNft.getCreator(skillId);
        if (creator == address(0)) revert InvalidSkill(skillId);

        uint256 operatorAmt = (amount * operatorBps) / 10000;
        uint256 creatorAmt  = (amount * creatorBps) / 10000;
        uint256 platformAmt = amount - operatorAmt - creatorAmt;

        // F3: Pull full amount to contract, then credit via withdrawal pattern.
        // A USDC-blacklisted creator/operator cannot DoS pay() for others.
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        pendingWithdrawals[operator]       += operatorAmt;
        pendingWithdrawals[creator]        += creatorAmt;
        pendingWithdrawals[platformWallet] += platformAmt;
        totalPendingWithdrawals            += amount;

        emit ServicePayment(skillId, operator, creator, amount, operatorAmt, creatorAmt, platformAmt);
    }

    /// @notice Pull pending balance. Each recipient withdraws independently.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        totalPendingWithdrawals -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ── Admin setters ──────────────────────────────────────

    /**
     * @notice Update fee split. Must sum to 10000. Operator must be >= 50%.
     */
    function setFeeSplit(uint16 _operatorBps, uint16 _creatorBps, uint16 _platformBps) external onlyOwner {
        if (uint256(_operatorBps) + _creatorBps + _platformBps != 10000) revert InvalidFeeSplit();
        if (_operatorBps < 5000) revert OperatorBpsTooLow();
        operatorBps = _operatorBps;
        creatorBps = _creatorBps;
        platformBps = _platformBps;
        emit FeeSplitUpdated(_operatorBps, _creatorBps, _platformBps);
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        if (_wallet == address(0)) revert InvalidAddress();
        platformWallet = _wallet;
        emit PlatformWalletUpdated(_wallet);
    }

    // ── Emergency ──────────────────────────────────────────

    /**
     * @notice Rescue tokens stuck in the contract (e.g., from failed push distribution).
     * @dev AUDIT-2 M-2: companion to pull-then-push pattern.
     */
    function rescueTokens(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        if (address(token) == address(usdc)) {
            uint256 balance = token.balanceOf(address(this));
            uint256 available = balance > totalPendingWithdrawals ? balance - totalPendingWithdrawals : 0;
            if (amount > available) revert InsufficientSurplus(amount, available);
        }
        token.safeTransfer(to, amount);
        emit TokensRescued(address(token), to, amount);
    }
}
