// Off-chain selective disclosure: prove note preimage knowledge for a public commitment
// WITHOUT publishing spending/nullifier keys, and WITHOUT producing a spend nullifier.
// Status: experimental *_dev — local trusted setup only; not a production ceremony.
// See SELECTIVE_DISCLOSURE_MVP_V1.md

pragma circom 2.1.6;

include "./note_core.circom";

template OwnershipAttestation() {
    // Public statement
    signal input commitment;
    signal input value;
    signal input assetId;
    signal input audienceTag; // binds proof to an intended audience / statement id

    // Private preimage (never appear in public signals)
    signal input version;
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

    // Force audienceTag into the constraint system (statement binding).
    signal audienceSquare;
    audienceSquare <== audienceTag * audienceTag;
}

component main {public [commitment, value, assetId, audienceTag]} = OwnershipAttestation();
