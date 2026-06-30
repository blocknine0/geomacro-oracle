// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AgentArena (Memory Optimized)
 * -----------------------------
 * Anti-MEV, DAO Dispute, and 1.5% Revenue Platform Fee enabled.
 * Scoped blocks used to prevent EVM 'Stack too deep' compilation errors.
 */
contract AgentArena {
    address public owner;
    address public treasury; 

    uint256 public constant DISPUTE_FEE = 50 * 10**6;            // ৫০ USDC
    uint256 public constant DISPUTE_WINDOW = 24 * 60 * 60;        // ২৪ ঘণ্টা
    uint256 public constant MIN_VOLUME_FOR_DISPUTE = 500 * 10**6;  // ৫০০ USDC
    uint256 public constant MIN_VOTE_AMOUNT = 5 * 10**6;          // ৫ USDC
    uint256 public constant PROTOCOL_FEE_BPS = 150;              // ১.৫% (150 BPS)
    uint256 public constant TREASURY_DISPUTE_SHARE_BPS = 3000;    // ৩০%

    enum Side { NONE, HAWK, DOVE }
    enum Status { OPEN, LOCKED, AI_RESOLVED, DISPUTED, FINALIZED }

    struct Market {
        string marketId;
        Status status;
        Side winner;          
        Side tentativeWinner; 
        uint256 hawkTotal;
        uint256 doveTotal;
        uint256 stakingEndTime;
        uint256 resolutionTime;
        uint256 aiResolutionTime;
        address disputer;
        uint256 hawkVotes;    
        uint256 doveVotes;    
        bool exists;
    }

    mapping(string => Market) public markets;
    mapping(string => mapping(address => mapping(Side => uint256))) public stakes;
    mapping(string => mapping(address => uint256)) public userVotes;
    mapping(string => mapping(address => bool)) public claimed;

    event MarketCreated(string marketId, uint256 stakingEndTime, uint256 resolutionTime);
    event Staked(string marketId, address indexed user, Side side, uint256 amount);
    event AIResolved(string marketId, Side tentativeWinner);
    event Disputed(string marketId, address indexed disputer);
    event DAOExceptionVoted(string marketId, address indexed voter, Side side, uint256 amount);
    event Finalized(string marketId, Side finalWinner);
    event Claimed(string marketId, address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _treasury) {
        owner = msg.sender;
        treasury = _treasury;
    }

    function createMarket(
        string calldata marketId, 
        uint256 stakingDuration, 
        uint256 resolutionDuration
    ) external onlyOwner {
        require(!markets[marketId].exists, "Market already exists");

        markets[marketId] = Market({
            marketId: marketId,
            status: Status.OPEN,
            winner: Side.NONE,
            tentativeWinner: Side.NONE,
            hawkTotal: 0,
            doveTotal: 0,
            stakingEndTime: block.timestamp + stakingDuration,     
            resolutionTime: block.timestamp + resolutionDuration, 
            aiResolutionTime: 0,
            disputer: address(0),
            hawkVotes: 0,
            doveVotes: 0,
            exists: true
        });

        emit MarketCreated(marketId, block.timestamp + stakingDuration, block.timestamp + resolutionDuration);
    }

    function declareWinnerByAI(string calldata marketId, Side winningSide) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.OPEN, "Invalid status");
        require(block.timestamp >= m.resolutionTime, "Too early to resolve");
        require(winningSide == Side.HAWK || winningSide == Side.DOVE, "Invalid side");

        m.status = Status.AI_RESOLVED;
        m.tentativeWinner = winningSide;
        m.aiResolutionTime = block.timestamp;

        emit AIResolved(marketId, winningSide);
    }

    function finalizeMarket(string calldata marketId) external {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");

        if (m.status == Status.AI_RESOLVED && block.timestamp > m.aiResolutionTime + DISPUTE_WINDOW) {
            m.winner = m.tentativeWinner;
            m.status = Status.FINALIZED;
            emit Finalized(marketId, m.winner);
        } 
        else if (m.status == Status.DISPUTED && block.timestamp > m.aiResolutionTime + DISPUTE_WINDOW + (24 * 60 * 60)) {
            m.winner = m.hawkVotes > m.doveVotes ? Side.HAWK : Side.DOVE;
            m.status = Status.FINALIZED;

            if (m.winner != m.tentativeWinner) {
                payable(m.disputer).transfer(DISPUTE_FEE);
            } else {
                uint256 treasuryShare = (DISPUTE_FEE * TREASURY_DISPUTE_SHARE_BPS) / 10000;
                payable(treasury).transfer(treasuryShare);
            }
            emit Finalized(marketId, m.winner);
        }
    }

    function stake(string calldata marketId, Side side) external payable {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.OPEN, "Market closed");
        require(block.timestamp <= m.stakingEndTime, "Staking period has ended"); 
        require(side == Side.HAWK || side == Side.DOVE, "Invalid side");
        require(msg.value > 0, "Stake must be > 0");

        stakes[marketId][msg.sender][side] += msg.value;

        if (side == Side.HAWK) {
            m.hawkTotal += msg.value;
        } else {
            m.doveTotal += msg.value;
        }

        emit Staked(marketId, msg.sender, side, msg.value);
    }

    function disputeMarket(string calldata marketId) external payable {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.AI_RESOLVED, "Not in dispute phase");
        require(block.timestamp <= m.aiResolutionTime + DISPUTE_WINDOW, "Dispute window closed");
        require(msg.value == DISPUTE_FEE, "Must send exactly 50 USDC");
        require(m.hawkTotal + m.doveTotal >= MIN_VOLUME_FOR_DISPUTE, "Volume too low for disputes");

        m.disputer = msg.sender;
        m.status = Status.DISPUTED;

        emit Disputed(marketId, msg.sender);
    }

    function voteOnDispute(string calldata marketId, Side side) external payable {
        Market storage m = markets[marketId];
        require(m.status == Status.DISPUTED, "Market is not disputed");
        require(block.timestamp <= m.aiResolutionTime + DISPUTE_WINDOW + (24 * 60 * 60), "Voting has ended");
        require(msg.value >= MIN_VOTE_AMOUNT, "Vote amount below minimum");
        require(side == Side.HAWK || side == Side.DOVE, "Invalid side");

        if (side == Side.HAWK) {
            m.hawkVotes += msg.value;
        } else {
            m.doveVotes += msg.value;
        }
        userVotes[marketId][msg.sender] += msg.value;

        emit DAOExceptionVoted(marketId, msg.sender, side, msg.value);
    }

    // Stack limiting এড়াতে Scoped bracket `{}` ব্যবহার করে অপ্টিমাইজড claim ফাংশন
    function claim(string calldata marketId) external {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.FINALIZED, "Market not finalized yet");
        require(!claimed[marketId][msg.sender], "Already claimed");

        Side winSide = m.winner;
        uint256 totalUserStaked = stakes[marketId][msg.sender][winSide];
        
        if ((winSide == Side.HAWK && m.hawkVotes > m.doveVotes) || (winSide == Side.DOVE && m.doveVotes > m.hawkVotes)) {
            totalUserStaked += userVotes[marketId][msg.sender];
        }
        
        require(totalUserStaked > 0, "Nothing to claim");

        uint256 payout = totalUserStaked;
        {
            uint256 winningPoolTotal = winSide == Side.HAWK ? m.hawkTotal : m.doveTotal;
            uint256 losingPoolTotal = winSide == Side.HAWK ? m.doveTotal : m.hawkTotal;
            if (winningPoolTotal > 0 && losingPoolTotal > 0) {
                payout += (totalUserStaked * losingPoolTotal) / winningPoolTotal;
            }
        } // winningPoolTotal এবং losingPoolTotal এখান থেকে স্ট্যাক মেমোরি খালি করে দেবে

        claimed[marketId][msg.sender] = true;

        uint256 platformFee = (payout * PROTOCOL_FEE_BPS) / 10000;

        (bool feeSent, ) = treasury.call{value: platformFee}("");
        require(feeSent, "Protocol fee transfer failed");

        (bool sent, ) = msg.sender.call{value: payout - platformFee}("");
        require(sent, "Payout transfer failed");

        emit Claimed(marketId, msg.sender, payout - platformFee);
    }
}
