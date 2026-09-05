// Production withdraw: 1 input / 0 outputs, depth 20 (2^20 anonymity capacity).

pragma circom 2.1.6;

include "./withdraw_lib.circom";

component main {public [merkleRoot, nullifiers, recipient, withdrawAmount, withdrawFee]} = Withdraw(20, 1);
