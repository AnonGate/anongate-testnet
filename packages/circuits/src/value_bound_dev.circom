// Off-chain selective disclosure: prove note preimage knowledge AND value >= threshold
// WITHOUT revealing the exact value (or spend keys), and WITHOUT producing a nullifier.
// Status: experimental *_dev — local trusted setup only; not a production ceremony.
// See SELECTIVE_DISCLOSURE_MVP_V1.md

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "./note_core.circom";

template ValueBoundAttestation(nBits) {
    // Public statement
    signal input commitment;
    signal input assetId;
    signal input threshold;
    signal input audienceTag;

    // Private preimage (value stays private)
    signal input version;
    signal input value;
    signal input spendingKey;
    signal input nullifierKey;
    signal input blinding;

    component c = NoteCommitment();
    c.version <== version;
    c.assetId <== assetId;
    c.value <== value;
    c.spendingKey <== spendingKey;
    c.nullifierKey <== nullifierKey;
    c.blinding <== blinding;
    c.commitment === commitment;

    // Range-check so GreaterEqThan is sound for nBits.
    component valueBits = Num2Bits(nBits);
    valueBits.in <== value;
    component thresholdBits = Num2Bits(nBits);
    thresholdBits.in <== threshold;

    component ge = GreaterEqThan(nBits);
    ge.in[0] <== value;
    ge.in[1] <== threshold;
    ge.out === 1;

    // Bind audienceTag into constraints.
    signal audienceSquare;
    audienceSquare <== audienceTag * audienceTag;
}

// 128-bit amounts cover practical ERC-20 base units (same width as withdraw/transfer).
component main {public [commitment, assetId, threshold, audienceTag]} = ValueBoundAttestation(128);
