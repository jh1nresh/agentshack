// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20}         from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20}      from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable}        from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {SkillRegistry}  from "./SkillRegistry.sol";
import {SkillRunToken}  from "./SkillRunToken.sol";
import {IReputationHub} from "./interfaces/IReputationHub.sol";

/**
 * @title SwapRouter
 * @notice Agent-facing entry point for the Maiat commerce layer.
 *
 *  Four agent flows:
 *   - {buyRunToken}    — USDC → RUN_TOKEN credits (pre-buy, no execution yet)
 *   - {executeSkill}   — burn 1 RUN_TOKEN → off-chain execution request
 *   - {swap}           — 1-shot: direct USDC → execution (skips token mint)
 *   - {redeemRunToken} — burn N RUN_TOKENs → get USDC back (escape hatch)
 *
 *  All flows enforce the reputation gate first, then token/USDC movement.
 *  Off-chain execution is requested via {ExecutionRequested} event; the
 *  gateway settles with a signed proof via {settle}.
 *
 * @dev Audit remediation (2026-04-17):
 *      - `maxPriceUSDC` slippage param on buy/swap (finding #3)
 *      - `redeemRunToken` escape hatch (finding #8)
 *      - Fee/treasury/creator snapshotted into Request at open time
 *      - Pull-payment fallback on transfer failure + rescueTokens (finding #4)
 *      - Price/reputation cannot change while supply > 0 (enforced in registry)
 */
