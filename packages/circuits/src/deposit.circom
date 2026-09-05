// Production deposit circuit: prove note preimages sum to netValue (amount - deposit fee).
// One ShieldedPool per asset — assetId consistency is a client concern within a pool.

pragma circom 2.1.6;

include "./note_core.circom";

template Deposit(nOutputs) {
    signal input outCommitments[nOutputs];
    signal input netValue;

    signal input outVersion[nOutputs];
    signal input outAssetId[nOutputs];
    signal input outValue[nOutputs];
    signal input outSpendingKey[nOutputs];
    signal input outNullifierKey[nOutputs];
    signal input outBlinding[nOutputs];

    component outCommit[nOutputs];
    signal outSum[nOutputs + 1];
    outSum[0] <== 0;

    for (var k = 0; k < nOutputs; k++) {
        outCommit[k] = NoteCommitment();
        outCommit[k].version <== outVersion[k];
        outCommit[k].assetId <== outAssetId[k];
        outCommit[k].value <== outValue[k];
        outCommit[k].spendingKey <== outSpendingKey[k];
        outCommit[k].nullifierKey <== outNullifierKey[k];
        outCommit[k].blinding <== outBlinding[k];
        outCommit[k].commitment === outCommitments[k];
        outSum[k + 1] <== outSum[k] + outValue[k];
    }

    outSum[nOutputs] === netValue;
}

// Single output per deposit call; multi-amount splits use note distribute + separate deposits or transfer.
component main {public [outCommitments, netValue]} = Deposit(1);
