// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAnonZapRouter
/// @notice Interface for the AnonZap generic multi-step DeFi router
interface IAnonZapRouter {
    /// @notice Token input for a zap order
    /// @param token ERC20 token address, or address(0) for native ETH
    /// @param amount Amount of tokens to pull from user
    struct Input {
        address token;
        uint256 amount;
    }

    /// @notice Expected output after zap execution
    /// @param token ERC20 token address, or address(0) for native ETH
    /// @param minOutputAmount Minimum acceptable amount (slippage protection)
    struct Output {
        address token;
        uint256 minOutputAmount;
    }

    /// @notice Complete zap order describing inputs, outputs, and participants
    /// @param inputs Tokens to pull from user before steps execute
    /// @param outputs Minimum token balances to deliver to recipient after steps
    /// @param user Address that initiates and funds the order (must be msg.sender)
    /// @param recipient Address that receives the output tokens
    struct Order {
        Input[] inputs;
        Output[] outputs;
        address user;
        address recipient;
    }

    /// @notice Token balance reference used within a step for dynamic patching
    /// @param token Token to track balance of (address(0) = native ETH)
    /// @param index Byte offset in step calldata to patch with current balance.
    ///        Negative value (-1) means "use balance as msg.value but don't patch calldata"
    struct StepToken {
        address token;
        int32 index;
    }

    /// @notice Single execution step in the zap route
    /// @param target Contract to call
    /// @param value Static ETH value to send (overridden by dynamic ETH if StepToken uses address(0))
    /// @param data Calldata for the external call
    /// @param tokens Token balances to read and patch into calldata before the call
    struct Step {
        address target;
        uint256 value;
        bytes data;
        StepToken[] tokens;
    }

    /// @notice Emitted when a step's external call fails
    /// @param target Contract that was called
    /// @param value ETH value sent with the call
    /// @param data Calldata that was used
    error CallFailed(address target, uint256 value, bytes data);

    /// @notice Emitted when output amount is less than the minimum specified
    /// @param token Output token that failed the slippage check
    /// @param minAmount Required minimum amount
    /// @param actualAmount Actual balance received
    error SlippageExceeded(address token, uint256 minAmount, uint256 actualAmount);

    /// @notice Emitted when a step targets a forbidden address (router or tokenManager)
    /// @param target The disallowed target address
    error TargetNotAllowed(address target);

    /// @notice Emitted when native ETH sent is less than the input amount specified
    /// @param token Always address(0) for native ETH
    /// @param required Amount specified in the order input
    /// @param available Actual msg.value received
    error InsufficientInput(address token, uint256 required, uint256 available);

    /// @notice Emitted when msg.sender does not match order.user
    /// @param expected The order.user address
    /// @param actual The msg.sender address
    error InvalidCaller(address expected, address actual);

    /// @notice Emitted when an ETH transfer to a recipient fails
    /// @param recipient Address that could not receive ETH
    error EtherTransferFailed(address recipient);

    /// @notice Emitted when order.recipient is address(0)
    error InvalidRecipient();

    /// @notice Emitted after successful zap execution
    /// @param user Address that funded the order
    /// @param recipient Address that received the outputs
    /// @param inputCount Number of input tokens pulled
    /// @param stepCount Number of steps executed
    event OrderExecuted(
        address indexed user,
        address indexed recipient,
        uint256 inputCount,
        uint256 stepCount
    );

    /// @notice Emitted when tokens are returned to the recipient
    /// @param token Token address (ERC20 or address(0) for ETH)
    /// @param recipient Address tokens were sent to
    /// @param amount Amount transferred
    event TokenReturned(address indexed token, address indexed recipient, uint256 amount);

    /// @notice Execute a multi-step zap order
    /// @param order The complete order with inputs, outputs, user, and recipient
    /// @param steps Sequence of external calls to execute
    function executeOrder(Order calldata order, Step[] calldata steps) external payable;

    /// @notice Returns the immutable TokenManager address that handles user approvals
    /// @return Address of the AnonTokenManager contract
    function tokenManager() external view returns (address);
}
