// Absolute Privacy - shared note commitment / nullifier templates
// Encoding: NOTE_ENCODING_FREEZE_CANDIDATE_V1.md
// Hash: circomlib Poseidon (BN254)

pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
  commitment = Poseidon(version, assetId, value, spendingKey, nullifierKey, blinding)
  nullifier  = Poseidon(nullifierKey, commitment, leafIndex)
*/

template NoteCommitment() {
    signal input version;
    signal input assetId;
    signal input value;
    signal input spendingKey;
    signal input nullifierKey;
    signal input blinding;
    signal output commitment;

    component h = Poseidon(6);
    h.inputs[0] <== version;
    h.inputs[1] <== assetId;
    h.inputs[2] <== value;
    h.inputs[3] <== spendingKey;
    h.inputs[4] <== nullifierKey;
    h.inputs[5] <== blinding;
    commitment <== h.out;
}

template NoteNullifier() {
    signal input nullifierKey;
    signal input commitment;
    signal input leafIndex;
    signal output nullifier;

    component h = Poseidon(3);
    h.inputs[0] <== nullifierKey;
    h.inputs[1] <== commitment;
    h.inputs[2] <== leafIndex;
    nullifier <== h.out;
}
