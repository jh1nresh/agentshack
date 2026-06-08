// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SkillNFT.sol";
import "./mocks/MockUSDC.sol";
import {Mock18DecimalsUSDC} from "./mocks/Mock18DecimalsUSDC.sol";

contract SkillNFTTest is Test {
    SkillNFT public nft;
    MockUSDC public usdc;

    address owner    = address(this);
    address creator  = makeAddr("creator");
    address buyer    = makeAddr("buyer");
    address platform = makeAddr("platform");
    address repPool  = makeAddr("repPool");

    uint256 constant PRICE = 10e6; // 10 USDC

    function setUp() public {
        usdc = new MockUSDC();
        nft = new SkillNFT(address(usdc), platform, repPool);

        usdc.mint(buyer, 1000e6);
        vm.prank(buyer);
        usdc.approve(address(nft), type(uint256).max);
    }

    // ── createSkill ────────────────────────────────────────

    function test_createSkill() public {
        uint256 id = nft.createSkill(PRICE, creator, 1500, "ipfs://skill1");
        assertEq(id, 1); // L-05: starts at 1

        SkillNFT.Skill memory s = nft.getSkill(1);
        assertEq(s.price, PRICE);
        assertEq(s.creator, creator);
        assertEq(s.royaltyBps, 1500);
        assertEq(s.totalSold, 0);
        assertTrue(s.active);
    }

    function test_constructor_revertsOnNonSixDecimalUSDC() public {
        Mock18DecimalsUSDC wrongUsdc = new Mock18DecimalsUSDC();
        vm.expectRevert(abi.encodeWithSelector(SkillNFT.InvalidUSDCDecimals.selector, 18, 6));
        new SkillNFT(address(wrongUsdc), platform, repPool);
    }

    function test_createSkill_incrementsId() public {
        uint256 id1 = nft.createSkill(PRICE, creator, 1500, "a");
        uint256 id2 = nft.createSkill(PRICE, creator, 1500, "b");
        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_createSkill_revert_notOwner() public {
        vm.prank(buyer);
        vm.expectRevert();
        nft.createSkill(PRICE, creator, 1500, "a");
    }

    function test_createSkill_revert_zeroCreator() public {
        vm.expectRevert(SkillNFT.InvalidAddress.selector);
        nft.createSkill(PRICE, address(0), 1500, "a");
    }

    // C-01: price must be >= MIN_PRICE
    function test_createSkill_revert_zeroPrice() public {
        vm.expectRevert(abi.encodeWithSelector(SkillNFT.PriceTooLow.selector, 0, 10000));
        nft.createSkill(0, creator, 1500, "a");
    }

    function test_createSkill_revert_priceTooLow() public {
        vm.expectRevert(abi.encodeWithSelector(SkillNFT.PriceTooLow.selector, 9999, 10000));
        nft.createSkill(9999, creator, 1500, "a");
    }

    function test_createSkill_minPrice() public {
        uint256 id = nft.createSkill(10000, creator, 1500, "min"); // exactly 0.01 USDC
        assertEq(id, 1);
    }

    // ── buySkill ───────────────────────────────────────────

    function test_buySkill_splits() public {
        nft.createSkill(PRICE, creator, 1500, "uri");

        uint256 creatorBefore  = usdc.balanceOf(creator);
        uint256 platformBefore = usdc.balanceOf(platform);
        uint256 repPoolBefore  = usdc.balanceOf(repPool);

        vm.prank(buyer);
        nft.buySkill(1, buyer);

        // 10% platform = 1 USDC, 5% rep pool = 0.5 USDC, 85% creator = 8.5 USDC
        assertEq(usdc.balanceOf(platform) - platformBefore, 1e6);
        assertEq(usdc.balanceOf(repPool) - repPoolBefore, 0.5e6);
        assertEq(usdc.balanceOf(creator) - creatorBefore, 8.5e6);

        // NFT minted
        assertEq(nft.balanceOf(buyer, 1), 1);

        // totalSold
        assertEq(nft.getSkill(1).totalSold, 1);
    }

    function test_buySkill_feeDustPolicyGoesToCreator() public {
        nft.createSkill(10_019, creator, 1500, "uri");

        vm.prank(buyer);
        nft.buySkill(1, buyer);

        assertEq(usdc.balanceOf(platform), 1_001);
        assertEq(usdc.balanceOf(repPool), 500);
        assertEq(usdc.balanceOf(creator), 8_518);
    }

    function test_buySkill_multipleBuys() public {
        nft.createSkill(PRICE, creator, 1500, "uri");

        vm.startPrank(buyer);
        nft.buySkill(1, buyer);
        nft.buySkill(1, buyer);
        vm.stopPrank();

        assertEq(nft.balanceOf(buyer, 1), 2);
        assertEq(nft.getSkill(1).totalSold, 2);
    }

    // M-04: setSkillActive (deactivate + reactivate)
    function test_setSkillActive_deactivate() public {
        nft.createSkill(PRICE, creator, 1500, "uri");
        nft.setSkillActive(1, false);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SkillNFT.SkillInactive.selector, 1));
        nft.buySkill(1, buyer);
    }

    function test_setSkillActive_reactivate() public {
        nft.createSkill(PRICE, creator, 1500, "uri");
        nft.setSkillActive(1, false);
        nft.setSkillActive(1, true);

        vm.prank(buyer);
        nft.buySkill(1, buyer); // should work again
        assertEq(nft.balanceOf(buyer, 1), 1);
    }

    function test_buySkill_revert_nonexistent() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SkillNFT.InvalidSkillId.selector, 99));
        nft.buySkill(99, buyer);
    }

    // L-05: skill ID 0 is invalid
    function test_buySkill_revert_id0() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SkillNFT.InvalidSkillId.selector, 0));
        nft.buySkill(0, buyer);
    }

    function test_buySkill_revert_insufficientBalance() public {
        nft.createSkill(PRICE, creator, 1500, "uri");

        address poorBuyer = makeAddr("poor");
        usdc.mint(poorBuyer, 1e6);
        vm.prank(poorBuyer);
        usdc.approve(address(nft), type(uint256).max);

        vm.prank(poorBuyer);
        vm.expectRevert(); // safeTransferFrom reverts natively
        nft.buySkill(1, poorBuyer);
    }

    // ── royaltyInfo (ERC-2981) ─────────────────────────────

    function test_royaltyInfo() public {
        nft.createSkill(PRICE, creator, 1500, "uri");

        (address receiver, uint256 royaltyAmount) = nft.royaltyInfo(1, 100e6);
        assertEq(receiver, creator);
        assertEq(royaltyAmount, 15e6); // 15% of 100 USDC
    }

    // ── URI ────────────────────────────────────────────────

    function test_uri() public {
        nft.createSkill(PRICE, creator, 1500, "ipfs://skill1");
        assertEq(nft.uri(1), "ipfs://skill1");
    }

    // ── M-01: getSkill / getCreator bounds checks ──────────

    function test_getSkill_revert_nonexistent() public {
        vm.expectRevert(abi.encodeWithSelector(SkillNFT.InvalidSkillId.selector, 99));
        nft.getSkill(99);
    }

    function test_getCreator_revert_nonexistent() public {
        vm.expectRevert(abi.encodeWithSelector(SkillNFT.InvalidSkillId.selector, 99));
        nft.getCreator(99);
    }

    // ── C-03: rescueTokens ─────────────────────────────────

    function test_rescueTokens() public {
        // Send some USDC directly to contract (simulating stuck funds)
        usdc.mint(address(nft), 5e6);
        assertEq(usdc.balanceOf(address(nft)), 5e6);

        nft.rescueTokens(IERC20(address(usdc)), platform, 5e6);
        assertEq(usdc.balanceOf(address(nft)), 0);
        assertEq(usdc.balanceOf(platform), 5e6);
    }

    function test_rescueTokens_revert_notOwner() public {
        vm.prank(buyer);
        vm.expectRevert();
        nft.rescueTokens(IERC20(address(usdc)), buyer, 1e6);
    }

    // ── Admin setters ──────────────────────────────────────

    // AUDIT-2 M-1: atomic setFees replaces separate setters
    function test_setFees_atomic() public {
        nft.setFees(500, 200);
        assertEq(nft.platformFeeBps(), 500);
        assertEq(nft.reputationPoolBps(), 200);
    }

    function test_setFees_revert_tooHigh() public {
        vm.expectRevert(SkillNFT.InvalidBps.selector);
        nft.setFees(9500, 500); // sum = 10000, must be < 10000
    }

    function test_setFees_revert_notOwner() public {
        vm.prank(buyer);
        vm.expectRevert();
        nft.setFees(500, 200);
    }

    // ── ISkillNFT interface views ──────────────────────────

    function test_getSkillActive() public {
        nft.createSkill(PRICE, creator, 1500, "uri");
        assertTrue(nft.getSkillActive(1));
        nft.setSkillActive(1, false);
        assertFalse(nft.getSkillActive(1));
    }

    function test_getSkillRoyaltyBps() public {
        nft.createSkill(PRICE, creator, 1500, "uri");
        assertEq(nft.getSkillRoyaltyBps(1), 1500);
    }
}
