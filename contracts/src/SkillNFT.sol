// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "./ISkillNFT.sol";

/**
 * @title SkillNFT
 * @notice ERC-1155 contract for agent skills in the Maiat ecosystem.
 *         Skills can be created by the owner and purchased with USDC.
 *         Payments are auto-split between creator, platform wallet, and reputation pool.
 *         Each skill stores royaltyBps for use by SkillRoyaltySplitter in Agent Services.
 *
 * @dev Audit fixes applied:
 *      - C-01: price > 0 enforced in createSkill
 *      - C-03: rescueTokens added for stuck funds
 *      - M-01: bounds check on getSkill / getCreator
 *      - M-02: minimum price enforced (0.01 USDC)
 *      - M-04: setSkillActive replaces deactivateSkill (supports reactivation)
 *      - M-05: consistent custom errors (no more require strings)
 *      - L-01: SkillActiveChanged event added
 *      - L-05: nextSkillId starts at 1 (avoids off-chain 0=null confusion)
 *      - AUDIT-2 M-1: atomic setFees replaces separate fee setters
 *      - AUDIT-2 L-5: nonReentrant on buySkill
 *      - AUDIT-2 Lead: implements ISkillNFT interface
 *      - AUDIT-2 Lead: indexed address events
 */
contract SkillNFT is ERC1155, IERC2981, Ownable, ReentrancyGuard, ISkillNFT {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────

    struct Skill {
        uint256 price;       // USDC price (6 decimals)
        address creator;     // Skill creator address
        uint16  royaltyBps;  // Royalty in basis points (for Agent Services, see SkillRoyaltySplitter)
        string  uri;         // Metadata URI
        uint256 totalSold;   // Total units sold
        bool    active;      // Can be purchased
    }

    // ─────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────

    /// @notice Minimum skill price: 0.01 USDC (10000 units at 6 decimals)
    uint256 public constant MIN_PRICE = 10000;
    uint8 public constant REQUIRED_USDC_DECIMALS = 6;

    // ─────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────

    /// @notice USDC token used for all payments
    IERC20 public immutable usdc;

    /// @notice Platform fee in basis points (default 10% = 1000)
    uint16 public platformFeeBps;

    /// @notice Reputation pool fee in basis points (default 5% = 500)
    uint16 public reputationPoolBps;

    /// @notice Address that receives platform fees
    address public platformWallet;

    /// @notice Address that receives reputation pool fees
    address public reputationPool;

    /// @notice Auto-incrementing skill ID counter (starts at 1, 0 = invalid)
    uint256 public nextSkillId = 1;

    /// @notice skillId → Skill data
    mapping(uint256 => Skill) public skills;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event SkillCreated(
        uint256 indexed skillId,
        address indexed creator,
        uint256 price,
        uint16 royaltyBps,
        string uri
    );

    event SkillPurchased(
        uint256 indexed skillId,
        address indexed buyer,
        address indexed recipient,
        uint256 price,
        uint256 creatorShare,
        uint256 platformShare,
        uint256 reputationShare
    );

    event SkillActiveChanged(uint256 indexed skillId, bool active);
    event SkillCreatorUpdated(uint256 indexed skillId, address indexed newCreator);
    event FeesUpdated(uint16 platformFeeBps, uint16 reputationPoolBps);
    event PlatformWalletUpdated(address indexed newWallet);
    event ReputationPoolUpdated(address indexed newPool);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // ─────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────

    error InvalidSkillId(uint256 skillId);
    error SkillInactive(uint256 skillId);
    error InvalidAddress();
    error InvalidBps();
    error PriceTooLow(uint256 price, uint256 minPrice);
    error InsufficientBalance();
    error InvalidUSDCDecimals(uint8 actual, uint8 expected);

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    /**
     * @param _usdc           USDC token address (Base mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
     * @param _platformWallet Address to receive platform fees
     * @param _reputationPool Address to receive reputation pool fees
     */
    constructor(
        address _usdc,
        address _platformWallet,
        address _reputationPool
    ) ERC1155("") Ownable(msg.sender) {
        if (_usdc == address(0) || _platformWallet == address(0) || _reputationPool == address(0)) {
            revert InvalidAddress();
        }
        uint8 decimals = IERC20Metadata(_usdc).decimals();
        if (decimals != REQUIRED_USDC_DECIMALS) revert InvalidUSDCDecimals(decimals, REQUIRED_USDC_DECIMALS);
        usdc = IERC20(_usdc);
        platformWallet = _platformWallet;
        reputationPool = _reputationPool;
        platformFeeBps = 1000;     // 10%
        reputationPoolBps = 500;   // 5%
    }

    // ─────────────────────────────────────────────
    //  Admin: Skill Management
    // ─────────────────────────────────────────────

    /**
     * @notice Create a new skill type. Only callable by owner.
     * @param price       USDC price in 6-decimal units (min 0.01 USDC = 10000)
     * @param creator     Address that receives creator share of sales
     * @param royaltyBps  Royalty in basis points (stored for SkillRoyaltySplitter)
     * @param uri_        Metadata URI for this skill token
     * @return skillId    The newly created skill's ID
     */
    function createSkill(
        uint256 price,
        address creator,
        uint16 royaltyBps,
        string calldata uri_
    ) external onlyOwner returns (uint256 skillId) {
        if (creator == address(0)) revert InvalidAddress();
        if (royaltyBps > 10000) revert InvalidBps();
        if (price < MIN_PRICE) revert PriceTooLow(price, MIN_PRICE); // C-01 + M-02

        skillId = nextSkillId++;
        skills[skillId] = Skill({
            price: price,
            creator: creator,
            royaltyBps: royaltyBps,
            uri: uri_,
            totalSold: 0,
            active: true
        });

        emit SkillCreated(skillId, creator, price, royaltyBps, uri_);
    }

    // ─────────────────────────────────────────────
    //  Public: Purchase
    // ─────────────────────────────────────────────

    /**
     * @notice Buy a skill. Caller pays USDC; payment is auto-split.
     *         Split: creator = 100% - platformFeeBps - reputationPoolBps
     *                platform = platformFeeBps
     *                reputation pool = reputationPoolBps
     * @param skillId   The skill to purchase
     * @param recipient Address that receives the NFT
     */
    function buySkill(uint256 skillId, address recipient) external nonReentrant {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        if (recipient == address(0)) revert InvalidAddress();

        Skill storage skill = skills[skillId];
        if (!skill.active) revert SkillInactive(skillId); // M-05: custom error
        uint256 price = skill.price;

        // Check buyer has enough balance
        if (usdc.balanceOf(msg.sender) < price) revert InsufficientBalance();

        // Calculate splits
        uint256 platformShare    = (price * platformFeeBps) / 10000;
        uint256 reputationShare  = (price * reputationPoolBps) / 10000;
        // Fee dust policy: platform/reputation round down and creator receives the remainder.
        uint256 creatorShare     = price - platformShare - reputationShare;

        // Pull full amount from buyer first
        usdc.safeTransferFrom(msg.sender, address(this), price);

        // Distribute
        if (creatorShare > 0) {
            usdc.safeTransfer(skill.creator, creatorShare);
        }
        if (platformShare > 0) {
            usdc.safeTransfer(platformWallet, platformShare);
        }
        if (reputationShare > 0) {
            usdc.safeTransfer(reputationPool, reputationShare);
        }

        // Mint the skill token
        skill.totalSold++;
        _mint(recipient, skillId, 1, "");

        emit SkillPurchased(
            skillId,
            msg.sender,
            recipient,
            price,
            creatorShare,
            platformShare,
            reputationShare
        );
    }

    // ─────────────────────────────────────────────
    //  Admin: Skill Lifecycle
    // ─────────────────────────────────────────────

    /**
     * @notice Update the creator (payment recipient) of a skill.
     * @dev F8: creator address has no update path by default; a lost key or
     *      USDC-blacklisted address permanently breaks revenue flow.
     *      Owner-only to prevent provider self-rerouting without consent.
     */
    function updateCreator(uint256 skillId, address newCreator) external onlyOwner {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        if (newCreator == address(0)) revert InvalidAddress();
        skills[skillId].creator = newCreator;
        emit SkillCreatorUpdated(skillId, newCreator);
    }

    /**
     * @notice Activate or deactivate a skill. (M-04: supports reactivation)
     */
    function setSkillActive(uint256 skillId, bool active) external onlyOwner {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        skills[skillId].active = active;
        emit SkillActiveChanged(skillId, active); // L-01
    }

    // ─────────────────────────────────────────────
    //  View: Skill Getters
    // ─────────────────────────────────────────────

    /**
     * @notice Get full skill info. Reverts for non-existent IDs. (M-01)
     */
    function getSkill(uint256 skillId) external view returns (Skill memory) {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        return skills[skillId];
    }

    /**
     * @notice Get creator address for a skill. Reverts for non-existent IDs. (M-01)
     */
    function getCreator(uint256 skillId) external view override returns (address) {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        return skills[skillId].creator;
    }

    /**
     * @notice Check if a skill is active. Used by SkillRoyaltySplitter. (AUDIT-2 L-4)
     */
    function getSkillActive(uint256 skillId) external view override returns (bool) {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        return skills[skillId].active;
    }

    /**
     * @notice Get royaltyBps for a skill. Used by SkillRoyaltySplitter. (AUDIT-2 Lead)
     */
    function getSkillRoyaltyBps(uint256 skillId) external view override returns (uint16) {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        return skills[skillId].royaltyBps;
    }

    /**
     * @notice Returns the metadata URI for a given skill token.
     */
    function uri(uint256 skillId) public view override returns (string memory) {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        return skills[skillId].uri;
    }

    // ─────────────────────────────────────────────
    //  ERC-2981 Royalty Info
    // ─────────────────────────────────────────────

    /**
     * @notice Returns royalty info for a skill token per ERC-2981.
     */
    function royaltyInfo(uint256 skillId, uint256 salePrice)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        if (skillId == 0 || skillId >= nextSkillId) revert InvalidSkillId(skillId);
        Skill storage skill = skills[skillId];
        receiver = skill.creator;
        royaltyAmount = (salePrice * skill.royaltyBps) / 10000;
    }

    // ─────────────────────────────────────────────
    //  Admin: Fee & Address Updates
    // ─────────────────────────────────────────────

    /// @notice Atomically update both fee rates. Combined must be < 10000 bps.
    /// @dev AUDIT-2 M-1: replaces separate setters to prevent non-atomic misconfiguration.
    function setFees(uint16 _platformFeeBps, uint16 _reputationPoolBps) external onlyOwner {
        if (uint256(_platformFeeBps) + _reputationPoolBps >= 10000) revert InvalidBps();
        platformFeeBps = _platformFeeBps;
        reputationPoolBps = _reputationPoolBps;
        emit FeesUpdated(_platformFeeBps, _reputationPoolBps);
    }

    /// @notice Update platform wallet address.
    function setPlatformWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert InvalidAddress();
        platformWallet = newWallet;
        emit PlatformWalletUpdated(newWallet);
    }

    /// @notice Update reputation pool address.
    function setReputationPool(address newPool) external onlyOwner {
        if (newPool == address(0)) revert InvalidAddress();
        reputationPool = newPool;
        emit ReputationPoolUpdated(newPool);
    }

    // ─────────────────────────────────────────────
    //  Admin: Emergency (C-03)
    // ─────────────────────────────────────────────

    /**
     * @notice Rescue tokens stuck in the contract (e.g., from partial distribution failure).
     * @param token  ERC-20 token to rescue
     * @param to     Recipient address
     * @param amount Amount to rescue
     */
    function rescueTokens(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        token.safeTransfer(to, amount);
        emit TokensRescued(address(token), to, amount);
    }

    // ─────────────────────────────────────────────
    //  ERC-165 Introspection
    // ─────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC2981).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
