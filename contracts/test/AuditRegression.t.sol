// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import {SkillRegistry}      from "../src/SkillRegistry.sol";
import {SkillRunToken}      from "../src/SkillRunToken.sol";
import {SwapRouter}         from "../src/SwapRouter.sol";
import {ReputationHub}      from "../src/ReputationHub.sol";
import {MockUSDC}           from "./mocks/MockUSDC.sol";
import {MockBlacklistUSDC}  from "./mocks/MockBlacklistUSDC.sol";
import {MockTrustOracle}    from "./mocks/MockTrustOracle.sol";

/**
 * @title Audit Regression Tests — Phase 2 Commerce Layer
 * @notice One test per audit finding from the 2026-04-17 solidity-auditor run.
 *         Each test asserts the fix is live; each reverts that the bug survives
 *         would flag a real regression in the contracts.
 *
 * Findings covered:
 *  #1 shared-treasury + stale-price drain   (supply-gated setPrice)
 *  #2 permissionless slug squatting          (transferProvider owner-override)
 *  #3 no slippage on buy/swap                (maxPriceUSDC param)
 *  #4 USDC blacklist freezes funds           (pull-payment + rescueTokens)
 *  #5 router upgrade orphans skill tokens    (SkillRunToken dynamic router lookup)
 *  #6 setActive strands prepaid USDC         (redeemRunToken escape hatch)
 *  #7 setMinReputation bricks prepaid        (supply-gated setMinReputation)
 *  #8 no redeem path                         (redeemRunToken)
 *
 * LEADs also exercised: fee/treasury mid-flight snapshot, provider/creator
 * rotation, rescueTokens.
 */
