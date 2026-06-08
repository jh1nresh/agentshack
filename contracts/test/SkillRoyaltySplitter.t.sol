// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SkillNFT.sol";
import "../src/SkillRoyaltySplitter.sol";
import "./mocks/MockUSDC.sol";
import {Mock18DecimalsUSDC} from "./mocks/Mock18DecimalsUSDC.sol";

contract SkillRoyaltySplitterTest is Test {
    SkillNFT public nft;
    SkillRoyaltySplitter public splitter;
    MockUSDC public usdc;

    address owner    = address(this);
    address creator  = makeAddr("creator");
    address operator = makeAddr("operator");
    address buyer    = makeAddr("buyer");
    address platform = makeAddr("platform");
    address repPool  = makeAddr("repPool");

    uint256 constant AMOUNT = 1e6; // 1 USDC per service call

    function setUp() public {
        usdc = new MockUSDC();
        nft = new SkillNFT(address(usdc), platform, repPool);
        splitter = new SkillRoyaltySplitter(address(usdc), address(nft), platform);

        // Create a skill (id = 1)
        nft.createSkill(10e6, creator, 1500, "uri");

        // Operator buys the skill (must hold NFT per AUDIT-2 M-3)
        usdc.mint(operator, 100e6);
        vm.prank(operator);
        usdc.approve(address(nft), type(uint256).max);
        vm.prank(operator);
        nft.buySkill(1, operator);

        // Buyer funds for service payments
        usdc.mint(buyer, 1000e6);
        vm.prank(buyer);
        usdc.approve(address(splitter), type(uint256).max);
    }

    // ── pay ────────────────────────────────────────────────

    /// @dev F3 fix: pay() now credits pendingWithdrawals (pull pattern).
    ///      Recipients must call withdraw() to receive funds.
    function _withdrawAll() internal {
        vm.prank(operator); splitter.withdraw();
        vm.prank(creator);  splitter.withdraw();
        vm.prank(platform); splitter.withdraw();
    }

    function test_pay_splits() public {
        uint256 operatorBefore = usdc.balanceOf(operator);
        uint256 creatorBefore  = usdc.balanceOf(creator);
        uint256 platformBefore = usdc.balanceOf(platform);

        vm.prank(buyer);
        splitter.pay(1, operator, AMOUNT);
        _withdrawAll();

        // 80% operator, 15% creator, 5% platform
        assertEq(usdc.balanceOf(operator) - operatorBefore, 0.8e6);
        assertEq(usdc.balanceOf(creator) - creatorBefore, 0.15e6);
        assertEq(usdc.balanceOf(platform) - platformBefore, 0.05e6);
    }

    function test_constructor_revertsOnNonSixDecimalUSDC() public {
        Mock18DecimalsUSDC wrongUsdc = new Mock18DecimalsUSDC();
        vm.expectRevert(abi.encodeWithSelector(SkillRoyaltySplitter.InvalidUSDCDecimals.selector, 18, 6));
        new SkillRoyaltySplitter(address(wrongUsdc), address(nft), platform);
    }

    function test_pay_feeDustPolicyGoesToPlatform() public {
        vm.prank(buyer);
        splitter.pay(1, operator, 10_019);

        assertEq(splitter.pendingWithdrawals(operator), 8_015);
        assertEq(splitter.pendingWithdrawals(creator), 1_502);
        assertEq(splitter.pendingWithdrawals(platform), 502);
    }

    function test_pay_largeAmount() public {
        uint256 amount = 100e6; // 100 USDC
        uint256 operatorBefore = usdc.balanceOf(operator);

        vm.prank(buyer);
        splitter.pay(1, operator, amount);
        _withdrawAll();

        assertEq(usdc.balanceOf(operator) - operatorBefore, 80e6);
        assertEq(usdc.balanceOf(creator), 15e6 + 8.5e6); // from buySkill + pay
        assertEq(usdc.balanceOf(platform), 5e6 + 1e6);   // from pay + buySkill
    }

    function test_pay_revert_zeroOperator() public {
        vm.prank(buyer);
        vm.expectRevert(SkillRoyaltySplitter.InvalidAddress.selector);
        splitter.pay(1, address(0), AMOUNT);
    }

    function test_pay_revert_zeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(SkillRoyaltySplitter.ZeroAmount.selector);
        splitter.pay(1, operator, 0);
    }

    function test_pay_revert_nonexistentSkill() public {
        vm.prank(buyer);
        vm.expectRevert(); // getSkillActive reverts with InvalidSkillId
        splitter.pay(99, operator, AMOUNT);
    }

    function test_pay_revert_insufficientBalance() public {
        address poorBuyer = makeAddr("poor");
        usdc.mint(poorBuyer, 0.001e6);
        vm.prank(poorBuyer);
        usdc.approve(address(splitter), type(uint256).max);

        vm.prank(poorBuyer);
        vm.expectRevert();
        splitter.pay(1, operator, AMOUNT);
    }

    // ── AUDIT-2 M-3: operator must hold skill NFT ──────────

    function test_pay_revert_unauthorizedOperator() public {
        address fakeOperator = makeAddr("fakeOperator");
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                SkillRoyaltySplitter.UnauthorizedOperator.selector,
                fakeOperator,
                1
            )
        );
        splitter.pay(1, fakeOperator, AMOUNT);
    }

    // ── AUDIT-2 L-4: skill must be active ──────────────────

    function test_pay_revert_inactiveSkill() public {
        nft.setSkillActive(1, false);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SkillRoyaltySplitter.SkillInactive.selector, 1));
        splitter.pay(1, operator, AMOUNT);
    }

    // ── AUDIT-2 Lead: MIN_AMOUNT ───────────────────────────

    function test_pay_revert_amountTooLow() public {
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(SkillRoyaltySplitter.AmountTooLow.selector, 9999, 10000)
        );
        splitter.pay(1, operator, 9999);
    }

    function test_pay_minAmount() public {
        uint256 operatorBefore = usdc.balanceOf(operator);
        vm.prank(buyer);
        splitter.pay(1, operator, 10000); // exactly 0.01 USDC
        vm.prank(operator); splitter.withdraw();
        // operator gets 80% of 10000 = 8000
        assertEq(usdc.balanceOf(operator) - operatorBefore, 8000);
    }

    // ── AUDIT-2 M-2: no funds stuck in contract after pay + withdraw ──

    function test_pay_noFundsStuck() public {
        uint256 contractBefore = usdc.balanceOf(address(splitter));
        vm.prank(buyer);
        splitter.pay(1, operator, AMOUNT);
        assertEq(splitter.totalPendingWithdrawals(), AMOUNT);
        // After pull-pattern pay(), funds sit in pendingWithdrawals.
        // Once all recipients withdraw, nothing remains.
        _withdrawAll();
        assertEq(usdc.balanceOf(address(splitter)), contractBefore);
        assertEq(splitter.totalPendingWithdrawals(), 0);
    }

    // ── AUDIT-2 M-2: rescueTokens ─────────────────────────

    function test_rescueTokens() public {
        // Simulate stuck funds
        usdc.mint(address(splitter), 5e6);
        splitter.rescueTokens(IERC20(address(usdc)), platform, 5e6);
        assertEq(usdc.balanceOf(address(splitter)), 0);
    }

    function test_rescueTokens_revert_notOwner() public {
        vm.prank(buyer);
        vm.expectRevert();
        splitter.rescueTokens(IERC20(address(usdc)), buyer, 1e6);
    }

    function test_rescueTokens_revertsWhenUsdcBacksPendingWithdrawals() public {
        vm.prank(buyer);
        splitter.pay(1, operator, AMOUNT);

        vm.expectRevert(abi.encodeWithSelector(SkillRoyaltySplitter.InsufficientSurplus.selector, 1, 0));
        splitter.rescueTokens(IERC20(address(usdc)), platform, 1);
    }

    function test_rescueTokens_allowsOnlyUsdcSurplus() public {
        vm.prank(buyer);
        splitter.pay(1, operator, AMOUNT);
        usdc.mint(address(splitter), 123);

        splitter.rescueTokens(IERC20(address(usdc)), platform, 123);
        assertEq(usdc.balanceOf(platform), 1e6 + 123); // includes platform's SkillNFT purchase fee
        assertEq(usdc.balanceOf(address(splitter)), AMOUNT);
    }

    // ── setFeeSplit ────────────────────────────────────────

    function test_setFeeSplit() public {
        splitter.setFeeSplit(7000, 2000, 1000);
        assertEq(splitter.operatorBps(), 7000);
        assertEq(splitter.creatorBps(), 2000);
        assertEq(splitter.platformBps(), 1000);
    }

    function test_setFeeSplit_revert_notSum10000() public {
        vm.expectRevert(SkillRoyaltySplitter.InvalidFeeSplit.selector);
        splitter.setFeeSplit(7000, 2000, 500);
    }

    function test_setFeeSplit_revert_operatorTooLow() public {
        vm.expectRevert(SkillRoyaltySplitter.OperatorBpsTooLow.selector);
        splitter.setFeeSplit(4000, 4000, 2000);
    }

    // ── Events ─────────────────────────────────────────────

    function test_setFeeSplit_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit SkillRoyaltySplitter.FeeSplitUpdated(7000, 2000, 1000);
        splitter.setFeeSplit(7000, 2000, 1000);
    }

    function test_setPlatformWallet_emitsEvent() public {
        address newWallet = makeAddr("newPlatform");
        vm.expectEmit(false, false, false, true);
        emit SkillRoyaltySplitter.PlatformWalletUpdated(newWallet);
        splitter.setPlatformWallet(newWallet);
    }
}
