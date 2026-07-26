// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {TEEType} from "@iexec-nox/nox-protocol-contracts/contracts/utils/TypeUtils.sol";

/**
 * @title MockNoxCompute — TEST DOUBLE ONLY (never deployed to any live network)
 * @notice A transparent stand-in for the iExec Nox TEE compute+ACL contract, so the ENTIRE
 *         confidential flow (real cUSD wrapper + real NoxOraclePool + real Gnosis CTF/FPMM) can be
 *         exercised end-to-end on the local Hardhat network — where no TEE precompile exists.
 *
 * Handles carry their plaintext here (the TEE keeps it secret on Sepolia). Arithmetic is done in the
 * clear; ACL is permissive (it records grants but never blocks) so the flow runs without replicating
 * the beta ACL's exact revert semantics — those are proven against the REAL NoxCompute at
 * 0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF via the Sepolia e2e script. This double lets us assert
 * ECONOMIC correctness (balances, aggregates, FPMM spend, pot, payout) AND structural INVARIANTS
 * (I2: only aggregate handles are ever passed to `allowPublicDecryption`, recorded in a log) locally.
 *
 * The Nox library hardcodes this contract's address for chainId 31337, so tests place this code there
 * with `hardhat_setCode`. Storage is all mappings + one nonce — no immutables — so setCode is clean.
 */
