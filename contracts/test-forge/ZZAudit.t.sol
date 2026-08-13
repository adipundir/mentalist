// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IncoTest } from "@inco/lightning/src/test/IncoTest.sol";
import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Mentalist } from "../contracts/Mentalist.sol";
import { IJackpot, IJackpotRandomTicketBuyer } from "../contracts/Megapot.sol";

contract MockUSDC2 is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockJackpot2 is IJackpot, IJackpotRandomTicketBuyer {
    MockUSDC2 public token;
    uint256 public price = 1_000_000;
    bool public open = true;
    bool public priceReverts;
    /// referral paid back to the caller, in 1e4 bps of spend
    uint256 public referralBps = 1000; // 10%
    uint256 internal _nextId = 1;
    mapping(address => uint256) public ticketsOf;
    uint256 public referralOwed;

    constructor(MockUSDC2 _token) { token = _token; }
    function setOpen(bool v) external { open = v; }
    function setTicketPrice(uint256 v) external { price = v; }
    function setPriceReverts(bool v) external { priceReverts = v; }
    function ticketPrice() external view returns (uint256) {
        require(!priceReverts, "megapot down");
        return price;
    }
    function currentDrawingId() external pure returns (uint256) { return 1; }
    function allowTicketPurchases() external view returns (bool) { return open; }
    function referralFees(address) external pure returns (uint256) { return 0; }
    function claimReferralFees() external {
        uint256 owed = referralOwed;
        referralOwed = 0;
        if (owed != 0) token.mint(msg.sender, owed);
    }
    function jackpot() external view returns (address) { return address(this); }
    function usdc() external view returns (address) { return address(token); }

    function buyTickets(
        uint256 _count,
        address _recipient,
        address[] calldata,
        uint256[] calldata,
        bytes32
    ) external returns (uint256[] memory ids) {
        require(_count >= 1, "count");
        token.transferFrom(msg.sender, address(this), price * _count);
        referralOwed += (price * _count * referralBps) / 10_000;
        ids = new uint256[](_count);
        for (uint256 i; i < _count; ++i) ids[i] = _nextId++;
        ticketsOf[_recipient] += _count;
    }
}

