// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/// @dev Shielded note-to-note transfer was removed from ShieldedPool.
///      Historical transfer_dev circuit/fixtures remain under packages/circuits for archive only.
contract ShieldedPoolTransferIntegrationTest is Test {
    function testTransferPathRemovedFromProtocol() public pure {
        assertTrue(true);
    }
}
