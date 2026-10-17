// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {ICompliance} from "./interfaces/ICompliance.sol";

/// @title HarvestToken
/// @notice Security token permisionado que representa una participación en los
///         ingresos netos de una cosecha concreta. Sigue la semántica de ERC-3643:
///         sólo wallets verificadas pueden recibirlo, cada movimiento pasa por un
///         módulo de cumplimiento, y los agentes pueden congelar, forzar
///         transferencias y recuperar wallets perdidas.
/// @dev Incluye un distribuidor de rendimientos "pull" (magnified-dividend): el
///      agente deposita stablecoin con `distribute` y cada titular la reclama en
///      proporción a sus tokens, aunque los tokens hayan cambiado de mano entre
///      repartos.
contract HarvestToken is ERC20, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    uint256 private constant MAGNITUDE = 2 ** 128;

    // --- Configuración de la emisión ---
    string public harvestId;
    string public metadataURI;
    uint256 public immutable cap;
    IERC20 public immutable paymentToken;
    IIdentityRegistry public identityRegistry;
    ICompliance public compliance;
    bool public closed;

    // --- Congelaciones ---
    mapping(address => bool) public isFrozen;
    mapping(address => uint256) public frozenTokens;

    // --- Repartos ---
    uint256 public magnifiedPerShare;
    uint256 public totalDistributed;
    uint256 public totalClaimed;
    mapping(address => int256) private _corrections;
    mapping(address => uint256) public withdrawnOf;

    bool private _bypassChecks;

    // --- Eventos ---
    event IdentityRegistrySet(address indexed registry);
    event ComplianceSet(address indexed compliance);
    event MetadataURISet(string uri);
    event AddressFrozen(address indexed wallet, bool frozen, address indexed agent);
    event TokensFrozen(address indexed wallet, uint256 amount);
    event TokensUnfrozen(address indexed wallet, uint256 amount);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount, address indexed agent);
    event RecoverySuccess(address indexed lostWallet, address indexed newWallet, uint256 amount);
    event Distributed(address indexed agent, uint256 amount, uint256 totalDistributed);
    event Claimed(address indexed account, uint256 amount);
    event HarvestClosed();

    // --- Errores ---
    error ZeroAddress();
    error ZeroAmount();
    error CapExceeded(uint256 cap, uint256 requested);
    error RecipientNotVerified(address wallet);
    error TransferNotCompliant(address from, address to, uint256 amount);
    error WalletFrozen(address wallet);
    error InsufficientFreeBalance(address wallet, uint256 free, uint256 requested);
    error AlreadyClosed();
    error NoSupply();
    error LengthMismatch();
    error NothingToClaim();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory harvestId_,
        uint256 cap_,
        IERC20 paymentToken_,
        IIdentityRegistry registry_,
        ICompliance compliance_,
        address admin
    ) ERC20(name_, symbol_) {
        if (
            admin == address(0) || address(paymentToken_) == address(0) || address(registry_) == address(0)
                || address(compliance_) == address(0)
        ) revert ZeroAddress();
        if (cap_ == 0) revert ZeroAmount();
        harvestId = harvestId_;
        cap = cap_;
        paymentToken = paymentToken_;
        identityRegistry = registry_;
        compliance = compliance_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
        emit IdentityRegistrySet(address(registry_));
        emit ComplianceSet(address(compliance_));
    }

    /// @notice Tokens enteros: 1 token = 1 participación al precio de emisión.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    // =====================================================================
    // Administración
    // =====================================================================

    function setIdentityRegistry(IIdentityRegistry registry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        identityRegistry = registry_;
        emit IdentityRegistrySet(address(registry_));
    }

    function setCompliance(ICompliance compliance_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(compliance_) == address(0)) revert ZeroAddress();
        compliance = compliance_;
        emit ComplianceSet(address(compliance_));
    }

    function setMetadataURI(string calldata uri) external onlyRole(AGENT_ROLE) {
        metadataURI = uri;
        emit MetadataURISet(uri);
    }

    function pause() external onlyRole(AGENT_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(AGENT_ROLE) {
        _unpause();
    }

    /// @notice Cierra la emisión: no se emiten más tokens ni se permiten
    ///         transferencias. Los repartos y reclamaciones siguen activos.
    function close() external onlyRole(AGENT_ROLE) {
        if (closed) revert AlreadyClosed();
        closed = true;
        emit HarvestClosed();
    }

    // =====================================================================
    // Emisión y amortización (agentes)
    // =====================================================================

    function mint(address to, uint256 amount) public onlyRole(AGENT_ROLE) {
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
    }

    function batchMint(address[] calldata to, uint256[] calldata amounts) external onlyRole(AGENT_ROLE) {
        if (to.length != amounts.length) revert LengthMismatch();
        for (uint256 i = 0; i < to.length; i++) {
            mint(to[i], amounts[i]);
        }
    }

    function burn(address from, uint256 amount) public onlyRole(AGENT_ROLE) {
        if (amount == 0) revert ZeroAmount();
        _releaseFrozenIfNeeded(from, amount);
        _burn(from, amount);
    }

    function batchBurn(address[] calldata from, uint256[] calldata amounts) external onlyRole(AGENT_ROLE) {
        if (from.length != amounts.length) revert LengthMismatch();
        for (uint256 i = 0; i < from.length; i++) {
            burn(from[i], amounts[i]);
        }
    }

    // =====================================================================
    // Controles ERC-3643 (agentes)
    // =====================================================================

    function setAddressFrozen(address wallet, bool frozen) external onlyRole(AGENT_ROLE) {
        isFrozen[wallet] = frozen;
        emit AddressFrozen(wallet, frozen, msg.sender);
    }

    function freezePartialTokens(address wallet, uint256 amount) external onlyRole(AGENT_ROLE) {
        uint256 free = balanceOf(wallet) - frozenTokens[wallet];
        if (amount > free) revert InsufficientFreeBalance(wallet, free, amount);
        frozenTokens[wallet] += amount;
        emit TokensFrozen(wallet, amount);
    }

    function unfreezePartialTokens(address wallet, uint256 amount) external onlyRole(AGENT_ROLE) {
        uint256 frozenAmt = frozenTokens[wallet];
        if (amount > frozenAmt) revert InsufficientFreeBalance(wallet, frozenAmt, amount);
        frozenTokens[wallet] = frozenAmt - amount;
        emit TokensUnfrozen(wallet, amount);
    }

    function forcedTransfer(address from, address to, uint256 amount) public onlyRole(AGENT_ROLE) {
        if (!identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        _releaseFrozenIfNeeded(from, amount);
        _bypassChecks = true;
        _transfer(from, to, amount);
        _bypassChecks = false;
        emit ForcedTransfer(from, to, amount, msg.sender);
    }

    /// @notice Traspasa saldo, congelaciones y rendimientos pendientes de una
    ///         wallet perdida a una nueva wallet verificada del mismo inversor.
    function recoveryAddress(address lostWallet, address newWallet) external onlyRole(AGENT_ROLE) nonReentrant {
        if (newWallet == address(0)) revert ZeroAddress();
        if (!identityRegistry.isVerified(newWallet)) revert RecipientNotVerified(newWallet);

        uint256 balance = balanceOf(lostWallet);
        uint256 frozenAmt = frozenTokens[lostWallet];
        uint256 pending = withdrawableOf(lostWallet);

        if (pending > 0) withdrawnOf[lostWallet] += pending;

        if (balance > 0) {
            _bypassChecks = true;
            _transfer(lostWallet, newWallet, balance);
            _bypassChecks = false;
        }

        if (frozenAmt > 0) {
            frozenTokens[lostWallet] = 0;
            frozenTokens[newWallet] += frozenAmt;
        }
        if (isFrozen[lostWallet]) {
            isFrozen[newWallet] = true;
        }

        if (pending > 0) {
            totalClaimed += pending;
            paymentToken.safeTransfer(newWallet, pending);
            emit Claimed(newWallet, pending);
        }
        emit RecoverySuccess(lostWallet, newWallet, balance);
    }

    // =====================================================================
    // Repartos de rendimiento
    // =====================================================================

    /// @notice Deposita `amount` de stablecoin para repartir entre los titulares
    ///         actuales en proporción a sus tokens. Requiere `approve` previo.
    function distribute(uint256 amount) external onlyRole(AGENT_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        if (supply == 0) revert NoSupply();
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        magnifiedPerShare += (amount * MAGNITUDE) / supply;
        totalDistributed += amount;
        emit Distributed(msg.sender, amount, totalDistributed);
    }

    function accumulativeOf(address account) public view returns (uint256) {
        int256 magnified = (magnifiedPerShare * balanceOf(account)).toInt256() + _corrections[account];
        return magnified.toUint256() / MAGNITUDE;
    }

    function withdrawableOf(address account) public view returns (uint256) {
        return accumulativeOf(account) - withdrawnOf[account];
    }

    function claim() external nonReentrant returns (uint256) {
        return _claim(msg.sender);
    }

    /// @notice El agente puede empujar el pago a la wallet del titular
    ///         (útil con wallets custodiadas). El dinero siempre va al titular.
    function claimFor(address account) external onlyRole(AGENT_ROLE) nonReentrant returns (uint256) {
        return _claim(account);
    }

    function batchClaimFor(address[] calldata accounts) external onlyRole(AGENT_ROLE) nonReentrant {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (withdrawableOf(accounts[i]) > 0) _claim(accounts[i]);
        }
    }

    function _claim(address account) internal returns (uint256 amount) {
        if (isFrozen[account]) revert WalletFrozen(account);
        amount = withdrawableOf(account);
        if (amount == 0) revert NothingToClaim();
        withdrawnOf[account] += amount;
        totalClaimed += amount;
        paymentToken.safeTransfer(account, amount);
        emit Claimed(account, amount);
    }

    // =====================================================================
    // Núcleo: reglas de movimiento y contabilidad de repartos
    // =====================================================================

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            if (!_bypassChecks) _checkTransfer(from, to, value);
        } else if (from == address(0)) {
            _checkMint(to, value);
        }

        int256 magCorrection = (magnifiedPerShare * value).toInt256();

        super._update(from, to, value);

        if (from == address(0)) {
            _corrections[to] -= magCorrection;
            compliance.created(to, value);
        } else if (to == address(0)) {
            _corrections[from] += magCorrection;
            compliance.destroyed(from, value);
        } else {
            _corrections[from] += magCorrection;
            _corrections[to] -= magCorrection;
            compliance.transferred(from, to, value);
        }
    }

    function _checkTransfer(address from, address to, uint256 value) internal view {
        if (closed) revert AlreadyClosed();
        _requireNotPaused();
        if (isFrozen[from]) revert WalletFrozen(from);
        if (isFrozen[to]) revert WalletFrozen(to);
        uint256 free = balanceOf(from) - frozenTokens[from];
        if (value > free) revert InsufficientFreeBalance(from, free, value);
        if (!identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        if (!compliance.canTransfer(from, to, value)) revert TransferNotCompliant(from, to, value);
    }

    function _checkMint(address to, uint256 value) internal view {
        if (closed) revert AlreadyClosed();
        uint256 newSupply = totalSupply() + value;
        if (newSupply > cap) revert CapExceeded(cap, newSupply);
        if (!identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        if (!compliance.canTransfer(address(0), to, value)) revert TransferNotCompliant(address(0), to, value);
    }

    function _releaseFrozenIfNeeded(address wallet, uint256 amount) internal {
        uint256 free = balanceOf(wallet) - frozenTokens[wallet];
        if (amount > free) {
            uint256 toRelease = amount - free;
            frozenTokens[wallet] -= toRelease;
            emit TokensUnfrozen(wallet, toRelease);
        }
    }
}