contract MockNoxCompute {
    mapping(bytes32 => uint256) private _val;
    mapping(bytes32 => bool) private _known;
    mapping(bytes32 => mapping(address => bool)) private _allowed; // persistent + transient, folded
    mapping(bytes32 => mapping(address => bool)) private _viewer;
    mapping(bytes32 => bool) private _public;
    uint256 private _nonce;

    /// Every handle ever passed to allowPublicDecryption — the ground truth for invariant I2.
    bytes32[] public publicDecryptionLog;

    /// Emitted by mockEncrypt so tests can recover the fresh external handle from the receipt.
    event Encrypted(bytes32 indexed handle, uint256 value);

    // --------------------------------------------------------- test-only helpers

    /// @notice Allocate an external encrypted input carrying plaintext `v` (what `encryptInput` does
    ///         on Sepolia, transparently here). Emits the fresh handle; returns it + a dummy proof.
    function mockEncrypt(uint256 v) external returns (bytes32 handle, bytes memory proof) {
        handle = _fresh(v, TEEType.Uint256);
        proof = hex"01";
        emit Encrypted(handle, v);
    }

    function value(bytes32 h) external view returns (uint256) {
        return _v(h);
    }

    function isKnown(bytes32 h) external view returns (bool) {
        return _known[h];
    }

    function publicDecryptionLogLength() external view returns (uint256) {
        return publicDecryptionLog.length;
    }

    /// @notice Test-harness reset for the public-decryption log. `hardhat_setCode` reinstalls this
    ///         code but does NOT clear storage, so a fresh fixture calls this to isolate the I2 log.
    function resetLog() external {
        delete publicDecryptionLog;
    }

    function wasMarkedPublic(bytes32 h) external view returns (bool) {
        return _public[h] || _isPublicHandle(h);
    }

    // ------------------------------------------------------------- compute core

    function wrapAsPublicHandle(bytes32 v, TEEType teeType) external returns (bytes32) {
        // Deterministic PUBLIC handle (attrs byte = 0x00): same value+type => same handle.
        uint256 pre = uint256(keccak256(abi.encode(v, teeType))) & _MASK200;
        bytes32 h = _pack(uint8(teeType), 0x00, pre);
        _val[h] = uint256(v);
        _known[h] = true;
        return h;
    }

    function validateInputProof(bytes32 handle, address owner, bytes calldata, TEEType) external {
        require(_known[handle], "mock: unknown external handle (use mockEncrypt)");
        _allowed[handle][owner] = true;
    }

    function validateDecryptionProof(bytes32 handle, bytes calldata)
        external
        view
        returns (bytes memory)
    {
        // The library slices by expected width: 1 byte for bool, 32 for uint256.
        if (_typeByte(handle) == uint8(TEEType.Bool)) {
            return abi.encodePacked(bytes1(_v(handle) != 0 ? 0x01 : 0x00));
        }
        return abi.encode(_v(handle));
    }

    function add(bytes32 a, bytes32 b) external returns (bytes32) {
        unchecked {
            return _fresh(_v(a) + _v(b), TEEType.Uint256);
        }
    }

    function sub(bytes32 a, bytes32 b) external returns (bytes32) {
        unchecked {
            return _fresh(_v(a) - _v(b), TEEType.Uint256); // wraps (no underflow check), as documented
        }
    }

    function mul(bytes32 a, bytes32 b) external returns (bytes32) {
        unchecked {
            return _fresh(_v(a) * _v(b), TEEType.Uint256);
        }
    }

    function div(bytes32 a, bytes32 b) external returns (bytes32) {
        uint256 d = _v(b);
        return _fresh(d == 0 ? type(uint256).max : _v(a) / d, TEEType.Uint256);
    }

    function safeAdd(bytes32 a, bytes32 b) external returns (bytes32 ok, bytes32 res) {
        unchecked {
            uint256 s = _v(a) + _v(b);
            bool good = s >= _v(a);
            return (_bool(good), _fresh(good ? s : 0, TEEType.Uint256));
        }
    }

    function safeSub(bytes32 a, bytes32 b) external returns (bytes32 ok, bytes32 res) {
        bool good = _v(a) >= _v(b);
        return (_bool(good), _fresh(good ? _v(a) - _v(b) : 0, TEEType.Uint256));
    }

    function safeMul(bytes32 a, bytes32 b) external returns (bytes32 ok, bytes32 res) {
        uint256 x = _v(a);
        uint256 y = _v(b);
        if (x == 0 || y == 0) return (_bool(true), _fresh(0, TEEType.Uint256));
        unchecked {
            uint256 p = x * y;
            bool good = p / x == y;
            return (_bool(good), _fresh(good ? p : 0, TEEType.Uint256));
        }
    }

    function safeDiv(bytes32 a, bytes32 b) external returns (bytes32 ok, bytes32 res) {
        uint256 d = _v(b);
        bool good = d != 0;
        return (_bool(good), _fresh(good ? _v(a) / d : 0, TEEType.Uint256));
    }

    function select(bytes32 c, bytes32 t, bytes32 f) external returns (bytes32) {
        return _fresh(_v(c) != 0 ? _v(t) : _v(f), TEEType.Uint256);
    }

    function eq(bytes32 a, bytes32 b) external returns (bytes32) {
        return _bool(_v(a) == _v(b));
    }

    function ne(bytes32 a, bytes32 b) external returns (bytes32) {
        return _bool(_v(a) != _v(b));
    }

    function lt(bytes32 a, bytes32 b) external returns (bytes32) {
        return _bool(_v(a) < _v(b));
    }

    function le(bytes32 a, bytes32 b) external returns (bytes32) {
        return _bool(_v(a) <= _v(b));
    }

    function gt(bytes32 a, bytes32 b) external returns (bytes32) {
        return _bool(_v(a) > _v(b));
    }

    function ge(bytes32 a, bytes32 b) external returns (bytes32) {
        return _bool(_v(a) >= _v(b));
    }

    function transfer(bytes32 bf, bytes32 bt, bytes32 amt)
        external
        returns (bytes32 ok, bytes32 newFrom, bytes32 newTo)
    {
        uint256 f = _v(bf);
        uint256 a = _v(amt);
        if (f < a) {
            return (_bool(false), _fresh(f, TEEType.Uint256), _fresh(_v(bt), TEEType.Uint256));
        }
        return (_bool(true), _fresh(f - a, TEEType.Uint256), _fresh(_v(bt) + a, TEEType.Uint256));
    }

    function mint(bytes32 bt, bytes32 amt, bytes32 ts)
        external
        returns (bytes32 ok, bytes32 newTo, bytes32 newSupply)
    {
        uint256 a = _v(amt);
        return (_bool(true), _fresh(_v(bt) + a, TEEType.Uint256), _fresh(_v(ts) + a, TEEType.Uint256));
    }

    function burn(bytes32 bf, bytes32 amt, bytes32 ts)
        external
        returns (bytes32 ok, bytes32 newFrom, bytes32 newSupply)
    {
        uint256 f = _v(bf);
        uint256 a = _v(amt);
        if (f < a) {
            return (_bool(false), _fresh(f, TEEType.Uint256), _fresh(_v(ts), TEEType.Uint256));
        }
        return (_bool(true), _fresh(f - a, TEEType.Uint256), _fresh(_v(ts) - a, TEEType.Uint256));
    }

    // ----------------------------------------------------------------- ACL

    function allow(bytes32 handle, address account) external {
        _allowed[handle][account] = true;
    }

    function allowTransient(bytes32 handle, address account) external {
        _allowed[handle][account] = true;
    }

    function disallowTransient(bytes32 handle, address account) external {
        _allowed[handle][account] = false;
    }

    function isAllowed(bytes32 handle, address account) external view returns (bool) {
        return _isPublicHandle(handle) || _allowed[handle][account];
    }

    function validateAllowedForAll(address, bytes32[] calldata) external pure {}

    function addViewer(bytes32 handle, address viewer) external {
        _viewer[handle][viewer] = true;
    }

    function isViewer(bytes32 handle, address viewer) external view returns (bool) {
        return _isPublicHandle(handle) || _viewer[handle][viewer] || _allowed[handle][viewer];
    }

    function allowPublicDecryption(bytes32 handle) external {
        _public[handle] = true;
        publicDecryptionLog.push(handle);
    }

    function isPubliclyDecryptable(bytes32 handle) external view returns (bool) {
        return _isPublicHandle(handle) || _public[handle];
    }

    // ---------------------------------------------------------- config getters

    function kmsPublicKey() external pure returns (bytes memory) {
        return hex"";
    }

    function gateway() external view returns (address) {
        return address(this);
    }

    function proofExpirationDuration() external pure returns (uint256) {
        return 3600;
    }

    // ---------------------------------------------------------------- internals

    uint256 private constant _MASK200 = (uint256(1) << 200) - 1;

    function _v(bytes32 h) internal view returns (uint256) {
        return _known[h] ? _val[h] : 0; // unknown => 0 (covers zeroHandle + uninitialized balances)
    }

    function _pack(uint8 teeType, uint8 attrs, uint256 pre) internal view returns (bytes32) {
        uint256 h = (uint256(0x01) << 248) | // version byte
            (uint256(uint32(block.chainid)) << 216) | // chainId bytes 1-4
            (uint256(teeType) << 208) | // type byte 5
            (uint256(attrs) << 200) | // attrs byte 6
            (pre & _MASK200); // pre-handle bytes 7-31
        return bytes32(h);
    }

    function _fresh(uint256 v, TEEType teeType) internal returns (bytes32 h) {
        h = _pack(uint8(teeType), 0x01, ++_nonce); // attrs 0x01 => unique / non-public
        _val[h] = v;
        _known[h] = true;
    }

    function _bool(bool b) internal returns (bytes32) {
        return _fresh(b ? 1 : 0, TEEType.Bool);
    }

    function _typeByte(bytes32 h) internal pure returns (uint8) {
        return uint8(h[5]);
    }

    function _isPublicHandle(bytes32 h) internal pure returns (bool) {
        return (h[6] & 0x01) == 0;
    }
}