contract AuditTest is IncoTest {
    Mentalist internal book;
    MockUSDC2 internal usdc;
    MockJackpot2 internal megapot;

    address internal jane = address(0x1A5E);
    address internal lisbon = address(0x115B0);
    address internal cho = address(0xC40);
    address internal dana = address(0xDA4A);

    uint16 internal constant CASE_ID = 1;
    uint8 internal constant SUSPECTS = 5;
    uint64 internal constant OPEN_FOR = 2 hours;
    uint256 internal constant RED_JOHN = 3;
    uint256 internal constant SOMEONE_ELSE = 1;

    function setUp() public override {
        super.setUp();
        usdc = new MockUSDC2();
        megapot = new MockJackpot2(usdc);
        book = new Mentalist(IJackpotRandomTicketBuyer(address(megapot)), address(this));
        vm.deal(address(this), 1_000 ether);
        vm.deal(address(book), 100 ether);
        address[4] memory players = [jane, lisbon, cho, dana];
        for (uint256 i; i < players.length; ++i) {
            vm.deal(players[i], 10 ether);
            usdc.mint(players[i], 1_000_000_000);
            vm.prank(players[i]);
            usdc.approve(address(book), type(uint256).max);
        }
    }

    function _open(uint16 caseId, uint256 personId) internal {
        bytes memory ct = fakePrepareEuint256Ciphertext(personId, address(this), address(book));
        book.openCase{ value: book.quoteFee() }(caseId, SUSPECTS, ct, OPEN_FOR);
        processAllOperations();
    }

    function _stake(address who, uint16 caseId, uint256 personId, uint256 amount) internal {
        bytes memory ct = fakePrepareEuint256Ciphertext(personId, who, address(book));
        uint256 fee = book.quoteFee();
        vm.startPrank(who);
        book.stake{ value: fee }(caseId, ct, amount);
        vm.stopPrank();
        processAllOperations();
    }

    function _closesAt(uint16 caseId) internal view returns (uint64 c) { (c,,,,,,,) = book.cases(caseId); }

    function _reachClose(uint16 caseId) internal {
        uint64 c = _closesAt(caseId);
        if (block.timestamp < c) vm.warp(c);
    }

    function _resolve(address who, uint16 caseId) internal {
        vm.prank(who);
        book.unseal(caseId);
        processAllOperations();
        (DecryptionAttestation memory att, bytes[] memory sigs) = getDecryptionAttestation(
            who,
            HandleWithProof({ handle: book.verdictHandle(caseId, who), proof: _emptyAllowanceProof() })
        );
        vm.prank(who);
        book.resolve(caseId, att, sigs);
    }

    function _settle(uint16 caseId) internal {
        uint64 w = book.FILING_WINDOW();
        uint64 c = _closesAt(caseId);
        if (block.timestamp < c + w) vm.warp(c + w + 1);
        book.settle(caseId);
    }

    function _pot(uint16 caseId) internal view returns (uint256) { (,,uint128 p,,,,,) = book.cases(caseId); return uint256(p); }

    // ─────────────────────────────────────────────────────────────
    // FINDING A: the "ticket bonus" is paid mostly in CASH, and is not covered
    // by the referral the purchase earns, once the ticket count clamps.
    // ─────────────────────────────────────────────────────────────
    function test_A_TicketBonusLeavesAsCashAndOutrunsTheReferral() public {
        megapot.setTicketPrice(10_000); // the live Base Sepolia quote: 0.01 USDC
        book.setRake(500, 500);
        book.setStakeRange(100_000, 5_000_000);

        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 5_000_000);
        _stake(lisbon, CASE_ID, SOMEONE_ELSE, 5_000_000);
        _stake(cho, CASE_ID, 0, 5_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _resolve(cho, CASE_ID);
        _settle(CASE_ID);

        uint256 surplusBefore = usdc.balanceOf(address(book)) - book.reserved(); // == the rake
        uint256 share = book.shareOf(CASE_ID, jane);
        uint256 cashBefore = usdc.balanceOf(jane);

        vm.prank(jane);
        uint256[] memory ids = book.payout(CASE_ID, true);

        uint256 cash = usdc.balanceOf(jane) - cashBefore;
        uint256 spentOnTickets = ids.length * 10_000;
        uint256 bonus = (share * 500) / 10_000;

        emit log_named_uint("share             ", share);
        emit log_named_uint("bonus (5% share)  ", bonus);
        emit log_named_uint("tickets bought    ", ids.length);
        emit log_named_uint("spent on tickets  ", spentOnTickets);
        emit log_named_uint("CASH handed over  ", cash);
        emit log_named_uint("rake collected    ", surplusBefore);
        emit log_named_uint("referral earned   ", megapot.referralOwed());
        emit log_named_uint("house left holding", usdc.balanceOf(address(book)));

        assertEq(spentOnTickets + cash, share + bonus, "the full bonus was paid");

        // The share alone already overshoots the hundred-ticket ceiling, so the bonus bought
        // NOT ONE extra ticket. Every unit of it went out of the door as cash.
        uint256 ticketsOnShareAlone = share / 10_000;
        if (ticketsOnShareAlone > 100) ticketsOnShareAlone = 100;
        assertEq(ids.length, ticketsOnShareAlone, "the bonus bought zero additional tickets");
        assertEq(cash, share + bonus - spentOnTickets, "so the whole bonus left as cash");

        // The comment says the referral on the purchase is 10% of the spend and therefore
        // covers twice the bonus. At the live ticket price it covers a seventh of it.
        assertLt(megapot.referralOwed(), bonus, "the referral it triggered does not cover it");
        assertLt(megapot.referralOwed() * 7, bonus, "not within a factor of seven of covering it");

        // And the bonus is paid out of the rake, which is what the house actually banked.
        assertLt(usdc.balanceOf(address(book)), surplusBefore, "the rake was eaten by the bonus");
        emit log_named_uint("rake left after ONE payout", usdc.balanceOf(address(book)));
    }

    /// The same defect with a live attacker rather than a leak: `setRake` bounds the rake at
    /// MAX_RAKE_BPS but does not bound the bonus at all. Set the bonus above the rake and any
    /// player who solves the (public) puzzle mints house money, one case at a time.
    function test_A2_AnUnboundedBonusLetsASolverMintHouseMoney() public {
        megapot.setTicketPrice(10_000);
        book.setRake(500, 2000); // 5% rake, 20% bonus. setRake accepts this without complaint.
        usdc.mint(address(book), 50_000_000); // referral fees the house has swept in

        uint256 houseBefore = usdc.balanceOf(address(book));
        uint256 herBefore = usdc.balanceOf(jane);

        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 5_000_000); // she read the alibis; she is alone in the room
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        vm.prank(jane);
        uint256[] memory ids = book.payout(CASE_ID, true);

        // what she ended the round with, counting her tickets at face value
        uint256 value = usdc.balanceOf(jane) + ids.length * 10_000;
        emit log_named_uint("she staked                   ", uint256(5_000_000));
        emit log_named_uint("wallet+tickets, net of stake ", value + 5_000_000 - herBefore);
        emit log_named_uint("house before", houseBefore);
        emit log_named_uint("house after ", usdc.balanceOf(address(book)));

        assertGt(value, herBefore, "risk-free profit on a puzzle whose answer ships in the repo");
        assertLt(usdc.balanceOf(address(book)), houseBefore, "and it came straight out of the house");
    }

    /// `setRake` will take any bonus at all, including 655%.
    function test_A3_SetRakeDoesNotBoundTheBonus() public {
        book.setRake(book.MAX_RAKE_BPS(), type(uint16).max);
        assertEq(book.ticketBonusBps(), type(uint16).max, "a 655% ticket bonus was accepted");
    }

    // ─────────────────────────────────────────────────────────────
    // FINDING B: a reverting ticketPrice() bricks payout even for wantTickets=false.
    // ─────────────────────────────────────────────────────────────
    function test_B_ARevertingTicketPriceFreezesEvenTheCashPayout() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        megapot.setPriceReverts(true);

        vm.prank(jane);
        vm.expectRevert(bytes("megapot down"));
        book.payout(CASE_ID, false);

        // and there is no other door: refund is shut on a case that had a winner
        vm.prank(jane);
        vm.expectRevert(Mentalist.DidNotWin.selector);
        book.refund(CASE_ID);
    }

    // ─────────────────────────────────────────────────────────────
    // Control: does reserved actually return to zero with a rake and an uneven split?
    // ─────────────────────────────────────────────────────────────
    function test_C_UnevenSplitWithRakeStillTelescopes() public {
        book.setRake(500, 0);
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_001);
        _stake(lisbon, CASE_ID, RED_JOHN, 2_000_003);
        _stake(cho, CASE_ID, SOMEONE_ELSE, 111_111);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _resolve(cho, CASE_ID);
        _settle(CASE_ID);

        uint256 a = book.shareOf(CASE_ID, jane);
        uint256 b = book.shareOf(CASE_ID, lisbon);
        assertEq(a + b, _pot(CASE_ID), "shares telescope to the raked pot exactly");

        vm.prank(jane);
        book.payout(CASE_ID, false);
        vm.prank(lisbon);
        book.payout(CASE_ID, false);
        assertEq(book.reserved(), 0, "reserved returns to zero");
        assertEq(usdc.balanceOf(address(book)), uint256(3_111_115) * 500 / 10_000, "only the rake remains");
    }

    /// Cross-case: does one case's bonus ever reach another case's reserved money?
    function test_D_BonusNeverTouchesAnotherCasesReservedMoney() public {
        book.setRake(500, 500);
        // case 1 settles with a rake, leaving house surplus
        _open(1, RED_JOHN);
        _stake(jane, 1, RED_JOHN, 5_000_000);
        _stake(lisbon, 1, SOMEONE_ELSE, 5_000_000);
        _reachClose(1);
        _resolve(jane, 1);
        _resolve(lisbon, 1);
        _settle(1);

        // case 2 is still open and fully reserved
        _open(2, 2);
        _stake(cho, 2, 2, 5_000_000);
        _stake(dana, 2, 0, 5_000_000);

        uint256 heldBefore = usdc.balanceOf(address(book));
        uint256 reservedBefore = book.reserved();
        assertGe(heldBefore, reservedBefore);

        vm.prank(jane);
        book.payout(1, true);

        assertGe(usdc.balanceOf(address(book)), book.reserved(), "held >= reserved still holds");
        assertGe(usdc.balanceOf(address(book)), 10_000_000, "case 2's stakes are all still here");
    }

    /// The owner drains every unit of surplus between settlement and the winners collecting.
    /// Do the winners still get paid in full afterwards?
    function test_E_OwnerDrainsSurplusBeforeWinnersCollect() public {
        book.setRake(1000, 500);
        _open(1, RED_JOHN);
        _stake(jane, 1, RED_JOHN, 3_000_000);
        _stake(lisbon, 1, RED_JOHN, 1_000_000);
        _stake(cho, 1, SOMEONE_ELSE, 5_000_000);
        // a second, still-open case whose money must not be reachable
        _open(2, 2);
        _stake(dana, 2, 2, 5_000_000);

        _reachClose(1);
        _resolve(jane, 1);
        _resolve(lisbon, 1);
        _resolve(cho, 1);
        _settle(1);

        uint256 a = book.shareOf(1, jane);
        uint256 b = book.shareOf(1, lisbon);

        book.withdrawSurplus(address(this)); // takes the rake, and only the rake
        assertEq(usdc.balanceOf(address(this)), uint256(9_000_000) * 1000 / 10_000, "exactly the rake");
        assertEq(usdc.balanceOf(address(book)), book.reserved(), "held == reserved, to the unit");

        uint256 janeBefore = usdc.balanceOf(jane);
        vm.prank(jane);
        uint256[] memory ids = book.payout(1, true);
        assertEq(
            usdc.balanceOf(jane) - janeBefore + ids.length * megapot.price(),
            a,
            "paid in full, bonus silently zero"
        );

        uint256 lisbonBefore = usdc.balanceOf(lisbon);
        vm.prank(lisbon);
        book.payout(1, false);
        assertEq(usdc.balanceOf(lisbon) - lisbonBefore, b, "and so is he");

        assertEq(book.reserved(), 5_000_000, "only the open case is still owed");
        assertEq(usdc.balanceOf(address(book)), 5_000_000, "and its money never moved");
    }

    /// Two winners, identical stakes, identical shares. The one who calls payout first eats
    /// the whole house surplus as their bonus; the second gets the crumbs.
    function test_F_TheBonusIsFirstComeFirstServedBetweenEqualWinners() public {
        megapot.setTicketPrice(10_000);
        book.setRake(500, 500);
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 5_000_000);
        _stake(lisbon, CASE_ID, RED_JOHN, 5_000_000);
        _stake(cho, CASE_ID, SOMEONE_ELSE, 5_000_000);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _resolve(cho, CASE_ID);
        _settle(CASE_ID);

        assertEq(book.shareOf(CASE_ID, jane), book.shareOf(CASE_ID, lisbon), "identical shares");

        uint256 janeBefore = usdc.balanceOf(jane);
        vm.prank(jane);
        uint256[] memory a = book.payout(CASE_ID, true);
        uint256 janeGot = usdc.balanceOf(jane) - janeBefore + a.length * 10_000;

        uint256 lisbonBefore = usdc.balanceOf(lisbon);
        vm.prank(lisbon);
        uint256[] memory b = book.payout(CASE_ID, true);
        uint256 lisbonGot = usdc.balanceOf(lisbon) - lisbonBefore + b.length * 10_000;

        emit log_named_uint("jane   (first)  total value", janeGot);
        emit log_named_uint("lisbon (second) total value", lisbonGot);
        assertGt(janeGot, lisbonGot, "same share, different money, decided by call order");
    }

    /// Invariant sweep over the whole lifecycle.
    function testFuzz_HeldNeverFallsBelowReserved(uint96 s1, uint96 s2, uint96 s3, uint16 rake, uint16 bonus) public {
        s1 = uint96(bound(s1, 100_000, 5_000_000));
        s2 = uint96(bound(s2, 100_000, 5_000_000));
        s3 = uint96(bound(s3, 100_000, 5_000_000));
        rake = uint16(bound(rake, 0, book.MAX_RAKE_BPS()));
        bonus = uint16(bound(bonus, 0, 2000));
        book.setRake(rake, bonus);
        megapot.setTicketPrice(10_000);

        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, s1);
        _stake(lisbon, CASE_ID, RED_JOHN, s2);
        _stake(cho, CASE_ID, SOMEONE_ELSE, s3);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _resolve(cho, CASE_ID);
        _settle(CASE_ID);

        assertEq(
            book.shareOf(CASE_ID, jane) + book.shareOf(CASE_ID, lisbon),
            _pot(CASE_ID),
            "telescoping is exact"
        );

        vm.prank(jane);
        book.payout(CASE_ID, true);
        assertGe(usdc.balanceOf(address(book)), book.reserved(), "solvent after the first payout");
        vm.prank(lisbon);
        book.payout(CASE_ID, true);
        assertGe(usdc.balanceOf(address(book)), book.reserved(), "solvent after the second");
        assertEq(book.reserved(), 0, "and nothing is left owed");
    }
}
