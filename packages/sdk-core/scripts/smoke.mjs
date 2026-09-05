import {
  createCircomlibPoseidon,
  createNote,
  computeNullifier,
  buildMerkleTree,
  getMerklePath,
  computeMerkleRoot,
  createEmptyPublicState,
  appendCommitment,
  merkleWitnessForLeaf,
  encryptBackup,
  decryptBackup,
  suggestNoteSplit,
  planCustomDistribution,
  createNotesFromCustomDistribution,
  parseAmountList,
  assessDepositBurst,
  assessWithdrawIdentity,
  buildOwnershipClaimStub,
  buildOwnershipDisclosure,
  sealOwnershipDisclosure,
  unsealOwnershipDisclosure,
  sealOwnershipDisclosureToRecipient,
  unsealOwnershipDisclosureWithRecipientKey,
  generateDisclosureRecipientKeypair,
  exportDisclosureRecipientPublic,
  paymentAddressFromKeypair,
  buildIncomingNotePackageFromNote,
  sealIncomingNoteToRecipient,
  unsealIncomingNoteWithRecipientKey,
  verifyIncomingNotePlaintext,
  createOwnershipViewPackageFromNote,
  buildViewKeyExport,
  verifyOwnershipViewPackage,
  deriveViewKey,
  createPaymentReceiptFromNote,
  verifyPaymentReceiptPackage,
  verifyOwnershipDisclosure,
  assertExperimentalNetworkAllowed,
  isKnownMainnetChainId,
  getNetworkHonestyBanner,
  isExperimentalPublicTestnet,
  parseAssetsFile,
  parsePoolsFile,
  resolvePoolForAsset,
  getOnchainMemoStatus,
  buildOnchainMemoPlaintext,
  sealOnchainMemoCandidate,
  deriveWalletViewKeyStub,
} from "../dist/index.js";