contract AuditRegressionTest is Test {
    SkillRegistry   public registry;
    SwapRouter      public router;
    ReputationHub   public hub;
    MockUSDC        public usdc;
    MockTrustOracle public oracle;

    address owner     = address(this);
    address gateway   = makeAddr("gateway");
    address platform  = makeAddr("platform");
    address repPool   = makeAddr("reputationPool");
    address provider  = makeAddr("provider");
    address creator   = makeAddr("creator");
    address attacker  = makeAddr("attacker");
    address victim    = makeAddr("victim");

    string  constant SLUG  = "web-scraper";
    uint256 constant PRICE = 5_000; // 0.005 USDC

    bytes32 skillId;
    address runTokenAddr;

    function setUp() public {
        usdc     = new MockUSDC();
        oracle   = new MockTrustOracle();
        hub      = new ReputationHub(oracle);
        registry = new SkillRegistry(usdc);
        router = new SwapRouter(registry, hub, usdc, gateway, platform, repPool);
        registry.setRouter(address(router));

        vm.prank(provider);
        (skillId, runTokenAddr) = registry.register(
            SLUG, PRICE, creator, "ipfs://meta", bytes32("slug.v1"), 0, 0
        );

        // Seed victim + attacker with USDC, approve router.
        usdc.mint(victim,   1_000_000);
        usdc.mint(attacker, 1_000_000);
        vm.prank(victim);   usdc.approve(address(router), type(uint256).max);
        vm.prank(attacker); usdc.approve(address(router), type(uint256).max);

        // RUN_TOKEN burn is router-authorized; agents only approve USDC.
    }

    // ─────────────────────────────────────────────────────────
    //  #1 — Provider cannot change price while supply > 0
    // ─────────────────────────────────────────────────────────

    function test_F1_setPrice_revertsWhenSupplyOutstanding() public {
        // Victim pre-buys 10 tokens.
        vm.prank(victim);
        router.buyRunToken(skillId, 10, type(uint256).max);

        // Provider attempts to raise price → must revert with SupplyOutstanding.
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(SkillRegistry.SupplyOutstanding.selector, skillId, 10)
        );
        registry.setPrice(skillId, PRICE * 100);
    }

    function test_F1_setPrice_allowedAfterFullRedeem() public {
        vm.prank(victim);
        router.buyRunToken(skillId, 10, type(uint256).max);

        // Victim redeems all → supply back to 0 → setPrice works again.
        vm.prank(victim);
        router.redeemRunToken(skillId, 10);

        vm.prank(provider);
        registry.setPrice(skillId, PRICE * 2);
        (,,, uint256 newPrice,,,,,,) = registry.skills(skillId);
        assertEq(newPrice, PRICE * 2);
    }

    // ─────────────────────────────────────────────────────────
    //  #2 — Owner can reclaim squatted slug via transferProvider
    // ─────────────────────────────────────────────────────────

    function test_F2_transferProvider_reclaimsSquattedSlug() public {
        // Attacker registered a new slug first.
        vm.prank(attacker);
        (bytes32 squatId,) = registry.register(
            "openai-gpt5", PRICE, attacker, "", bytes32(0), 0, 0
        );
        (address before,,,,,,,,,) = registry.skills(squatId);
        assertEq(before, attacker);

        // Owner rotates provider to the legitimate team.
        address legitTeam = makeAddr("legitTeam");
        registry.transferProvider(squatId, legitTeam);
        (address after_,,,,,,,,,) = registry.skills(squatId);
        assertEq(after_, legitTeam);

        // Old attacker cannot setPrice anymore.
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.NotSkillProvider.selector, squatId));
        registry.setPrice(squatId, PRICE * 2);
    }

    function test_F2_transferProvider_revertsFromNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(); // Ownable: caller is not the owner
        registry.transferProvider(skillId, attacker);
    }

    // ─────────────────────────────────────────────────────────
    //  #3 — Slippage guard prevents front-run via setPrice is moot
    //       while supply > 0, but still active for first purchase
    // ─────────────────────────────────────────────────────────

    function test_F3_buyRunToken_respectsMaxPrice() public {
        // Supply is zero → provider CAN setPrice.
        vm.prank(provider);
        registry.setPrice(skillId, PRICE * 100);

        // Agent with cheap cap → revert.
        vm.prank(victim);
        vm.expectRevert(
            abi.encodeWithSelector(SwapRouter.PriceExceedsMax.selector, PRICE * 100, PRICE)
        );
        router.buyRunToken(skillId, 1, PRICE);
    }

    function test_F3_swap_respectsMaxPrice() public {
        vm.prank(provider);
        registry.setPrice(skillId, PRICE * 100);

        vm.prank(victim);
        vm.expectRevert(
            abi.encodeWithSelector(SwapRouter.PriceExceedsMax.selector, PRICE * 100, PRICE)
        );
        router.swap(skillId, PRICE, "");
    }

    // ─────────────────────────────────────────────────────────
    //  #4 — USDC blacklist triggers pull-payment fallback, not revert
    // ─────────────────────────────────────────────────────────

    function test_F4_blacklistedCreator_settleSucceedsWithDeferral() public {
        // Rebuild the stack using a blacklistable USDC to simulate Circle behavior.
        MockBlacklistUSDC blUsdc = new MockBlacklistUSDC();
        SkillRegistry r2   = new SkillRegistry(blUsdc);
        SwapRouter    rt2  = new SwapRouter(r2, hub, blUsdc, gateway, platform, repPool);
        r2.setRouter(address(rt2));

        vm.prank(provider);
        (bytes32 sid, address token) = r2.register(
            "blacklist-test", PRICE, creator, "", bytes32(0), 0, 0
        );

        blUsdc.mint(victim, 1_000_000);
        vm.prank(victim);
        blUsdc.approve(address(rt2), type(uint256).max);

        // Agent pays via 1-shot swap.
        vm.prank(victim);
        bytes32 reqId = rt2.swap(sid, PRICE, "");

        // Circle blacklists the creator before gateway settles.
        blUsdc.setBlacklisted(creator, true);

        // Gateway settles success → MUST NOT revert; creator share deferred.
        uint256 creatorShareExpected = PRICE - (PRICE * 500 / 10000) - (PRICE * 500 / 10000);
        vm.prank(gateway);
        rt2.settle(reqId, true, bytes32("result"));

        // Creator got nothing directly; amount is in pendingWithdrawal.
        assertEq(blUsdc.balanceOf(creator), 0);
        assertEq(rt2.pendingWithdrawal(creator), creatorShareExpected);

        // When Circle unblocks creator, they can pull the funds.
        blUsdc.setBlacklisted(creator, false);
        vm.prank(creator);
        rt2.claimPending();
        assertEq(blUsdc.balanceOf(creator), creatorShareExpected);
        assertEq(rt2.pendingWithdrawal(creator), 0);

        // Silence unused-var warnings.
        token;
    }

    function test_F4_rescueTokens_ownerOnly() public {
        // Send stray tokens to router.
        usdc.mint(address(router), 1_234);
        router.rescueTokens(usdc, address(this), 1_234);
        assertEq(usdc.balanceOf(address(this)), 1_234);
    }

    function test_F4_rescueTokens_revertsFromNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(); // Ownable
        router.rescueTokens(usdc, attacker, 1);
    }

    // ─────────────────────────────────────────────────────────
    //  #5 — Router rotation does NOT orphan existing SkillRunTokens
    // ─────────────────────────────────────────────────────────

    function test_F5_routerRotation_preservesTokenAuthority() public {
        // Buy tokens under the original router.
        vm.prank(victim);
        router.buyRunToken(skillId, 5, type(uint256).max);

        // Deploy a new router. Old one had mint/burn rights via `registry.router()`.
        SwapRouter newRouter = new SwapRouter(registry, hub, usdc, gateway, platform, repPool);
        registry.setRouter(address(newRouter));

        // The SAME SkillRunToken now authorises the NEW router.
        assertEq(SkillRunToken(runTokenAddr).router(), address(newRouter));

        // Old router can no longer call treasury ops — registry.router changed.
        vm.expectRevert(SkillRegistry.NotRouter.selector);
        vm.prank(address(router));
        registry.depositTreasury(skillId, PRICE);

        // Victim approves new router for USDC only.
        vm.prank(victim);
        usdc.approve(address(newRouter), type(uint256).max);

        // Redeem via new router — tokens + treasury NOT orphaned.
        vm.prank(victim);
        newRouter.redeemRunToken(skillId, 5);
        assertEq(SkillRunToken(runTokenAddr).balanceOf(victim), 0);
    }

    // ─────────────────────────────────────────────────────────
    //  #6 / #8 — Agents can redeem even after setActive(false)
    // ─────────────────────────────────────────────────────────

    function test_F6_redeemRunToken_worksWhenInactive() public {
        vm.prank(victim);
        router.buyRunToken(skillId, 10, type(uint256).max);
        uint256 startUsdc = usdc.balanceOf(victim);

        // Provider deactivates.
        vm.prank(provider);
        registry.setActive(skillId, false);

        // Victim can still redeem — no reputation check, no active check.
        vm.prank(victim);
        router.redeemRunToken(skillId, 10);

        assertEq(SkillRunToken(runTokenAddr).balanceOf(victim), 0);
        assertEq(usdc.balanceOf(victim), startUsdc + PRICE * 10);
    }

    function test_F8_redeemRunToken_partial() public {
        vm.prank(victim);
        router.buyRunToken(skillId, 10, type(uint256).max);

        vm.prank(victim);
        router.redeemRunToken(skillId, 3);
        assertEq(SkillRunToken(runTokenAddr).balanceOf(victim), 7);
        assertEq(registry.treasury(skillId), PRICE * 7);
    }

    function test_F8_redeemRunToken_revertsOnInsufficientBalance() public {
        vm.prank(victim);
        router.buyRunToken(skillId, 2, type(uint256).max);

        vm.prank(victim);
        vm.expectRevert(
            abi.encodeWithSelector(SwapRouter.InsufficientTokenBalance.selector, 2, 10)
        );
        router.redeemRunToken(skillId, 10);
    }

    // ─────────────────────────────────────────────────────────
    //  #7 — Provider cannot raise reputation floor while supply > 0
    // ─────────────────────────────────────────────────────────

    function test_F7_setMinReputation_revertsWhenSupplyOutstanding() public {
        vm.prank(victim);
        router.buyRunToken(skillId, 5, type(uint256).max);

        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(SkillRegistry.SupplyOutstanding.selector, skillId, 5)
        );
        registry.setMinReputation(skillId, 1000);
    }

    // ─────────────────────────────────────────────────────────
    //  LEADs — in-flight admin mutation does not change settle outcome
    // ─────────────────────────────────────────────────────────

    function test_LEAD_feeChangeDoesNotAffectInFlightRequest() public {
        // Agent opens a request at 5%/5% fees.
        vm.prank(victim);
        bytes32 reqId = router.swap(skillId, PRICE, "");

        // Owner later hikes platform fee to 90%.
        router.setFees(9000, 500);

        // Settle success uses the SNAPSHOTTED fees (5%/5%), not current.
        uint256 expectedPlatform   = (PRICE * 500) / 10000; // snapshotted
        uint256 expectedReputation = (PRICE * 500) / 10000;
        uint256 expectedCreator    = PRICE - expectedPlatform - expectedReputation;

        vm.prank(gateway);
        router.settle(reqId, true, bytes32("ok"));

        assertEq(usdc.balanceOf(creator),  expectedCreator);
        assertEq(usdc.balanceOf(platform), expectedPlatform);
        assertEq(usdc.balanceOf(repPool),  expectedReputation);
    }

    function test_LEAD_treasuryAddressChangeDoesNotAffectInFlight() public {
        vm.prank(victim);
        bytes32 reqId = router.swap(skillId, PRICE, "");

        // Owner rotates treasury destinations.
        address newPlatform = makeAddr("newPlatform");
        address newRep      = makeAddr("newRep");
        router.setTreasuries(newPlatform, newRep);

        vm.prank(gateway);
        router.settle(reqId, true, bytes32("ok"));

        // Old snapshot destinations still received funds.
        assertGt(usdc.balanceOf(platform), 0);
        assertGt(usdc.balanceOf(repPool),  0);
        assertEq(usdc.balanceOf(newPlatform), 0);
        assertEq(usdc.balanceOf(newRep),      0);
    }

    function test_LEAD_setCreator_routesFutureRequestsToNewCreator() public {
        address newCreator = makeAddr("newCreator");
        vm.prank(provider);
        registry.setCreator(skillId, newCreator);

        vm.prank(victim);
        bytes32 reqId = router.swap(skillId, PRICE, "");
        vm.prank(gateway);
        router.settle(reqId, true, bytes32("ok"));

        // New creator receives the share; old creator gets nothing.
        assertEq(usdc.balanceOf(creator), 0);
        assertGt(usdc.balanceOf(newCreator), 0);
    }

    // ─────────────────────────────────────────────────────────
    //  Category validation (audit LEAD)
    // ─────────────────────────────────────────────────────────

    function test_LEAD_register_revertsOnInvalidCategory() public {
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(SkillRegistry.InvalidCategory.selector, uint8(3))
        );
        registry.register("bad-cat", PRICE, creator, "", bytes32(0), 3, 0);
    }
}
