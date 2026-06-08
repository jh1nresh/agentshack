// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SkillRegistry}  from "../src/SkillRegistry.sol";
import {SkillRunToken}  from "../src/SkillRunToken.sol";
import {SwapRouter}     from "../src/SwapRouter.sol";
import {ReputationHub}  from "../src/ReputationHub.sol";
import {IReputationHub} from "../src/interfaces/IReputationHub.sol";
import {MockUSDC}       from "./mocks/MockUSDC.sol";
import {MockTrustOracle} from "./mocks/MockTrustOracle.sol";

contract SwapRouterTest is Test {
    SkillRegistry   public registry;
    SwapRouter      public router;
    ReputationHub   public hub;
    MockUSDC        public usdc;
    MockTrustOracle public oracle;

    address owner        = address(this);
    address gateway      = makeAddr("gateway");
    address platform     = makeAddr("platform");
    address repPool      = makeAddr("reputationPool");
    address provider     = makeAddr("provider");
    address creator      = makeAddr("creator");
    address agent        = makeAddr("agent");
    address otherAgent   = makeAddr("otherAgent");

    string  constant SLUG  = "web-scraper";
    uint256 constant PRICE = 5_000; // 0.005 USDC
    bytes32 skillId;
    address runToken;

    function setUp() public {
        usdc     = new MockUSDC();
        oracle   = new MockTrustOracle();
        hub      = new ReputationHub(oracle);
        registry = new SkillRegistry(usdc);

        router = new SwapRouter(
            registry, hub, usdc, gateway, platform, repPool
        );
        registry.setRouter(address(router));

        vm.prank(provider);
        (skillId, runToken) = registry.register(
            SLUG, PRICE, creator, "ipfs://meta", bytes32("slug.v1"), 0, 0
        );

        // Fund agents with USDC & approve router for USDC transfers.
        usdc.mint(agent, 1_000_000);
        vm.prank(agent);
        usdc.approve(address(router), type(uint256).max);

        usdc.mint(otherAgent, 1_000_000);
        vm.prank(otherAgent);
        usdc.approve(address(router), type(uint256).max);

        // RUN_TOKEN burn is router-authorized; agents only approve USDC.
    }

    // ── helpers ───────────────────────────────────────────────

    /// @dev Request struct has 10 fields. Helper extracts status to avoid verbose destructuring.
    function _reqStatus(bytes32 reqId) internal view returns (SwapRouter.RequestStatus) {
        (,,,, SwapRouter.RequestStatus s,,,,,) = router.requests(reqId);
        return s;
    }

    function _reqAgent(bytes32 reqId) internal view returns (address) {
        (, address a,,,,,,,,) = router.requests(reqId);
        return a;
    }

    function _reqAmount(bytes32 reqId) internal view returns (uint256) {
        (,, uint256 amt,,,,,,,) = router.requests(reqId);
        return amt;
    }

    // ── buyRunToken ───────────────────────────────────────────

    function test_buyRunToken_success() public {
        vm.prank(agent);
        router.buyRunToken(skillId, 10, type(uint256).max);
        assertEq(SkillRunToken(runToken).balanceOf(agent), 10);
        assertEq(registry.treasury(skillId), PRICE * 10);
        assertEq(usdc.balanceOf(agent), 1_000_000 - PRICE * 10);
    }

    function test_buyRunToken_revertsOnZeroAmount() public {
        vm.prank(agent);
        vm.expectRevert(SwapRouter.ZeroAmount.selector);
        router.buyRunToken(skillId, 0, type(uint256).max);
    }

    function test_buyRunToken_revertsOnInactive() public {
        vm.prank(provider);
        registry.setActive(skillId, false);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(SwapRouter.SkillInactive.selector, skillId));
        router.buyRunToken(skillId, 10, type(uint256).max);
    }

    function test_buyRunToken_revertsOnInsufficientReputation() public {
        // setMinReputation allowed while supply = 0.
        vm.prank(provider);
        registry.setMinReputation(skillId, 50);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(
            SwapRouter.InsufficientReputation.selector, 50, 0
        ));
        router.buyRunToken(skillId, 10, type(uint256).max);
    }

    function test_buyRunToken_passesWhenReputationMet() public {
        vm.prank(provider);
        registry.setMinReputation(skillId, 50);
        oracle.setScore(agent, 60);

        vm.prank(agent);
        router.buyRunToken(skillId, 3, type(uint256).max);
        assertEq(SkillRunToken(runToken).balanceOf(agent), 3);
    }

    function test_buyRunToken_revertsOnPriceExceedsMax() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(
            SwapRouter.PriceExceedsMax.selector, PRICE, PRICE - 1
        ));
        router.buyRunToken(skillId, 1, PRICE - 1);
    }

    // ── executeSkill ──────────────────────────────────────────

    function test_executeSkill_success() public {
        vm.prank(agent);
        router.buyRunToken(skillId, 3, type(uint256).max);
        assertEq(SkillRunToken(runToken).allowance(agent, address(router)), 0);

        vm.prank(agent);
        bytes32 reqId = router.executeSkill(skillId, hex"deadbeef");

        assertEq(SkillRunToken(runToken).balanceOf(agent), 2);
        assertEq(registry.treasury(skillId), PRICE * 2);
        assertEq(usdc.balanceOf(address(router)), PRICE); // escrowed
        assertEq(router.totalEscrowed(), PRICE);

        assertEq(_reqAgent(reqId),  agent);
        assertEq(_reqAmount(reqId), PRICE);
        assertEq(uint8(_reqStatus(reqId)), uint8(SwapRouter.RequestStatus.Pending));
    }

    function test_executeSkill_revertsOnNoBalance() public {
        vm.prank(agent);
        vm.expectRevert(); // ERC20 insufficient balance or allowance
        router.executeSkill(skillId, "");
    }

    function test_executeSkill_revertsOnReputationGate() public {
        // Set reputation gate BEFORE any tokens are minted (audit fix: setMinReputation
        // reverts while supply > 0 so providers can't retroactively gate pre-paid agents).
        vm.prank(provider);
        registry.setMinReputation(skillId, 80);

        // Agent score 90 — above gate, can buy.
        oracle.setScore(agent, 90);
        vm.prank(agent);
        router.buyRunToken(skillId, 3, type(uint256).max);

        // Score drops below the gate — execute now reverts.
        oracle.setScore(agent, 50);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(
            SwapRouter.InsufficientReputation.selector, 80, 50
        ));
        router.executeSkill(skillId, "");
    }

    // ── swap (1-shot) ─────────────────────────────────────────

    function test_swap_success() public {
        vm.prank(agent);
        bytes32 reqId = router.swap(skillId, type(uint256).max, hex"cafe");

        assertEq(SkillRunToken(runToken).balanceOf(agent), 0); // skips mint
        assertEq(usdc.balanceOf(address(router)), PRICE);       // escrowed
        assertEq(registry.treasury(skillId), 0);                // untouched

        assertEq(_reqAgent(reqId), agent);
        assertEq(uint8(_reqStatus(reqId)), uint8(SwapRouter.RequestStatus.Pending));
    }

    function test_swap_revertsOnReputationGate() public {
        vm.prank(provider);
        registry.setMinReputation(skillId, 50);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(
            SwapRouter.InsufficientReputation.selector, 50, 0
        ));
        router.swap(skillId, type(uint256).max, "");
    }

    function test_swap_revertsOnPriceExceedsMax() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(
            SwapRouter.PriceExceedsMax.selector, PRICE, PRICE - 1
        ));
        router.swap(skillId, PRICE - 1, "");
    }

    // ── settle ────────────────────────────────────────────────

    function test_settle_successDistributesFees() public {
        vm.prank(agent);
        bytes32 reqId = router.swap(skillId, type(uint256).max, "");

        uint256 expectedPlatform = PRICE * 500 / 10_000;    // 5%
        uint256 expectedRep      = PRICE * 500 / 10_000;    // 5%
        uint256 expectedCreator  = PRICE - expectedPlatform - expectedRep;

        vm.prank(gateway);
        router.settle(reqId, true, bytes32("result"));

        assertEq(usdc.balanceOf(creator),  expectedCreator);
        assertEq(usdc.balanceOf(platform), expectedPlatform);
        assertEq(usdc.balanceOf(repPool),  expectedRep);
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(router.totalEscrowed(), 0);
        assertEq(router.totalPendingWithdrawal(), 0);

        assertEq(uint8(_reqStatus(reqId)), uint8(SwapRouter.RequestStatus.Settled));
    }

    function test_settle_failureRefunds() public {
        uint256 balBefore = usdc.balanceOf(agent);
        vm.prank(agent);
        bytes32 reqId = router.swap(skillId, type(uint256).max, "");

        vm.prank(gateway);
        router.settle(reqId, false, bytes32(0));

        assertEq(usdc.balanceOf(agent), balBefore); // full refund
        assertEq(router.totalEscrowed(), 0);
        assertEq(uint8(_reqStatus(reqId)), uint8(SwapRouter.RequestStatus.Refunded));
    }

    function test_settle_revertsFromNonGateway() public {
        vm.prank(agent);
        bytes32 reqId = router.swap(skillId, type(uint256).max, "");
        vm.prank(otherAgent);
        vm.expectRevert(SwapRouter.NotGateway.selector);
        router.settle(reqId, true, bytes32(0));
    }

    function test_settle_revertsOnDoubleSettle() public {
        vm.prank(agent);
        bytes32 reqId = router.swap(skillId, type(uint256).max, "");
        vm.prank(gateway);
        router.settle(reqId, true, bytes32("r"));
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(
            SwapRouter.RequestNotPending.selector, reqId
        ));
        router.settle(reqId, true, bytes32("r2"));
    }

    function test_settle_revertsOnUnknownRequest() public {
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(
            SwapRouter.RequestNotFound.selector, bytes32("unknown")
        ));
        router.settle(bytes32("unknown"), true, bytes32(0));
    }

    // ── claimRefund ───────────────────────────────────────────

    function test_claimRefund_afterTTL() public {
        uint256 balBefore = usdc.balanceOf(agent);
        vm.prank(agent);
        bytes32 reqId = router.swap(skillId, type(uint256).max, "");

        vm.warp(block.timestamp + router.REQUEST_TTL() + 1);
        vm.prank(agent);
        router.claimRefund(reqId);

        assertEq(usdc.balanceOf(agent), balBefore);
        assertEq(router.totalEscrowed(), 0);
        assertEq(uint8(_reqStatus(reqId)), uint8(SwapRouter.RequestStatus.Refunded));
    }

    function test_claimRefund_revertsBeforeTTL() public {
        vm.prank(agent);
        bytes32 reqId = router.swap(skillId, type(uint256).max, "");
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(
            SwapRouter.RequestNotExpired.selector, reqId
        ));
        router.claimRefund(reqId);
    }

    function test_claimRefund_revertsFromNonRequester() public {
        vm.prank(agent);
        bytes32 reqId = router.swap(skillId, type(uint256).max, "");
        // NotRequester check comes before TTL check in claimRefund.
        vm.warp(block.timestamp + router.REQUEST_TTL() + 1);
        vm.prank(otherAgent);
        vm.expectRevert(SwapRouter.NotRequester.selector);
        router.claimRefund(reqId);
    }

    // ── admin ─────────────────────────────────────────────────

    function test_setGateway_byOwner() public {
        address newGw = makeAddr("newGw");
        router.setGateway(newGw);
        assertEq(router.gateway(), newGw);
    }

    function test_setGateway_revertsFromNonOwner() public {
        vm.prank(agent);
        vm.expectRevert();
        router.setGateway(agent);
    }

    function test_setFees_valid() public {
        router.setFees(300, 200); // 3% + 2%
        assertEq(router.platformBps(), 300);
        assertEq(router.reputationBps(), 200);
    }

    function test_setFees_revertsOnInvalidBps() public {
        vm.expectRevert(SwapRouter.InvalidBps.selector);
        router.setFees(6_000, 5_000); // sums to >=10000
    }

    function test_rescueTokens_revertsWhenUsdcBacksOpenRequest() public {
        vm.prank(agent);
        router.swap(skillId, type(uint256).max, "");

        vm.expectRevert(abi.encodeWithSelector(SwapRouter.InsufficientSurplus.selector, 1, 0));
        router.rescueTokens(usdc, owner, 1);
    }

    function test_rescueTokens_allowsOnlyUsdcSurplus() public {
        vm.prank(agent);
        router.swap(skillId, type(uint256).max, "");
        usdc.mint(address(router), 123);

        router.rescueTokens(usdc, owner, 123);
        assertEq(usdc.balanceOf(owner), 123);
        assertEq(usdc.balanceOf(address(router)), PRICE);
    }

    // ── lifecycle: register → buy → execute → settle ─────────

    function test_fullLifecycle() public {
        // 1. Agent buys 5 credits.
        vm.prank(agent);
        router.buyRunToken(skillId, 5, type(uint256).max);
        assertEq(SkillRunToken(runToken).balanceOf(agent), 5);

        // 2. Execute once.
        vm.prank(agent);
        bytes32 reqId = router.executeSkill(skillId, hex"01");
        assertEq(SkillRunToken(runToken).balanceOf(agent), 4);
        assertEq(registry.treasury(skillId), PRICE * 4);

        // 3. Gateway settles success.
        vm.prank(gateway);
        router.settle(reqId, true, bytes32("result1"));

        assertEq(usdc.balanceOf(creator),  PRICE * 9_000 / 10_000);
        assertEq(usdc.balanceOf(platform), PRICE * 500   / 10_000);
        assertEq(usdc.balanceOf(repPool),  PRICE * 500   / 10_000);

        // 4. Second execution, gateway fails it → refund.
        vm.prank(agent);
        bytes32 reqId2 = router.executeSkill(skillId, hex"02");
        uint256 balBefore = usdc.balanceOf(agent);
        vm.prank(gateway);
        router.settle(reqId2, false, bytes32(0));
        assertEq(usdc.balanceOf(agent), balBefore + PRICE);

        // Remaining 3 credits still held.
        assertEq(SkillRunToken(runToken).balanceOf(agent), 3);
    }
}