async function main() {
  const poseidon = await createCircomlibPoseidon();

  const { note, commitment } = await createNote({
    assetId: 1n,
    value: 1_000_000n,
    poseidon,
  });

  const nullifier = await computeNullifier(
    note.nullifierKey,
    commitment,
    0,
    poseidon
  );

  const { root, layers } = await buildMerkleTree([commitment], poseidon, 4);
  const path = await getMerklePath(0, layers, 4);
  const recomputed = await computeMerkleRoot(commitment, path, poseidon);

  if (recomputed !== root) {
    throw new Error("Merkle root mismatch");
  }

  let state = createEmptyPublicState(4);
  ({ state } = await appendCommitment(state, commitment, poseidon));
  const { commitment: c2 } = await createNote({
    assetId: 1n,
    value: 500_000n,
    poseidon,
  });
  ({ state } = await appendCommitment(state, c2, poseidon));
  const witness = await merkleWitnessForLeaf(state, 0, poseidon);
  if (witness.root.toString() !== state.root) {
    throw new Error("public state witness root mismatch");
  }

  note.commitment = `0x${commitment.toString(16)}`;
  const envelope = encryptBackup({
    passphrase: "smoke-passphrase",
    payload: {
      notes: [note],
      meta: { lastScannedBlock: 0, client: "sdk-smoke", clientVersion: "0.0.1" },
    },
    chainId: 31337,
    poolAddress: "0x0000000000000000000000000000000000000001",
  });
  const restored = decryptBackup(envelope, "smoke-passphrase");
  if (restored.notes[0].value !== note.value) {
    throw new Error("backup roundtrip failed");
  }

  const split = suggestNoteSplit({ value: 1000n, parts: 3 });
  if (split.parts.length !== 3) throw new Error("split parts mismatch");
  const dist = planCustomDistribution({
    total: 1000n,
    amounts: [100n, 250n, 150n, 400n],
    recipients: ["0x1", "0x2", "0x3", "0x4"],
  });
  if (dist.change !== "100") throw new Error("distribute change mismatch");
  if (parseAmountList("10,20,30").length !== 3) throw new Error("parseAmountList");
  const distNotes = await createNotesFromCustomDistribution({
    total: 1000n,
    amounts: [100n, 250n, 150n, 400n],
    assetId: 1n,
    poseidon,
  });
  if (distNotes.created.length !== 4 || !distNotes.changeNote) {
    throw new Error("custom distribute notes mismatch");
  }
  const burst = assessDepositBurst({ partsCreating: 3 });
  if (!burst.some((w) => w.code === "deposit_burst_split")) {
    throw new Error("deposit burst warning missing");
  }

  const disclosure = buildOwnershipDisclosure({
    ...note,
    commitment,
  });
  const sealed = sealOwnershipDisclosure(disclosure, "smoke-passphrase");
  const opened = unsealOwnershipDisclosure(sealed, "smoke-passphrase");
  const verified = await verifyOwnershipDisclosure(opened, poseidon);
  if (!verified.ok) throw new Error("disclosure verify failed");

  const recipient = generateDisclosureRecipientKeypair();
  const pubOnly = exportDisclosureRecipientPublic(recipient);
  const sealedTo = sealOwnershipDisclosureToRecipient(disclosure, pubOnly.publicKey);
  const openedTo = unsealOwnershipDisclosureWithRecipientKey(
    sealedTo,
    recipient.privateKey
  );
  if (openedTo.claim.commitment !== disclosure.claim.commitment) {
    throw new Error("recipient seal roundtrip failed");
  }
  let wrongKeyFailed = false;
  try {
    const other = generateDisclosureRecipientKeypair();
    unsealOwnershipDisclosureWithRecipientKey(sealedTo, other.privateKey);
  } catch {
    wrongKeyFailed = true;
  }
  if (!wrongKeyFailed) throw new Error("wrong recipient key should fail");

  const viewBuilt = await createOwnershipViewPackageFromNote(
    { ...note, commitment },
    poseidon
  );
  const viewKeyDoc = buildViewKeyExport({
    viewKey: viewBuilt.viewKey,
    commitmentHint: commitment,
  });
  const viewOk = await verifyOwnershipViewPackage(
    viewBuilt.package,
    viewKeyDoc.viewKey,
    poseidon
  );
  if (!viewOk.ok) throw new Error("view package verify failed");
  if (
    "spendingKey" in viewBuilt.package.claim ||
    "nullifierKey" in viewBuilt.package.claim
  ) {
    throw new Error("view package leaked spend secrets");
  }
  const otherView = await deriveViewKey(999n, 888n, poseidon);
  const badView = await verifyOwnershipViewPackage(
    viewBuilt.package,
    otherView,
    poseidon
  );
  if (badView.ok) throw new Error("wrong view key should fail");

  const receiptBuilt = await createPaymentReceiptFromNote(
    { ...note, commitment },
    poseidon
  );
  const receiptOk = await verifyPaymentReceiptPackage(
    receiptBuilt.package,
    viewKeyDoc.viewKey,
    poseidon
  );
  if (!receiptOk.ok) throw new Error("payment receipt verify failed");
  if (JSON.stringify(receiptBuilt.package).includes("spendingKey")) {
    throw new Error("payment receipt leaked spendingKey");
  }
  const badReceiptAsView = await verifyOwnershipViewPackage(
    {
      ...viewBuilt.package,
      claim: {
        ...viewBuilt.package.claim,
        viewTag: receiptBuilt.package.claim.receiptTag,
      },
    },
    viewKeyDoc.viewKey,
    poseidon
  );
  if (badReceiptAsView.ok) {
    throw new Error("receiptTag must not satisfy ownership_view verify");
  }

  const payment = paymentAddressFromKeypair(recipient);
  const incomingPlain = buildIncomingNotePackageFromNote({
    ...note,
    commitment,
  });
  const sealedIncoming = sealIncomingNoteToRecipient(
    incomingPlain,
    payment.publicKey
  );
  const openedIncoming = unsealIncomingNoteWithRecipientKey(
    sealedIncoming,
    recipient.privateKey
  );
  const incomingOk = await verifyIncomingNotePlaintext(openedIncoming, poseidon);
  if (!incomingOk.ok) throw new Error("incoming note verify failed");
  const viaPayment = sealIncomingNoteToRecipient(
    incomingPlain,
    JSON.stringify(payment)
  );
  unsealIncomingNoteWithRecipientKey(viaPayment, recipient.privateKey);

  const stub = buildOwnershipClaimStub({
    commitment,
    assetId: note.assetId,
    value: note.value,
    leafIndex: 0,
  });
  if (stub.kind !== "ownership_claim_stub") throw new Error("claim stub kind");
  if ("spendingKey" in stub.claim) throw new Error("claim stub leaked spendingKey");

  if (!isKnownMainnetChainId(1)) throw new Error("mainnet id detect failed");
  if (!isExperimentalPublicTestnet(11155111)) {
    throw new Error("sepolia should be experimental public testnet");
  }
  const sepoliaBanner = getNetworkHonestyBanner(11155111);
  if (!sepoliaBanner || !/Sepolia|testnet/i.test(sepoliaBanner)) {
    throw new Error("sepolia honesty banner missing");
  }
  let blocked = false;
  try {
    assertExperimentalNetworkAllowed({ chainId: 1 });
  } catch {
    blocked = true;
  }
  if (!blocked) throw new Error("mainnet guard failed");

  const idWarn = assessWithdrawIdentity({
    depositBroadcaster: "0x1111111111111111111111111111111111111111",
    withdrawBroadcaster: "0x1111111111111111111111111111111111111111",
    withdrawRecipient: "0x2222222222222222222222222222222222222222",
  });
  if (!idWarn.some((w) => w.code === "withdraw_reuses_deposit_wallet")) {
    throw new Error("withdraw identity warning missing");
  }

  const assetsDoc = parseAssetsFile({
    format: "absolute-privacy-assets",
    version: 1,
    chainId: 1,
    network: "ethereum-mainnet",
    assets: [
      {
        id: "dai",
        symbol: "DAI",
        decimals: 18,
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        kind: "stablecoin",
        withdrawSameAssetOnly: true,
      },
    ],
  });
  const poolsDoc = parsePoolsFile({
    format: "absolute-privacy-pools",
    version: 1,
    chainId: 1,
    network: "ethereum-mainnet",
    pools: { dai: { pool: null, assetId: "dai" } },
  });
  const resolved = resolvePoolForAsset({
    assets: assetsDoc,
    pools: poolsDoc,
    assetId: "dai",
  });
  if (resolved.pool !== null) throw new Error("expected null pool before deploy");

  const memoStatus = getOnchainMemoStatus();
  if (memoStatus.implemented !== false) {
    throw new Error("on-chain memo must report implemented: false");
  }
  if (
    !memoStatus.offlineDelivery ||
    memoStatus.poolMemoAbi ||
    memoStatus.adoptedDelivery !== "offline-oob"
  ) {
    throw new Error("on-chain memo honesty flags wrong");
  }
  const memoPlain = buildOnchainMemoPlaintext({
    version: note.version,
    assetId: note.assetId,
    value: note.value,
    spendingKey: note.spendingKey,
    nullifierKey: note.nullifierKey,
    blinding: note.blinding,
    commitment,
  });
  const memoCand = sealOnchainMemoCandidate({
    plaintext: memoPlain,
    paymentAddress: payment,
  });
  if (memoCand.commitment !== commitment.toString()) {
    throw new Error("memo candidate commitment mismatch");
  }
  unsealIncomingNoteWithRecipientKey(memoCand.sealed, recipient.privateKey);
  let walletViewBlocked = false;
  try {
    deriveWalletViewKeyStub(1n);
  } catch {
    walletViewBlocked = true;
  }
  if (!walletViewBlocked) throw new Error("wallet view stub should throw");

  console.log(
    JSON.stringify(
      {
        ok: true,
        commitment: commitment.toString(),
        nullifier: nullifier.toString(),
        root: root.toString(),
        publicRoot: state.root,
        noteValue: note.value.toString(),
        leaves: state.commitments.length,
        backupChecksum: envelope.checksum.slice(0, 16),
        splitSum: split.sum,
        disclosureOk: verified.ok,
        recipientSealOk: true,
        incomingNoteOk: incomingOk.ok,
        paymentAddressOk: payment.scheme === "x25519-incoming-v1",
        viewPackageOk: viewOk.ok,
        paymentReceiptOk: receiptOk.ok,
        onchainMemoImplemented: memoStatus.implemented,
        adoptedDelivery: memoStatus.adoptedDelivery,
        claimStubCommitment: stub.claim.commitment,
        mainnetBlocked: blocked,
        withdrawIdentityWarn: true,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

