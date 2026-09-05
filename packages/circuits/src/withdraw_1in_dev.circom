// Dev withdraw: 1 input / 0 outputs, depth 4.

pragma circom 2.1.6;

include "./withdraw_lib.circom";

component main {public [merkleRoot, nullifiers, recipient, withdrawAmount, withdrawFee]} = Withdraw(4, 1);