contract SwapRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────

    enum RequestStatus { None, Pending, Started, Settled, Refunded }

    struct Request {
        bytes32       skillId;
        address       agent;
        uint256       amountUSDC;
        uint256       timestamp;
        RequestStatus status;
        // Snapshot at open time so admin param changes cannot retroactively
        // alter the split or destinations of an in-flight request.
        address       creator;
        address       platformTreasury;
        address       reputationPool;
        uint16        platformBps;
        uint16        reputationBps;
    }

    // ─────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────

    uint256 public constant MAX_BPS     = 10_000;
    uint32  public constant REQUEST_TTL = 15 minutes; // agent self-refund after TTL
    uint8   public constant REQUIRED_USDC_DECIMALS = 6;

    // ─────────────────────────────────────────────
    //  Immutables
    // ─────────────────────────────────────────────

    SkillRegistry  public immutable registry;
    IReputationHub public immutable reputation;
    IERC20         public immutable usdc;

    // ─────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────

    address public gateway;           // trusted off-chain executor
    address public platformTreasury;  // platform fee recipient
    address public reputationPool;    // reputation pool recipient
    uint16  public platformBps    = 500;  // 5%
    uint16  public reputationBps  = 500;  // 5%

    mapping(bytes32 => Request) public requests;

    /// @notice Pull-payment ledger for USDC that could not be pushed (blacklist,
    ///         paused, etc.). Users / creators call {claimPending} to withdraw.
    mapping(address => uint256) public pendingWithdrawal;

    /// @notice USDC backing currently pending execution requests.
    uint256 public totalEscrowed;

    /// @notice USDC backing failed push payments that recipients must claim.
    uint256 public totalPendingWithdrawal;

    uint256 private _nonce;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event GatewayUpdated(address indexed oldGateway, address indexed newGateway);
    event TreasuryUpdated(address indexed platform, address indexed reputationPool);
    event FeesUpdated(uint16 platformBps, uint16 reputationBps);

    event RunTokenBought(
        bytes32 indexed skillId,
        address indexed agent,
        uint256 amount,
        uint256 costUSDC
    );
    event RunTokenRedeemed(
        bytes32 indexed skillId,
        address indexed agent,
        uint256 amount,
        uint256 refundUSDC
    );
    event ExecutionRequested(
        bytes32 indexed requestId,
        bytes32 indexed skillId,
        address indexed agent,
        uint256 amountUSDC,
        bytes   params
    );
    event ExecutionStarted(bytes32 indexed requestId, bytes32 indexed skillId, address indexed agent);
    event ExecutionSettled(
        bytes32 indexed requestId,
        bytes32 indexed skillId,
        bool    success,
        bytes32 resultHash,
        uint256 creatorShare,
        uint256 platformShare,
        uint256 reputationShare
    );
    event ExecutionRefunded(bytes32 indexed requestId, address indexed agent, uint256 amount);
    event PaymentDeferred(address indexed to, uint256 amount, uint256 newBalance);
    event PendingClaimed(address indexed to, uint256 amount);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // ─────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────

    error SkillInactive(bytes32 skillId);
    error InsufficientReputation(uint256 required, uint256 actual);
    error ZeroAmount();
    error ZeroAddress();
    error InvalidBps();
    error NotGateway();
    error RequestNotFound(bytes32 requestId);
    error RequestNotPending(bytes32 requestId);
    error RequestNotExpired(bytes32 requestId);
    error NotRequester();
    error PriceExceedsMax(uint256 actualPrice, uint256 maxPrice);
    error InsufficientTokenBalance(uint256 have, uint256 need);
    error InsufficientSurplus(uint256 requested, uint256 available);
    error InvalidUSDCDecimals(uint8 actual, uint8 expected);
    error NothingPending();

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    constructor(
        SkillRegistry  registry_,
        IReputationHub reputation_,
        IERC20         usdc_,
        address        gateway_,
        address        platformTreasury_,
        address        reputationPool_
    ) Ownable(msg.sender) {
        if (address(registry_)   == address(0) ||
            address(reputation_) == address(0) ||
            address(usdc_)       == address(0) ||
            gateway_             == address(0) ||
            platformTreasury_    == address(0) ||
            reputationPool_      == address(0)) revert ZeroAddress();
        uint8 decimals = IERC20Metadata(address(usdc_)).decimals();
        if (decimals != REQUIRED_USDC_DECIMALS) revert InvalidUSDCDecimals(decimals, REQUIRED_USDC_DECIMALS);
        registry          = registry_;
        reputation        = reputation_;
        usdc              = usdc_;
        gateway           = gateway_;
        platformTreasury  = platformTreasury_;
        reputationPool    = reputationPool_;
    }

    // ─────────────────────────────────────────────
    //  Agent: buy RUN_TOKEN (bulk pre-purchase)
    // ─────────────────────────────────────────────

    /**
     * @notice Pre-purchase execution credits.
     * @param skillId      Target skill.
     * @param amount       Number of RUN_TOKENs to mint.
     * @param maxPriceUSDC Max per-token price the agent is willing to pay.
     *                     Slippage guard against provider front-running with
     *                     `setPrice` (audit finding #3). Pass `type(uint256).max`
     *                     to opt out of the guard (not recommended).
     */
    function buyRunToken(bytes32 skillId, uint256 amount, uint256 maxPriceUSDC)
        external
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        SkillRegistry.Skill memory s = registry.getSkill(skillId);
        if (!s.active) revert SkillInactive(skillId);
        if (s.priceUSDC > maxPriceUSDC) revert PriceExceedsMax(s.priceUSDC, maxPriceUSDC);
        _requireReputation(msg.sender, s.minReputation);

        uint256 cost = s.priceUSDC * amount;

        // Pull USDC from agent into router, approve registry, deposit into treasury.
        usdc.safeTransferFrom(msg.sender, address(this), cost);
        usdc.forceApprove(address(registry), cost);
        registry.depositTreasury(skillId, cost);

        SkillRunToken(s.runToken).mint(msg.sender, amount);
        emit RunTokenBought(skillId, msg.sender, amount, cost);
    }

    // ─────────────────────────────────────────────
    //  Agent: execute via RUN_TOKEN
    // ─────────────────────────────────────────────

    function executeSkill(bytes32 skillId, bytes calldata params)
        external
        nonReentrant
        returns (bytes32 requestId)
    {
        SkillRegistry.Skill memory s = registry.getSkill(skillId);
        if (!s.active) revert SkillInactive(skillId);
        _requireReputation(msg.sender, s.minReputation);

        // Price is supply-locked in registry, so s.priceUSDC == the price every
        // outstanding RUN_TOKEN was minted at.
        SkillRunToken(s.runToken).burn(msg.sender, 1);
        registry.releaseTreasury(skillId, address(this), s.priceUSDC);

        requestId = _openRequest(skillId, msg.sender, s.priceUSDC, params, s.creator);
    }

    // ─────────────────────────────────────────────
    //  Agent: 1-shot swap (skip RUN_TOKEN mint/burn)
    // ─────────────────────────────────────────────

    function swap(bytes32 skillId, uint256 maxPriceUSDC, bytes calldata params)
        external
        nonReentrant
        returns (bytes32 requestId)
    {
        SkillRegistry.Skill memory s = registry.getSkill(skillId);
        if (!s.active) revert SkillInactive(skillId);
        if (s.priceUSDC > maxPriceUSDC) revert PriceExceedsMax(s.priceUSDC, maxPriceUSDC);
        _requireReputation(msg.sender, s.minReputation);

        usdc.safeTransferFrom(msg.sender, address(this), s.priceUSDC);

        requestId = _openRequest(skillId, msg.sender, s.priceUSDC, params, s.creator);
    }

    // ─────────────────────────────────────────────
    //  Agent: redeem RUN_TOKEN (escape hatch)
    // ─────────────────────────────────────────────

    /**
     * @notice Burn unused RUN_TOKENs and reclaim proportional treasury USDC.
     *         Works even when the skill is inactive — gives agents an exit
     *         regardless of provider behaviour (audit finding #8).
     * @dev No reputation check — burning credits should never be gated.
     */
    function redeemRunToken(bytes32 skillId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        SkillRegistry.Skill memory s = registry.getSkill(skillId);

        uint256 bal = SkillRunToken(s.runToken).balanceOf(msg.sender);
        if (bal < amount) revert InsufficientTokenBalance(bal, amount);

        uint256 refund = s.priceUSDC * amount;
        SkillRunToken(s.runToken).burn(msg.sender, amount);
        registry.releaseTreasury(skillId, msg.sender, refund);

        emit RunTokenRedeemed(skillId, msg.sender, amount, refund);
    }

    // ─────────────────────────────────────────────
    //  Gateway: settle
    // ─────────────────────────────────────────────

    /**
     * @notice Finalise an execution request.
     *  On success: split USDC between creator / platform / reputation pool
     *              using the bps/addresses snapshotted at request-open time.
     *  On failure: refund the full amount to the agent.
     *  Any push that fails (blacklist, paused token) is credited to
     *  {pendingWithdrawal} so the whole request doesn't revert
     *  (audit finding #4).
     */
    function markStarted(bytes32 requestId) external nonReentrant {
        if (msg.sender != gateway) revert NotGateway();
        Request storage r = requests[requestId];
        if (r.status == RequestStatus.None) revert RequestNotFound(requestId);
        if (r.status != RequestStatus.Pending) revert RequestNotPending(requestId);

        r.status = RequestStatus.Started;
        emit ExecutionStarted(requestId, r.skillId, r.agent);
    }

    function settle(
        bytes32 requestId,
        bool    success,
        bytes32 resultHash
    ) external nonReentrant {
        if (msg.sender != gateway) revert NotGateway();
        Request storage r = requests[requestId];
        if (r.status == RequestStatus.None) revert RequestNotFound(requestId);
        if (r.status != RequestStatus.Pending && r.status != RequestStatus.Started) revert RequestNotPending(requestId);

        uint256 amount = r.amountUSDC;
        totalEscrowed -= amount;

        if (success) {
            r.status = RequestStatus.Settled;
            uint256 platformShare   = (amount * r.platformBps)   / MAX_BPS;
            uint256 reputationShare = (amount * r.reputationBps) / MAX_BPS;
            // Fee dust policy: platform/reputation round down and creator receives the remainder.
            uint256 creatorShare    = amount - platformShare - reputationShare;

            _safeCredit(r.creator,          creatorShare);
            _safeCredit(r.platformTreasury, platformShare);
            _safeCredit(r.reputationPool,   reputationShare);

            emit ExecutionSettled(
                requestId, r.skillId, true, resultHash,
                creatorShare, platformShare, reputationShare
            );
        } else {
            r.status = RequestStatus.Refunded;
            _safeCredit(r.agent, amount);
            emit ExecutionRefunded(requestId, r.agent, amount);
        }
    }

    /// @notice Agent self-refund after TTL expiry (gateway never settled).
    function claimRefund(bytes32 requestId) external nonReentrant {
        Request storage r = requests[requestId];
        if (r.status == RequestStatus.None) revert RequestNotFound(requestId);
        if (r.status != RequestStatus.Pending) revert RequestNotPending(requestId);
        if (r.agent != msg.sender) revert NotRequester();
        if (block.timestamp < r.timestamp + REQUEST_TTL) revert RequestNotExpired(requestId);

        r.status = RequestStatus.Refunded;
        totalEscrowed -= r.amountUSDC;
        _safeCredit(r.agent, r.amountUSDC);
        emit ExecutionRefunded(requestId, r.agent, r.amountUSDC);
    }

    /// @notice Claim USDC that was deferred because a push transfer failed
    ///         (e.g. recipient blacklisted at settle time; now unblocked).
    function claimPending() external nonReentrant {
        uint256 amount = pendingWithdrawal[msg.sender];
        if (amount == 0) revert NothingPending();
        pendingWithdrawal[msg.sender] = 0;
        totalPendingWithdrawal -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit PendingClaimed(msg.sender, amount);
    }

    // ─────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────

    function setGateway(address newGateway) external onlyOwner {
        if (newGateway == address(0)) revert ZeroAddress();
        emit GatewayUpdated(gateway, newGateway);
        gateway = newGateway;
    }

    function setTreasuries(address newPlatform, address newReputationPool) external onlyOwner {
        if (newPlatform == address(0) || newReputationPool == address(0)) revert ZeroAddress();
        platformTreasury  = newPlatform;
        reputationPool    = newReputationPool;
        emit TreasuryUpdated(newPlatform, newReputationPool);
    }

    function setFees(uint16 platformBps_, uint16 reputationBps_) external onlyOwner {
        if (uint256(platformBps_) + uint256(reputationBps_) >= MAX_BPS) revert InvalidBps();
        platformBps   = platformBps_;
        reputationBps = reputationBps_;
        emit FeesUpdated(platformBps_, reputationBps_);
    }

    /// @notice Owner can sweep stray tokens (misdirected deposits, dust).
    ///         Request accounting is not touched — amounts owed to agents /
    ///         creators are held in Request state and pendingWithdrawal.
    function rescueTokens(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (address(token) == address(usdc)) {
            uint256 liabilities = totalEscrowed + totalPendingWithdrawal;
            uint256 balance = token.balanceOf(address(this));
            uint256 available = balance > liabilities ? balance - liabilities : 0;
            if (amount > available) revert InsufficientSurplus(amount, available);
        }
        token.safeTransfer(to, amount);
        emit TokensRescued(address(token), to, amount);
    }

    // ─────────────────────────────────────────────
    //  Internal
    // ─────────────────────────────────────────────

    function _requireReputation(address agent, uint256 minRep) internal view {
        if (minRep == 0) return; // Day-1 fast path — every skill registers with 0
        uint256 score = reputation.scoreOf(agent);
        if (score < minRep) revert InsufficientReputation(minRep, score);
    }

    function _openRequest(
        bytes32 skillId,
        address agent,
        uint256 amount,
        bytes calldata params,
        address creatorSnapshot
    ) internal returns (bytes32 requestId) {
        unchecked { _nonce++; }
        requestId = keccak256(abi.encodePacked(skillId, agent, block.timestamp, _nonce, block.chainid));
        totalEscrowed += amount;
        requests[requestId] = Request({
            skillId:           skillId,
            agent:             agent,
            amountUSDC:        amount,
            timestamp:         block.timestamp,
            status:            RequestStatus.Pending,
            creator:           creatorSnapshot,
            platformTreasury:  platformTreasury,
            reputationPool:    reputationPool,
            platformBps:       platformBps,
            reputationBps:     reputationBps
        });
        emit ExecutionRequested(requestId, skillId, agent, amount, params);
    }

    /// @dev Attempts to push USDC; on revert (blacklist / paused / contract),
    ///      credits the recipient's {pendingWithdrawal} balance instead of
    ///      failing the whole tx. Zero amount is a no-op.
    function _safeCredit(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = address(usdc).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        bool success = ok && (ret.length == 0 || abi.decode(ret, (bool)));
        if (!success) {
            uint256 newBal = pendingWithdrawal[to] + amount;
            pendingWithdrawal[to] = newBal;
            totalPendingWithdrawal += amount;
            emit PaymentDeferred(to, amount, newBal);
        }
    }
}
