// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SkillRunToken} from "../src/SkillRunToken.sol";

/// @dev Stub that satisfies ISkillRegistryRouter so SkillRunToken can resolve
///      its router address dynamically (audit finding #5 fix — no immutable router).
contract MockSkillRegistry {
    address public routerAddr;
    constructor(address router_) { routerAddr = router_; }
    function router() external view returns (address) { return routerAddr; }
}

contract SkillRunTokenTest is Test {
    SkillRunToken     public token;
    MockSkillRegistry public mockRegistry;

    address routerAddr = makeAddr("router");
    address agent      = makeAddr("agent");
    address attacker   = makeAddr("attacker");

    bytes32 constant SKILL_ID = keccak256("web-scraper");

    function setUp() public {
        mockRegistry = new MockSkillRegistry(routerAddr);
        // SkillRunToken constructor: (skillId, registry, name, symbol) — no router param
        // since audit #5 fix: router is resolved live from registry.router()
        token = new SkillRunToken(
            SKILL_ID, address(mockRegistry), "Maiat Skill: web-scraper", "MSK-abc123"
        );
    }

    function test_metadata() public view {
        assertEq(token.skillId(), SKILL_ID);
        assertEq(token.registry(), address(mockRegistry));
        assertEq(token.router(), routerAddr); // resolved through mockRegistry
        assertEq(token.decimals(), 0);
        assertEq(token.name(), "Maiat Skill: web-scraper");
        assertEq(token.symbol(), "MSK-abc123");
    }

    function test_mint_onlyRouter() public {
        vm.prank(routerAddr);
        token.mint(agent, 5);
        assertEq(token.balanceOf(agent), 5);
        assertEq(token.totalSupply(), 5);
    }

    function test_mint_revertsFromNonRouter() public {
        vm.prank(attacker);
        vm.expectRevert(SkillRunToken.OnlyRouter.selector);
        token.mint(agent, 5);
    }

    function test_burn_onlyRouter() public {
        // Mint tokens to agent
        vm.prank(routerAddr);
        token.mint(agent, 5);

        // Router burns from agent
        vm.prank(routerAddr);
        token.burn(agent, 3);
        assertEq(token.balanceOf(agent), 2);
        assertEq(token.totalSupply(), 2);
    }

    function test_burn_revertsFromNonRouter() public {
        vm.prank(routerAddr);
        token.mint(agent, 5);
        vm.prank(attacker);
        vm.expectRevert(SkillRunToken.OnlyRouter.selector);
        token.burn(agent, 1);
    }

    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(SkillRunToken.ZeroAddress.selector);
        new SkillRunToken(SKILL_ID, address(0), "bad", "BAD");
    }

    function test_transfer_allowedBetweenAgents() public {
        vm.prank(routerAddr);
        token.mint(agent, 5);
        address other = makeAddr("other");
        vm.prank(agent);
        token.transfer(other, 2);
        assertEq(token.balanceOf(agent), 3);
        assertEq(token.balanceOf(other), 2);
    }
}
