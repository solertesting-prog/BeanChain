// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title DocumentRegistry
/// @notice Prueba de existencia e integridad de documentos (informes
///         agronómicos, facturas, guías de exportación, contratos). Sólo se
///         guarda el hash SHA-256 del fichero, nunca su contenido.
contract DocumentRegistry is AccessControl {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    struct Record {
        bytes32 subject; // identificador de la cosecha u oportunidad
        uint64 anchoredAt;
        address anchoredBy;
        string docType;
    }

    mapping(bytes32 => Record) private _records;
    mapping(bytes32 => bytes32[]) private _bySubject;

    event DocumentAnchored(
        bytes32 indexed docHash, bytes32 indexed subject, string docType, string uri, address indexed agent
    );

    error ZeroHash();
    error AlreadyAnchored(bytes32 docHash);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
    }

    function anchor(bytes32 docHash, bytes32 subject, string calldata docType, string calldata uri)
        external
        onlyRole(AGENT_ROLE)
    {
        if (docHash == bytes32(0)) revert ZeroHash();
        if (_records[docHash].anchoredAt != 0) revert AlreadyAnchored(docHash);
        _records[docHash] = Record({
            subject: subject,
            anchoredAt: uint64(block.timestamp),
            anchoredBy: msg.sender,
            docType: docType
        });
        _bySubject[subject].push(docHash);
        emit DocumentAnchored(docHash, subject, docType, uri, msg.sender);
    }

    function isAnchored(bytes32 docHash) external view returns (bool) {
        return _records[docHash].anchoredAt != 0;
    }

    function recordOf(bytes32 docHash) external view returns (Record memory) {
        return _records[docHash];
    }

    function documentsOf(bytes32 subject) external view returns (bytes32[] memory) {
        return _bySubject[subject];
    }
}
