// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICompliance
/// @notice Reglas de cumplimiento que el token consulta antes de cada movimiento.
interface ICompliance {
    event TokenBound(address indexed token);

    function boundToken() external view returns (address);

    /// @notice Comprueba si un movimiento es válido. `from == 0` indica emisión.
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);

    /// @notice Hooks llamados por el token después de cada movimiento.
    function transferred(address from, address to, uint256 amount) external;
    function created(address to, uint256 amount) external;
    function destroyed(address from, uint256 amount) external;
}
