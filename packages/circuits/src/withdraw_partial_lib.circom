// Partial withdraw template (parameterized depth).
// Conservation: inValue === withdrawAmount + outValue; fee <= withdrawAmount.
// inLeafIndex is a private witness (unlinkability).

pragma circom 2.1.6;

include "./note_core.circom";
include "./merkle_poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template WithdrawPartial(depth) {
    var AMOUNT_BITS = 128;
    signal input merkleRoot;
    signal input nullifiers[1];
    signal input recipient;
    signal input withdrawAmount;
    signal input withdrawFee;
    signal input inLeafIndex[1];
    signal input outCommitments[1];

    signal input inVersion[1];
    signal input inAssetId[1];
    signal input inValue[1];
    signal input inSpendingKey[1];
    signal input inNullifierKey[1];
    signal input inBlinding[1];
    signal input inPathElements[1][depth];
    signal input inPathIndices[1][depth];

    signal input outVersion[1];
    signal input outAssetId[1];
    signal input outValue[1];
    signal input outSpendingKey[1];
    signal input outNullifierKey[1];
    signal input outBlinding[1];

    signal recipientSquare;
    recipientSquare <== recipient * recipient;

    component amountBits = Num2Bits(AMOUNT_BITS);
    component feeBits = Num2Bits(AMOUNT_BITS);
    component feeWithinAmount = LessEqThan(AMOUNT_BITS);
    component inValueBits = Num2Bits(AMOUNT_BITS);
    component outValueBits = Num2Bits(AMOUNT_BITS);
    component inLeafBits = Num2Bits(depth);

    amountBits.in <== withdrawAmount;
    feeBits.in <== withdrawFee;
    feeWithinAmount.in[0] <== withdrawFee;
    feeWithinAmount.in[1] <== withdrawAmount;
    feeWithinAmount.out === 1;

    component inCommit = NoteCommitment();
    inCommit.version <== inVersion[0];
    inCommit.assetId <== inAssetId[0];
    inCommit.value <== inValue[0];
    inCommit.spendingKey <== inSpendingKey[0];
    inCommit.nullifierKey <== inNullifierKey[0];
    inCommit.blinding <== inBlinding[0];

    inValueBits.in <== inValue[0];
    inLeafBits.in <== inLeafIndex[0];

    component inMerkle = MerklePoseidon(depth);
    inMerkle.leaf <== inCommit.commitment;
    for (var j = 0; j < depth; j++) {
        inMerkle.pathElements[j] <== inPathElements[0][j];
        inMerkle.pathIndices[j] <== inPathIndices[0][j];
        inPathIndices[0][j] === inLeafBits.out[j];
    }
    inMerkle.root === merkleRoot;

    component inNull = NoteNullifier();
    inNull.nullifierKey <== inNullifierKey[0];
    inNull.commitment <== inCommit.commitment;
    inNull.leafIndex <== inLeafIndex[0];
    inNull.nullifier === nullifiers[0];

    component outCommit = NoteCommitment();
    outCommit.version <== outVersion[0];
    outCommit.assetId <== outAssetId[0];
    outCommit.value <== outValue[0];
    outCommit.spendingKey <== outSpendingKey[0];
    outCommit.nullifierKey <== outNullifierKey[0];
    outCommit.blinding <== outBlinding[0];
    outCommit.commitment === outCommitments[0];
    outValueBits.in <== outValue[0];

    // Change must be strictly positive for partial withdraw (use withdraw_1in for full exit).
    component changePositive = LessThan(AMOUNT_BITS);
    changePositive.in[0] <== 0;
    changePositive.in[1] <== outValue[0];
    changePositive.out === 1;

    inValue[0] === withdrawAmount + outValue[0];
}
