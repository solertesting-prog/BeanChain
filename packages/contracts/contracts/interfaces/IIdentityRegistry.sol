// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IIdentityRegistry
/// @notice Registro de inversores verificados (KYC/AML) al estilo ERC-3643.
interface IIdentityRegistry {
    event IdentityRegistered(address indexed wallet, uint16 country, uint64 expiresAt, bytes32 kycRef);
    event IdentityUpdated(address indexed wallet, uint16 country, uint64 expiresAt);
    event IdentityRemoved(address indexed wallet);

    /// @notice true si la wallet tiene KYC vigente.
    function isVerified(address wallet) external view returns (bool);

    /// @notice Código de país ISO 3166-1 numérico del inversor (0 si no existe).
    function investorCountry(address wallet) external view returns (uint16);

    /// @notice true si la wallet figura en el registro, esté o no vigente.
    function contains(address wallet) external view returns (bool);
}
