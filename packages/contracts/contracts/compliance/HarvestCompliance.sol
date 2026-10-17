// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICompliance} from "../interfaces/ICompliance.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @title HarvestCompliance
/// @notice Reglas de una emisión concreta: países bloqueados (sanciones o
///         jurisdicciones sin autorización), saldo máximo por inversor y número
///         máximo de titulares (límites de exenciones de folleto).
/// @dev Una instancia por token. Sólo el token vinculado puede llamar a los hooks.
contract HarvestCompliance is AccessControl, ICompliance {
    bytes32 public constant COMPLIANCE_ADMIN_ROLE = keccak256("COMPLIANCE_ADMIN_ROLE");

    IIdentityRegistry public immutable identityRegistry;
    address public boundToken;

    mapping(uint16 => bool) public countryBlocked;
    uint256 public maxBalancePerInvestor; // 0 = sin límite
    uint256 public maxHolders; // 0 = sin límite
    uint256 public holderCount;

    event CountryBlocked(uint16 indexed country, bool blocked);
    event MaxBalanceSet(uint256 maxBalance);
    event MaxHoldersSet(uint256 maxHolders);

    error ZeroAddress();
    error AlreadyBound();
    error OnlyToken();

    modifier onlyToken() {
        if (msg.sender != boundToken) revert OnlyToken();
        _;
    }

    constructor(address admin, IIdentityRegistry registry, uint256 maxBalance, uint256 maxHolders_) {
        if (admin == address(0) || address(registry) == address(0)) revert ZeroAddress();
        identityRegistry = registry;
        maxBalancePerInvestor = maxBalance;
        maxHolders = maxHolders_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Configuración
    // ---------------------------------------------------------------------

    function bindToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (boundToken != address(0)) revert AlreadyBound();
        boundToken = token;
        emit TokenBound(token);
    }

    function setCountryBlocked(uint16 country, bool blocked) public onlyRole(COMPLIANCE_ADMIN_ROLE) {
        countryBlocked[country] = blocked;
        emit CountryBlocked(country, blocked);
    }

    function batchSetCountryBlocked(uint16[] calldata countries, bool blocked)
        external
        onlyRole(COMPLIANCE_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < countries.length; i++) {
            setCountryBlocked(countries[i], blocked);
        }
    }

    function setMaxBalancePerInvestor(uint256 maxBalance) external onlyRole(COMPLIANCE_ADMIN_ROLE) {
        maxBalancePerInvestor = maxBalance;
        emit MaxBalanceSet(maxBalance);
    }

    function setMaxHolders(uint256 maxHolders_) external onlyRole(COMPLIANCE_ADMIN_ROLE) {
        maxHolders = maxHolders_;
        emit MaxHoldersSet(maxHolders_);
    }

    // ---------------------------------------------------------------------
    // Reglas
    // ---------------------------------------------------------------------

    function canTransfer(address from, address to, uint256 amount) external view returns (bool) {
        if (countryBlocked[identityRegistry.investorCountry(to)]) return false;

        IERC20 token = IERC20(boundToken);
        uint256 toBalance = token.balanceOf(to);

        if (maxBalancePerInvestor != 0 && from != to && toBalance + amount > maxBalancePerInvestor) {
            return false;
        }

        if (maxHolders != 0 && toBalance == 0 && from != to) {
            // Si el emisor se queda a cero, el número de titulares no cambia.
            bool fromLeaves = from != address(0) && token.balanceOf(from) == amount;
            if (!fromLeaves && holderCount >= maxHolders) return false;
        }
        return true;
    }

    // ---------------------------------------------------------------------
    // Hooks (llamados por el token después de actualizar saldos)
    // ---------------------------------------------------------------------

    function transferred(address from, address to, uint256 amount) external onlyToken {
        if (amount == 0 || from == to) return;
        IERC20 token = IERC20(boundToken);
        if (token.balanceOf(to) == amount) holderCount++;
        if (token.balanceOf(from) == 0) holderCount--;
    }

    function created(address to, uint256 amount) external onlyToken {
        if (amount == 0) return;
        if (IERC20(boundToken).balanceOf(to) == amount) holderCount++;
    }

    function destroyed(address from, uint256 amount) external onlyToken {
        if (amount == 0) return;
        if (IERC20(boundToken).balanceOf(from) == 0) holderCount--;
    }
}
