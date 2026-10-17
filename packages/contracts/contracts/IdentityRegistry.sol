// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title IdentityRegistry
/// @notice Registro compartido de wallets que han superado el KYC en la plataforma.
/// @dev Simplificación del Identity Registry de ERC-3643 (T-REX) sin ONCHAINID:
///      la verificación la realiza off-chain el proveedor de KYC y un agente de la
///      plataforma la refleja aquí. `kycRef` es un hash opaco de la verificación,
///      nunca datos personales.
contract IdentityRegistry is AccessControl, IIdentityRegistry {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    struct Identity {
        bool exists;
        uint16 country;
        uint64 expiresAt; // 0 = sin caducidad
        bytes32 kycRef;
    }

    mapping(address => Identity) private _identities;
    uint256 public identityCount;

    error ZeroAddress();
    error AlreadyRegistered(address wallet);
    error NotRegistered(address wallet);
    error InvalidCountry();
    error LengthMismatch();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Escritura (agentes)
    // ---------------------------------------------------------------------

    function registerIdentity(address wallet, uint16 country, uint64 expiresAt, bytes32 kycRef)
        public
        onlyRole(AGENT_ROLE)
    {
        if (wallet == address(0)) revert ZeroAddress();
        if (country == 0) revert InvalidCountry();
        if (_identities[wallet].exists) revert AlreadyRegistered(wallet);
        _identities[wallet] = Identity({exists: true, country: country, expiresAt: expiresAt, kycRef: kycRef});
        unchecked {
            identityCount++;
        }
        emit IdentityRegistered(wallet, country, expiresAt, kycRef);
    }

    function batchRegisterIdentity(
        address[] calldata wallets,
        uint16[] calldata countries,
        uint64[] calldata expiries,
        bytes32[] calldata kycRefs
    ) external onlyRole(AGENT_ROLE) {
        uint256 n = wallets.length;
        if (countries.length != n || expiries.length != n || kycRefs.length != n) revert LengthMismatch();
        for (uint256 i = 0; i < n; i++) {
            registerIdentity(wallets[i], countries[i], expiries[i], kycRefs[i]);
        }
    }

    function updateIdentity(address wallet, uint16 country, uint64 expiresAt) external onlyRole(AGENT_ROLE) {
        Identity storage id = _identities[wallet];
        if (!id.exists) revert NotRegistered(wallet);
        if (country == 0) revert InvalidCountry();
        id.country = country;
        id.expiresAt = expiresAt;
        emit IdentityUpdated(wallet, country, expiresAt);
    }

    function deleteIdentity(address wallet) external onlyRole(AGENT_ROLE) {
        if (!_identities[wallet].exists) revert NotRegistered(wallet);
        delete _identities[wallet];
        unchecked {
            identityCount--;
        }
        emit IdentityRemoved(wallet);
    }

    // ---------------------------------------------------------------------
    // Lectura
    // ---------------------------------------------------------------------

    function isVerified(address wallet) external view returns (bool) {
        Identity storage id = _identities[wallet];
        return id.exists && (id.expiresAt == 0 || id.expiresAt > block.timestamp);
    }

    function investorCountry(address wallet) external view returns (uint16) {
        return _identities[wallet].country;
    }

    function contains(address wallet) external view returns (bool) {
        return _identities[wallet].exists;
    }

    function identityOf(address wallet) external view returns (Identity memory) {
        return _identities[wallet];
    }
}
