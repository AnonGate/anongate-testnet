// Dev/compile-check withdraw circuit with smaller tree depth (2 inputs).

pragma circom 2.1.6;

include "./withdraw_lib.circom";

component main {public [merkleRoot, nullifiers, recipient, withdrawAmount, withdrawFee]} = Withdraw(4, 2);
