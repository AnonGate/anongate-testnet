// Absolute Privacy - Transfer circuit
// Proves private note spend + new output commitments + value conservation.

pragma circom 2.1.6;

include "./note_core.circom";
include "./merkle_poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template Transfer(depth, nInputs, nOutputs) {
    // Public
    signal input merkleRoot;
    signal input nullifiers[nInputs];
    signal input outCommitments[nOutputs];
    signal input transferFee;

    // Private input notes
    signal input inVersion[nInputs];
    signal input inAssetId[nInputs];
    signal input inValue[nInputs];
    signal input inSpendingKey[nInputs];
    signal input inNullifierKey[nInputs];
    signal input inBlinding[nInputs];
    signal input inLeafIndex[nInputs];
    signal input inPathElements[nInputs][depth];
    signal input inPathIndices[nInputs][depth];

    // Private output notes
    signal input outVersion[nOutputs];
    signal input outAssetId[nOutputs];
    signal input outValue[nOutputs];
    signal input outSpendingKey[nOutputs];
    signal input outNullifierKey[nOutputs];
    signal input outBlinding[nOutputs];

    component inCommit[nInputs];
    component inNull[nInputs];
    component inMerkle[nInputs];
    component inLeafBits[nInputs];
    component inValueBits[nInputs];
    component outCommit[nOutputs];
    component outValueBits[nOutputs];
    component distinctCommitments[nInputs][nInputs];
    component distinctNullifiers[nInputs][nInputs];
    var AMOUNT_BITS = 128;
    component feeBits = Num2Bits(AMOUNT_BITS);

    feeBits.in <== transferFee;

    signal inSum[nInputs + 1];
    signal outSum[nOutputs + 1];
    inSum[0] <== 0;
    outSum[0] <== 0;

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

    for (var k = 0; k < nOutputs; k++) {
        outCommit[k] = NoteCommitment();
        outCommit[k].version <== outVersion[k];
        outCommit[k].assetId <== outAssetId[k];
        outCommit[k].value <== outValue[k];
        outCommit[k].spendingKey <== outSpendingKey[k];
        outCommit[k].nullifierKey <== outNullifierKey[k];
        outCommit[k].blinding <== outBlinding[k];
        outCommit[k].commitment === outCommitments[k];

        outValueBits[k] = Num2Bits(AMOUNT_BITS);
        outValueBits[k].in <== outValue[k];

        outSum[k + 1] <== outSum[k] + outValue[k];
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

    // sum(inputs) == sum(outputs) + transferFee
    inSum[nInputs] === outSum[nOutputs] + transferFee;
}

component main {public [merkleRoot, nullifiers, outCommitments, transferFee]} = Transfer(20, 2, 2);
