// Dev partial withdraw: 1 input / 1 change output, depth 4.

pragma circom 2.1.6;

include "./withdraw_partial_lib.circom";

component main {
    public [merkleRoot, nullifiers, recipient, withdrawAmount, withdrawFee, outCommitments]
} = WithdrawPartial(4);
