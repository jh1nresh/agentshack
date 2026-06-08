// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SkillRegistry}  from "../src/SkillRegistry.sol";
import {SkillRunToken}  from "../src/SkillRunToken.sol";
import {MockUSDC}       from "./mocks/MockUSDC.sol";
import {Mock18DecimalsUSDC} from "./mocks/Mock18DecimalsUSDC.sol";

contract SkillRegistryTest is Test {
    SkillRegistry public registry;
    MockUSDC      public usdc;

    address owner    = address(this);
    address router   = makeAddr("router");
    address provider = makeAddr("provider");
    address creator  = makeAddr("creator");
    address agent    = makeAddr("agent");

    string  constant SLUG         = "web-scraper";
    uint256 constant PRICE        = 5_000;              // 0.005 USDC
    string  constant METADATA_URI = "ipfs://meta";
    bytes32 constant GATEWAY_SLUG = bytes32("web-scraper.v1");
    uint8   constant CATEGORY_SKILL = 0;

    function setUp() public {
        usdc     = new MockUSDC();
        registry = new SkillRegistry(usdc);
        registry.setRouter(router);
    }

    // ── register ──────────────────────────────────────────────

    function test_register_success() public {
        vm.prank(provider);
        (bytes32 skillId, address runToken) = registry.register(
            SLUG, PRICE, creator, METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0
        );

        assertEq(skillId, keccak256(bytes(SLUG)));

        SkillRegistry.Skill memory s = registry.getSkill(skillId);
        assertEq(s.provider, provider);
        assertEq(s.creator, creator);
        assertEq(s.runToken, runToken);
        assertEq(s.priceUSDC, PRICE);
        assertEq(s.minReputation, 0);
        assertEq(s.metadataURI, METADATA_URI);
        assertEq(s.gatewaySlug, GATEWAY_SLUG);
        assertEq(s.category, CATEGORY_SKILL);
        assertTrue(s.active);
        assertEq(s.registeredAt, block.timestamp);

        // Deployed token integrity.
        SkillRunToken token = SkillRunToken(runToken);
        assertEq(token.skillId(), skillId);
        assertEq(token.registry(), address(registry));
        assertEq(token.router(), router);
        assertEq(token.decimals(), 0);
        assertEq(token.name(), "Maiat Skill: web-scraper");
        // symbol = "MSK-" + first 8 hex of skillId
        assertTrue(bytes(token.symbol()).length == 12);
    }

    function test_register_deployTokenAtPredictedAddress() public {
        bytes32 skillId = keccak256(bytes(SLUG));
        address predicted = registry.computeRunTokenAddress(skillId, SLUG);

        vm.prank(provider);
        (, address runToken) = registry.register(
            SLUG, PRICE, creator, METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0
        );
        assertEq(runToken, predicted);
    }

    function test_register_revertsIfRouterNotSet() public {
        // Deploy fresh without setRouter.
        SkillRegistry fresh = new SkillRegistry(usdc);
        vm.prank(provider);
        vm.expectRevert(SkillRegistry.RouterNotSet.selector);
        fresh.register(SLUG, PRICE, creator, METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0);
    }

    function test_constructor_revertsOnNonSixDecimalUSDC() public {
        Mock18DecimalsUSDC wrongUsdc = new Mock18DecimalsUSDC();
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.InvalidUSDCDecimals.selector, 18, 6));
        new SkillRegistry(wrongUsdc);
    }

    function test_register_revertsOnEmptySlug() public {
        vm.prank(provider);
        vm.expectRevert(SkillRegistry.EmptySlug.selector);
        registry.register("", PRICE, creator, METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0);
    }

    function test_register_revertsOnZeroCreator() public {
        vm.prank(provider);
        vm.expectRevert(SkillRegistry.ZeroAddress.selector);
        registry.register(SLUG, PRICE, address(0), METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0);
    }

    function test_register_revertsOnPriceTooLow() public {
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.PriceTooLow.selector, 999, 1000));
        registry.register(SLUG, 999, creator, METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0);
    }

    function test_register_revertsOnDuplicate() public {
        vm.prank(provider);
        registry.register(SLUG, PRICE, creator, METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0);

        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(
            SkillRegistry.SkillAlreadyRegistered.selector, keccak256(bytes(SLUG))
        ));
        registry.register(SLUG, PRICE, creator, METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0);
    }

    // ── provider controls ─────────────────────────────────────

    function test_setPrice_byProvider() public {
        bytes32 skillId = _registerDefault();
        vm.prank(provider);
        registry.setPrice(skillId, 9_999);
        assertEq(registry.getSkill(skillId).priceUSDC, 9_999);
    }

    function test_setPrice_revertsFromNonProvider() public {
        bytes32 skillId = _registerDefault();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.NotSkillProvider.selector, skillId));
        registry.setPrice(skillId, 9_999);
    }

    function test_setPrice_revertsBelowMin() public {
        bytes32 skillId = _registerDefault();
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.PriceTooLow.selector, 500, 1000));
        registry.setPrice(skillId, 500);
    }

    function test_setActive_byProvider() public {
        bytes32 skillId = _registerDefault();
        vm.prank(provider);
        registry.setActive(skillId, false);
        assertFalse(registry.getSkill(skillId).active);
    }

    function test_setActive_byOwnerAsSafetyValve() public {
        bytes32 skillId = _registerDefault();
        // Owner can deactivate even if not provider.
        registry.setActive(skillId, false);
        assertFalse(registry.getSkill(skillId).active);
    }

    function test_setActive_revertsFromRandom() public {
        bytes32 skillId = _registerDefault();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.NotSkillProvider.selector, skillId));
        registry.setActive(skillId, false);
    }

    function test_setMinReputation_byProvider() public {
        bytes32 skillId = _registerDefault();
        vm.prank(provider);
        registry.setMinReputation(skillId, 42);
        assertEq(registry.getSkill(skillId).minReputation, 42);
    }

    function test_setMetadata_byProvider() public {
        bytes32 skillId = _registerDefault();
        vm.prank(provider);
        registry.setMetadata(skillId, "ipfs://v2");
        assertEq(registry.getSkill(skillId).metadataURI, "ipfs://v2");
    }

    // ── treasury (router-gated) ───────────────────────────────

    function test_depositTreasury_onlyRouter() public {
        bytes32 skillId = _registerDefault();
        usdc.mint(address(this), 1_000_000);
        usdc.approve(address(registry), 1_000_000);

        // Non-router reverts.
        vm.expectRevert(SkillRegistry.NotRouter.selector);
        registry.depositTreasury(skillId, 1_000_000);

        // Router succeeds.
        usdc.mint(router, 1_000_000);
        vm.startPrank(router);
        usdc.approve(address(registry), 1_000_000);
        registry.depositTreasury(skillId, 1_000_000);
        vm.stopPrank();

        assertEq(registry.treasury(skillId), 1_000_000);
    }

    function test_releaseTreasury_onlyRouter() public {
        bytes32 skillId = _registerDefault();
        _fundTreasury(skillId, 1_000_000);

        vm.expectRevert(SkillRegistry.NotRouter.selector);
        registry.releaseTreasury(skillId, address(this), 500_000);

        vm.prank(router);
        registry.releaseTreasury(skillId, address(this), 500_000);
        assertEq(registry.treasury(skillId), 500_000);
        assertEq(usdc.balanceOf(address(this)), 500_000);
    }

    function test_releaseTreasury_revertsOnInsufficient() public {
        bytes32 skillId = _registerDefault();
        _fundTreasury(skillId, 1_000);
        vm.prank(router);
        vm.expectRevert(abi.encodeWithSelector(
            SkillRegistry.InsufficientTreasury.selector, 2_000, 1_000
        ));
        registry.releaseTreasury(skillId, address(this), 2_000);
    }

    // ── helpers ───────────────────────────────────────────────

    function _registerDefault() internal returns (bytes32 skillId) {
        vm.prank(provider);
        (skillId, ) = registry.register(
            SLUG, PRICE, creator, METADATA_URI, GATEWAY_SLUG, CATEGORY_SKILL, 0
        );
    }

    function _fundTreasury(bytes32 skillId, uint256 amount) internal {
        usdc.mint(router, amount);
        vm.startPrank(router);
        usdc.approve(address(registry), amount);
        registry.depositTreasury(skillId, amount);
        vm.stopPrank();
    }
}
