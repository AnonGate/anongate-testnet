// Absolute Privacy - Merkle membership with Poseidon(2)
// pathIndices[i] = 0 => current hash is left child
// pathIndices[i] = 1 => current hash is right child

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

template PoseidonHash2() {
    signal input left;
    signal input right;
    signal output hash;

    component p = Poseidon(2);
    p.inputs[0] <== left;
    p.inputs[1] <== right;
    hash <== p.out;
}

template MerklePoseidon(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    component hashers[depth];
    component mux[depth];
    signal hashes[depth + 1];

    hashes[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        // Boolean constraint on path bit
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        hashers[i] = PoseidonHash2();
        mux[i] = MultiMux1(2);

        // s=0 => [current, sibling]
        // s=1 => [sibling, current]
        mux[i].c[0][0] <== hashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== hashes[i];
        mux[i].s <== pathIndices[i];

        hashers[i].left <== mux[i].out[0];
        hashers[i].right <== mux[i].out[1];
        hashes[i + 1] <== hashers[i].hash;
    }

    root <== hashes[depth];
}
