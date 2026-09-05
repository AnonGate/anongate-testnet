// Absolute Privacy - Withdraw circuit
// Proves private note spend to a public withdrawal amount.
// inLeafIndex is a private witness, constrained to the Merkle path so the nullifier is bound to the spent leaf
// without revealing which leaf was spent (same pattern as Transfer).

pragma circom 2.1.6;

include "./note_core.circom";
include "./merkle_poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template Withdraw(depth, nInputs) {
    var AMOUNT_BITS = 128;
    signal input merkleRoot;
    signal input nullifiers[nInputs];
    signal input recipient;
    signal input withdrawAmount;
    signal input withdrawFee;
    signal input inLeafIndex[nInputs];

    signal input inVersion[nInputs];
    signal input inAssetId[nInputs];
    signal input inValue[nInputs];
    signal input inSpendingKey[nInputs];
    signal input inNullifierKey[nInputs];
    signal input inBlinding[nInputs];
    signal input inPathElements[nInputs][depth];
    signal input inPathIndices[nInputs][depth];

    // Bind recipient into the proof statement without revealing deposit wallet.
    signal recipientSquare;
    recipientSquare <== recipient * recipient;

    component inCommit[nInputs];
    component inNull[nInputs];
    component inMerkle[nInputs];
    component inLeafBits[nInputs];
    component inValueBits[nInputs];
    component distinctCommitments[nInputs][nInputs];
    component distinctNullifiers[nInputs][nInputs];
    component amountBits = Num2Bits(AMOUNT_BITS);
    component feeBits = Num2Bits(AMOUNT_BITS);
    component feeWithinAmount = LessEqThan(AMOUNT_BITS);

    amountBits.in <== withdrawAmount;
    feeBits.in <== withdrawFee;
    feeWithinAmount.in[0] <== withdrawFee;
    feeWithinAmount.in[1] <== withdrawAmount;
    feeWithinAmount.out === 1;

    signal inSum[nInputs + 1];
    inSum[0] <== 0;

    for (var i = 0; i < nInputs; i++) {
        inCommit[i] = NoteCommitment();
        inCommit[i].version <== inVersion[i];
        inCommit[i].assetId <== inAssetId[i];
        inCommit[i].value <== inValue[i];
        inCommit[i].spendingKey <== inSpendingKey[i];
        inCommit[i].nullifierKey <== inNullifierKey[i];
        inCommit[i].blinding <== inBlinding[i];

        inValueBits[i] = Num2Bits(AMOUNT_BITS);
        inValueBits[i].in <== inValue[i];

        inLeafBits[i] = Num2Bits(depth);
        inLeafBits[i].in <== inLeafIndex[i];

        inMerkle[i] = MerklePoseidon(depth);
        inMerkle[i].leaf <== inCommit[i].commitment;
        for (var j = 0; j < depth; j++) {
            inMerkle[i].pathElements[j] <== inPathElements[i][j];
            inMerkle[i].pathIndices[j] <== inPathIndices[i][j];
            inPathIndices[i][j] === inLeafBits[i].out[j];
        }
        inMerkle[i].root === merkleRoot;

        inNull[i] = NoteNullifier();
        inNull[i].nullifierKey <== inNullifierKey[i];
        inNull[i].commitment <== inCommit[i].commitment;
        inNull[i].leafIndex <== inLeafIndex[i];
        inNull[i].nullifier === nullifiers[i];

        inSum[i + 1] <== inSum[i] + inValue[i];
    }

    for (var a = 0; a < nInputs; a++) {
        for (var b = a + 1; b < nInputs; b++) {
            distinctCommitments[a][b] = IsZero();
            distinctCommitments[a][b].in <== inCommit[a].commitment - inCommit[b].commitment;
            distinctCommitments[a][b].out === 0;

            distinctNullifiers[a][b] = IsZero();
            distinctNullifiers[a][b].in <== nullifiers[a] - nullifiers[b];
            distinctNullifiers[a][b].out === 0;
        }
    }

    // Gross private value exiting the pool.
    inSum[nInputs] === withdrawAmount;

    // Contract pays withdrawAmount - withdrawFee; comparison above prevents field wraparound.
}

component main {public [merkleRoot, nullifiers, recipient, withdrawAmount, withdrawFee]} = Withdraw(20, 2);
