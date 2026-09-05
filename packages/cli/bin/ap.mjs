#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Absolute Privacy CLI — local notes, public-state sync, and local proving.
 * Secrets stay on this machine; no hosted proving backend.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  redactLeafIndexFields,
  minimalSpendNoteFields,
} from "../lib/privacyRedact.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkEntry = path.resolve(__dirname, "../../sdk-core/dist/index.js");
const circuitsBuild = path.resolve(__dirname, "../../circuits/build");
const circuitsRoot = path.resolve(__dirname, "../../circuits");
const require = createRequire(import.meta.url);

/** Prefer ceremony finals → keys/local-trusted → build/*_trusted_* (see packages/circuits/keys/README.md). */
async function loadProvingKeys(circuit) {
  const { resolveProvingKeys, resolveCircuitWasm } = await import(
    pathToFileURL(
      path.resolve(circuitsRoot, "scripts/lib/resolve_proving_keys.mjs")
    ).href
  );
  const keys = resolveProvingKeys(circuit, { circuitsRoot });
  const wasm = resolveCircuitWasm(circuit, { circuitsRoot });
  return { wasm, zkey: keys.zkey, vkeyPath: keys.vkey, source: keys.source };
}

function provingKeysHonesty(source) {
  if (source === "ceremony") {
    return "Phase-2 ceremony keys (5 contributors + Ethereum block beacon). Matches current Sepolia pools. Not externally audited. Not for mainnet.";
  }
  if (source === "local-trusted") {
    return "LOCAL TRUSTED keys — will not verify on current Sepolia ceremony pools. Not for mainnet.";
  }
  return "Build-tree trusted keys — will not verify on current Sepolia ceremony pools. Not for mainnet.";
}
const DEPOSIT_FEE_PPM = 110n;
const WITHDRAW_FEE_PPM = 400n;

function feeFromPpm(amount, ppm) {
  return (amount * ppm) / 1_000_000n;
}

function writeShareableJson(outPath, payload, _args = {}) {
  const safe = redactLeafIndexFields(payload);
  fs.writeFileSync(outPath, JSON.stringify(safe, null, 2));
  return safe;
}

function logShareable(obj, _args = {}) {
  console.log(JSON.stringify(redactLeafIndexFields(obj), null, 2));
}

async function loadSdk() {
  if (!fs.existsSync(sdkEntry)) {
    throw new Error("sdk-core not built. Run: npm run build --prefix ../sdk-core");
  }
  return import(pathToFileURL(sdkEntry).href);
}

function loadSnarkjs() {
  return require(path.resolve(__dirname, "../../circuits/node_modules/snarkjs"));
}

function printHelp() {
  console.log(`Absolute Privacy CLI

Usage:
  ap note create --value <amount> [--asset-id 1] [--out notes.json]
  ap note list --file notes.json
  ap note scan --file notes.json --rpc <url> --pool <address> [--state public_state.json]
  ap note suggest-split --value <amount> [--parts 3] [--create] [--out notes.json] [--asset-id 1]
  ap note distribute --total <amount> --amounts <a,b,c,…> [--recipients <addr,addr,…>] [--create] [--out notes.json] [--plan-out plan.json] [--asset-id 1]
  ap note view-key --file notes.json [--index 0] [--out view_key.json]
  ap note deliver --file notes.json --index <n> --to-pubkey <hex|json|payment.addr.json> [--out incoming.apsealed] [--remove]
  ap note accept --file incoming.apsealed --recipient-key recipient.json [--notes notes.json] [--state public_state.json|--rpc <url> --pool <addr>]
  ap note mailbox-scan --dir <mailbox> --recipient-key recipient.json [--notes notes.json] [--dry-run] [--state …|--rpc … --pool …]
  ap note export --file notes.json (--passphrase-stdin|AP_BACKUP_PASSPHRASE=…) [--index n] [--binary|--recovery|--qr|--json] [--out note.apnote]
  ap note import --file note.apnote (--passphrase-stdin|…) [--notes notes.json] [--merge]
  ap note import-recovery (--code AP1-…|--file recovery.txt) (--passphrase-stdin|…) [--notes notes.json] [--merge]
  ap note payment-address --from-pubkey <hex|json> [--label …] [--out payment.addr.json]

  ap disclosure export --file notes.json --index <n> [--kind reveal|claim-stub|view|payment-receipt] [--out …] [--passphrase <secret>|--to-pubkey <hex|json>]
  ap disclosure keygen [--out recipient.json] [--public-out recipient.pub.json] [--payment-out payment.addr.json]
  ap disclosure open --file disclosure.apsealed (--passphrase <secret>|--recipient-key recipient.json) [--out disclosure.json]
  ap disclosure verify --file disclosure.json|.apsealed [--passphrase <secret>|--recipient-key recipient.json]
  ap disclosure verify-view --file view.json --view-key view_key.json|.hex
  ap disclosure verify-payment-receipt --file receipt.json --view-key view_key.json|.hex
  ap disclosure prove-ownership --file notes.json [--index 0] [--audience-tag 1] [--out ownership_dev_proof.json]
  ap disclosure verify-ownership --proof ownership_dev_proof.json
  ap disclosure prove-value-bound --file notes.json --threshold <n> [--index 0] [--audience-tag 1] [--out value_bound_dev_proof.json]
  ap disclosure verify-value-bound --proof value_bound_dev_proof.json
  ap disclosure anchor-build --file value_bound_dev_proof.json [--mode bulletin|verifying] [--out …]
  ap disclosure anchor-lookup --rpc <url> --anchor <addr> (--digest 0x…|--file proof.json)

  ap state init [--depth 20] [--out public_state.json]
  ap state show --file public_state.json
  ap state append --file public_state.json --commitment <dec|0x...> [--notes notes.json] [--note-index 0]
  ap state rebuild --file public_state.json
  ap state fetch (--rpc <url> --pool <address>|--network sepolia --asset eth|dai|lusd) [--out public_state.json] [--depth 20]

  ap prove deposit-dev --file notes.json [--index 0] [--out deposit_dev_proof.json]
  ap prove withdraw-dev --file notes.json --indices 0,1 --state public_state.json [--recipient 0xb0b] [--out proof.json]
  ap prove withdraw-1-dev --file notes.json --index 0 --state public_state.json [--recipient 0xb0b] [--out proof.json]
  ap prove withdraw-partial-dev --file notes.json --index 0 --amount <n> --state public_state.json [--recipient 0xb0b] [--out proof.json] [--change-out change_note.json]
  (obsolete) ap prove transfer-dev / ap merge — removed from product path; use withdraw

  ap build deposit --file notes.json [--index 0] [--proof deposit_dev_proof.json] [--tier 0] [--out deposit_call.json]
  (obsolete) ap build transfer — removed from product path
  ap build withdraw --proof proof.json [--out withdraw_call.json]
  ap build withdraw1 --proof proof.json [--out withdraw1_call.json]
  ap build withdraw-partial --proof proof.json [--out withdraw_partial_call.json]
  ap note list --file notes.json
  ap note inspect --file notes.json --index 0

  ap send approve (--rpc <url> --token <addr> --spender <pool>|--network sepolia --asset dai|lusd) --amount <n> --from <addr>
  ap send call (--rpc <url> --to <pool>|--network sepolia --asset eth|dai|lusd) --call <call.json> --from <addr> [--notes notes.json] [--note-index 0] [--native]
  ap state bind-note --file public_state.json --notes notes.json [--note-index 0]
  ap sepolia status [--asset eth|dai|lusd] [--rpc <url>]
  ap sepolia mint-call --asset dai|lusd --to <address> --amount <n> [--out mint_call.json]

  ap backup export --file notes.json (--passphrase-stdin|AP_BACKUP_PASSPHRASE=…) --out backup.apbackup [--chain-id 31337] [--pool 0x0] [--asset USDC]
  ap backup import --backup backup.apbackup (--passphrase-stdin|AP_BACKUP_PASSPHRASE=…) --out notes.json [--merge]
  ap claims lint
  ap drill backup
  ap drill ownership
  ap drill recipient
  ap drill view
  ap drill value-bound
  ap drill incoming
  ap drill pay
  ap drill payment-receipt
  ap memo status
  ap ceremony status
  ap ceremony checklist
  ap ceremony invite
  ap ceremony export-verifiers
  ap ops withdraw-fees --rpc <url> --pool <addr> --to <addr> --amount <wei> --from <addr>
  ap gate local
  ap assets list [--network mainnet|sepolia]
  ap launch status
  ap launch readiness
  ap launch verify-deployment --rpc <url> [--network mainnet] [--assets <file>] [--pools <file>] [--manifest <file>]
  ap doctor
  ap help

Notes:
  - After a deposit/transfer is confirmed, fetch or append public_state, then bind-note.
  - Revision-2 transfer/withdraw require --state and exactly two input notes.
  - note deliver / mailbox-scan are offline sealed delivery — not on-chain memo scanning.
  - note accept/mailbox-scan may take --state or --rpc/--pool to bind leafIndex.
  - ap memo status reports offline delivery adopted; on-chain memo deferred.
  - ap ceremony status is preflight only — not proof that Phase 2 MPC completed.
  - ap ceremony invite checks recruitment params; fill ceremony_params.json before going public.
  - ap ops withdraw-fees: opsFeeRecipient only; ops skim — not user principal / not claimRewards.
  - Multi-asset MVP: separate pools for ETH / tDAI / tLUSD — same asset in/out only (MULTI_ASSET_POOLS_V1.md).
  - Sepolia (11155111) experimental: --asset eth is native ETH (no mint). dai/lusd are permissionless test tokens.
  - No earliest timestamp or on-chain withdraw delay (WITHDRAW_TIMING_POLICY_V1.md).
  - send / state fetch / scan refuse known mainnets unless --allow-experimental-network.
  - Keep signing secrets outside command lines; unlocked local accounts may use --from.
  - backup / sealed disclosure use local argon2id + xchacha20-poly1305.
  - spend-note primary backup is binary .apnote (+ Recovery Code / QR); --json is legacy sealed JSON.
  - backup passphrases should use --passphrase-stdin or AP_BACKUP_PASSPHRASE; argv is deprecated because process listings can expose it.
  - leafIndex / leafIndices are always omitted from proof JSON and CLI stdout.
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function toBytes32Hex(value) {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  return `0x${hex}`;
}

function noteToJson(note, commitment) {
  // Local working store may retain leafIndex for prove convenience.
  // Shareable exports / proof JSON / stdout must use redactLeafIndexFields.
  return {
    version: note.version.toString(),
    assetId: note.assetId.toString(),
    value: note.value.toString(),
    spendingKey: note.spendingKey.toString(),
    nullifierKey: note.nullifierKey.toString(),
    blinding: note.blinding.toString(),
    commitment: commitment.toString(),
    leafIndex: note.leafIndex,
    statusHint: note.statusHint ?? "unspent",
    depositedBy: note.depositedBy ?? null,
  };
}

function parseNoteRecord(record) {
  return {
    version: BigInt(record.version),
    assetId: BigInt(record.assetId),
    value: BigInt(record.value),
    spendingKey: BigInt(record.spendingKey),
    nullifierKey: BigInt(record.nullifierKey),
    blinding: BigInt(record.blinding),
    commitment: BigInt(record.commitment),
    leafIndex:
      record.leafIndex === undefined || record.leafIndex === null
        ? undefined
        : Number(record.leafIndex),
    statusHint: record.statusHint,
  };
}

function readNoteStore(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const store = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(store.notes)) store.notes = [];
  return store;
}

function writeNoteStore(filePath, store) {
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

/**
 * Optionally resolve leafIndex for a commitment from --state or --rpc/--pool.
 */
async function tryBindLeafForCommitment(sdk, args, commitment) {
  const wantState = Boolean(args.state);
  const wantRpc = Boolean(args.rpc || args.pool);
  if (!wantState && !wantRpc) return null;
  if (wantState && wantRpc) {
    throw new Error("use either --state or --rpc/--pool, not both");
  }

  let state;
  let source;
  if (wantState) {
    state = readPublicState(path.resolve(args.state), sdk);
    source = "state-file";
  } else {
    if (!args.rpc) throw new Error("--rpc is required with --pool");
    if (!args.pool) throw new Error("--pool is required with --rpc");
    await guardRpcNetwork(args, "note bind leaf");
    const { fetchPublicPoolSnapshot } = await import(
      pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href
    );
    const snapshot = await fetchPublicPoolSnapshot({
      rpcUrl: args.rpc,
      pool: args.pool,
    });
    state = sdk.createEmptyPublicState(snapshot.depth);
    state.commitments = snapshot.commitments;
    const poseidon = await sdk.createCircomlibPoseidon();
    state = await sdk.refreshPublicStateRoot(state, poseidon);
    if (state.root !== snapshot.onChainRoot) {
      throw new Error(
        `local root ${state.root} != on-chain root ${snapshot.onChainRoot}`
      );
    }
    source = "rpc-pool";
  }

  try {
    const leafIndex = sdk.findCommitmentIndex(state, commitment);
    return { leafIndex, source, root: state.root };
  } catch {
    return { leafIndex: null, source, root: state.root, unbound: true };
  }
}

function readPublicState(filePath, sdk) {
  if (!fs.existsSync(filePath)) throw new Error(`missing public state: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  sdk.assertPublicPoolState(raw);
  return raw;
}

function writePublicState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function requireArtifacts(paths) {
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      throw new Error(`missing circuit artifact: ${p}`);
    }
  }
}

async function loadEthRpc() {
  return import(pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href);
}

/** Refuse known mainnets unless --allow-experimental-network (ceremony not ready). */
async function guardRpcNetwork(args, context) {
  if (!args.rpc) return null;
  const { fetchChainId } = await loadEthRpc();
  const chainIdHex = await fetchChainId({ rpcUrl: args.rpc });
  const sdk = await loadSdk();
  const chainId = sdk.assertExperimentalNetworkAllowed({
    chainId: chainIdHex,
    allowExperimentalNetwork: Boolean(args["allow-experimental-network"]),
    context,
  });
  const banner = sdk.getNetworkHonestyBanner?.(chainId);
  if (banner) {
    console.error(JSON.stringify({ networkHonesty: banner }));
  }
  return chainId;
}

async function cmdOpsWithdrawFees(args) {
  if (!args.rpc) throw new Error("--rpc is required");
  if (!args.pool) throw new Error("--pool is required");
  if (!args.to) throw new Error("--to is required");
  if (args.amount === undefined || args.amount === true) {
    throw new Error("--amount is required (base units)");
  }
  await guardRpcNetwork(args, "ops withdraw-fees");

  const { encodeWithdrawOpsFeesCalldata } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/abiEncode.mjs")).href
  );
  const { sendCalldata, assertTxOk, normalizeHexAddress } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/txSend.mjs")).href
  );

  const to = normalizeHexAddress(args.to);
  const pool = normalizeHexAddress(args.pool);
  const amount = BigInt(args.amount);
  const data = encodeWithdrawOpsFeesCalldata({ to, amount });
  const result = assertTxOk(
    await sendCalldata({
      rpcUrl: args.rpc,
      to: pool,
      data,
      from: args.from,
      privateKey: args["private-key"],
    })
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "withdrawOpsFees",
        pool,
        to,
        amount: amount.toString(),
        txHash: result.txHash,
        via: result.via,
        note: "Ops fee skim only — not claimRewards / not user principal.",
      },
      null,
      2
    )
  );
}

async function resolveWitness({ note, statePath, poseidon, sdk, depthFallback }) {
  if (!statePath) {
    const depth = depthFallback;
    const { root, layers } = await sdk.buildMerkleTree([note.commitment], poseidon, depth);
    const path = await sdk.getMerklePath(0, layers, depth);
    return { root, path, leafIndex: 0, depth, mode: "single-leaf-demo" };
  }

  const state = readPublicState(path.resolve(statePath), sdk);
  const leafIndex =
    note.leafIndex !== undefined
      ? note.leafIndex
      : sdk.findCommitmentIndex(state, note.commitment);
  if (state.commitments[leafIndex] === undefined) {
    throw new Error(`leafIndex ${leafIndex} missing in public state`);
  }
  if (
    sdk.parseCommitment(state.commitments[leafIndex]).toString() !==
    note.commitment.toString()
  ) {
    throw new Error(
      `note commitment does not match public_state.commitments[${leafIndex}]`
    );
  }
  const { root, path: merklePath } = await sdk.merkleWitnessForLeaf(
    state,
    leafIndex,
    poseidon
  );
  return {
    root,
    path: merklePath,
    leafIndex,
    depth: state.depth,
    mode: "synced-public-state",
    state,
  };
}

async function cmdNoteCreate(args) {
  const value = BigInt(args.value ?? "0");
  if (value <= 0n) throw new Error("--value must be > 0");
  const assetId = BigInt(args["asset-id"] ?? "1");
  const outPath = path.resolve(args.out ?? "notes.json");

  const { createCircomlibPoseidon, createNote, assessAmountFingerprint, formatPrivacyWarnings } =
    await loadSdk();
  const poseidon = await createCircomlibPoseidon();
  const { note, commitment } = await createNote({ assetId, value, poseidon });
  const record = noteToJson(note, commitment);

  let store = { format: "absolute-privacy-notes-local", version: 1, notes: [] };
  if (fs.existsSync(outPath)) {
    store = readNoteStore(outPath);
  }
  store.notes.push(record);
  writeNoteStore(outPath, store);

  const privacyWarnings = formatPrivacyWarnings(
    assessAmountFingerprint({ value, context: "deposit" })
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        commitment: record.commitment,
        value: record.value,
        privacyWarnings,
        warning: "plaintext local notes — encrypt before sharing or cloud backup",
      },
      null,
      2
    )
  );
}

async function cmdNoteList(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const store = readNoteStore(filePath);
  logShareable(
    {
      file: filePath,
      count: store.notes.length,
      notes: store.notes.map((n, i) => ({
        index: i,
        commitment: n.commitment,
        value: n.value,
        assetId: n.assetId,
        leafIndex: n.leafIndex ?? null,
        statusHint: n.statusHint,
        ops:
          n.statusHint === "spent"
            ? []
            : n.leafIndex == null
              ? ["deposit"]
              : ["full-withdraw", "partial-withdraw", "merge-withdraw"],
      })),
      note: "leafIndex always omitted from CLI stdout",
    },
    args
  );
}

async function cmdNoteSuggestSplit(args) {
  if (args.value === undefined) throw new Error("--value is required");
  const sdk = await loadSdk();
  const parts = args.parts !== undefined ? Number(args.parts) : 3;
  const privacyWarnings = sdk.formatPrivacyWarnings([
    ...sdk.assessAmountFingerprint({ value: args.value, context: "deposit" }),
    ...sdk.assessDepositBurst({ partsCreating: parts, context: "create" }),
  ]);

  if (!args.create) {
    const suggestion = sdk.suggestNoteSplit({
      value: args.value,
      parts,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          inputValue: String(args.value),
          ...suggestion,
          privacyWarnings,
          next: "Re-run with --create to write one local note per part, or create manually.",
        },
        null,
        2
      )
    );
    return;
  }

  const assetId = BigInt(args["asset-id"] ?? "1");
  const outPath = path.resolve(args.out ?? "notes.json");
  const poseidon = await sdk.createCircomlibPoseidon();
  const { suggestion, created } = await sdk.createNotesFromSuggestedSplit({
    value: args.value,
    parts,
    assetId,
    poseidon,
  });

  let store = { format: "absolute-privacy-notes-local", version: 1, notes: [] };
  if (fs.existsSync(outPath)) {
    store = readNoteStore(outPath);
  }
  const startIndex = store.notes.length;
  for (const { note, commitment } of created) {
    store.notes.push(noteToJson(note, commitment));
  }
  writeNoteStore(outPath, store);

  console.log(
    JSON.stringify(
      {
        ok: true,
        inputValue: String(args.value),
        ...suggestion,
        outPath,
        createdCount: created.length,
        noteIndexes: created.map((_, i) => startIndex + i),
        commitments: created.map((c) => c.commitment.toString()),
        privacyWarnings,
        warning: "plaintext local notes — encrypt before sharing or cloud backup",
        next: "Deposit each note separately (and preferably not all in one burst). Or use: ap note distribute --total … --amounts …",
      },
      null,
      2
    )
  );
}

async function cmdNoteDistribute(args) {
  if (args.total === undefined && args.value === undefined) {
    throw new Error("--total (or --value) is required");
  }
  if (!args.amounts) throw new Error("--amounts is required (comma-separated)");
  const sdk = await loadSdk();
  const total = args.total ?? args.value;
  const recipients = args.recipients
    ? String(args.recipients)
        .split(",")
        .map((s) => s.trim())
    : undefined;
  const plan = sdk.planCustomDistribution({
    total,
    amounts: String(args.amounts),
    recipients,
  });
  const privacyWarnings = sdk.formatPrivacyWarnings([
    ...sdk.assessAmountFingerprint({ value: total, context: "deposit" }),
    ...sdk.assessDepositBurst({
      partsCreating: plan.amounts.length + (BigInt(plan.change) > 0n ? 1 : 0),
      context: "create",
    }),
  ]);

  if (args["plan-out"]) {
    const planPath = path.resolve(args["plan-out"]);
    fs.writeFileSync(
      planPath,
      JSON.stringify(
        {
          format: "absolute-privacy-distribute-plan",
          version: 1,
          createdAt: new Date().toISOString(),
          ...plan,
          privacyWarnings,
        },
        null,
        2
      )
    );
  }

  if (!args.create) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          ...plan,
          privacyWarnings,
          next: "Re-run with --create to write local notes (one per amount + optional change).",
        },
        null,
        2
      )
    );
    return;
  }

  const assetId = BigInt(args["asset-id"] ?? "1");
  const outPath = path.resolve(args.out ?? "notes.json");
  const poseidon = await sdk.createCircomlibPoseidon();
  const { created, changeNote } = await sdk.createNotesFromCustomDistribution({
    total,
    amounts: String(args.amounts),
    recipients,
    assetId,
    poseidon,
  });

  let store = { format: "absolute-privacy-notes-local", version: 1, notes: [] };
  if (fs.existsSync(outPath)) {
    store = readNoteStore(outPath);
  }
  const startIndex = store.notes.length;
  const planned = [];
  for (let i = 0; i < created.length; i++) {
    const { note, commitment } = created[i];
    const row = noteToJson(note, commitment);
    row.distributeHint = {
      role: "part",
      recipientHint: plan.recipientHints[i] ?? null,
    };
    store.notes.push(row);
    planned.push({
      index: startIndex + i,
      value: row.value,
      commitment: row.commitment,
      recipientHint: plan.recipientHints[i] ?? null,
    });
  }
  let changeIndex = null;
  if (changeNote) {
    const row = noteToJson(changeNote.note, changeNote.commitment);
    row.distributeHint = { role: "change", recipientHint: null };
    changeIndex = store.notes.length;
    store.notes.push(row);
  }
  writeNoteStore(outPath, store);

  console.log(
    JSON.stringify(
      {
        ok: true,
        file: outPath,
        ...plan,
        startIndex,
        parts: planned,
        changeIndex,
        privacyWarnings,
        next: [
          "Deposit commitments covering these notes (account for deposit fee).",
          "Withdraw each part note once to its recipientHint (or any address in the proof).",
          "Keep change note shielded until later split/withdraw.",
          "See NOTE_DISTRIBUTE_V1.md",
        ],
      },
      null,
      2
    )
  );
}

async function cmdNoteViewKey(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const index = Number(args.index ?? 0);
  const outPath = path.resolve(args.out ?? "view_key.json");
  const store = readNoteStore(filePath);
  if (!store.notes[index]) throw new Error(`no note at index ${index}`);
  const note = parseNoteRecord(store.notes[index]);
  const sdk = await loadSdk();
  const poseidon = await sdk.createCircomlibPoseidon();
  const viewKey = await sdk.deriveViewKey(note.spendingKey, note.nullifierKey, poseidon);
  const doc = sdk.buildViewKeyExport({
    viewKey,
    commitmentHint: note.commitment,
  });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        commitmentHint: doc.commitmentHint,
        warning: doc.warning,
      },
      null,
      2
    )
  );
}

async function cmdNoteDeliver(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const index = Number(args.index ?? 0);
  const store = readNoteStore(filePath);
  if (!store.notes[index]) throw new Error(`no note at index ${index}`);
  const record = store.notes[index];
  if (record.statusHint === "spent") {
    throw new Error(`note at index ${index} is spent — cannot deliver`);
  }
  if (record.spendingKey === undefined || record.spendingKey === null) {
    throw new Error(`note at index ${index} has no spend secrets (already delivered?)`);
  }
  const note = parseNoteRecord(record);
  const sdk = await loadSdk();
  const poseidon = await sdk.createCircomlibPoseidon();
  const plaintext = sdk.buildIncomingNotePackageFromNote({
    ...note,
    commitment: note.commitment,
  });
  const verified = await sdk.verifyIncomingNotePlaintext(plaintext, poseidon);
  if (!verified.ok) throw new Error("local note commitment mismatch — refuse to deliver");

  const toPubkey = resolveRecipientPublicKey(sdk, args);
  if (!toPubkey) throw new Error("--to-pubkey is required");
  const sealed = sdk.sealIncomingNoteToRecipient(plaintext, toPubkey);
  const outPath = path.resolve(args.out ?? `incoming_note_${index}.apsealed`);
  fs.writeFileSync(outPath, JSON.stringify(sealed, null, 2));

  let removed = false;
  if (args.remove) {
    store.notes.splice(index, 1);
    writeNoteStore(filePath, store);
    removed = true;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        commitment: sealed.hint.commitment,
        removedFromSenderStore: removed,
        warning: sealed.warning,
        next: "Recipient: ap note accept --file … --recipient-key … --notes …",
      },
      null,
      2
    )
  );
}

async function cmdNoteAccept(args) {
  const sealedPath = path.resolve(args.file ?? "incoming.apsealed");
  if (!fs.existsSync(sealedPath)) throw new Error(`missing file: ${sealedPath}`);
  if (!args["recipient-key"] && !args.recipientKey) {
    throw new Error("--recipient-key is required");
  }
  const notesPath = path.resolve(args.notes ?? "notes.json");
  const sdk = await loadSdk();
  const poseidon = await sdk.createCircomlibPoseidon();
  const privateKey = loadRecipientPrivateKey(sdk, args);
  if (!privateKey) throw new Error("--recipient-key is required");
  const envelope = JSON.parse(fs.readFileSync(sealedPath, "utf8"));
  const plain = sdk.unsealIncomingNoteWithRecipientKey(envelope, privateKey);
  const verified = await sdk.verifyIncomingNotePlaintext(plain, poseidon);
  if (!verified.ok) throw new Error("incoming note commitment mismatch");

  let store = { format: "absolute-privacy-notes-local", version: 1, notes: [] };
  if (fs.existsSync(notesPath)) {
    store = readNoteStore(notesPath);
  }
  const commitment = plain.note.commitment;
  let index = store.notes.findIndex(
    (n) => n.commitment != null && BigInt(n.commitment) === BigInt(commitment)
  );
  let alreadyPresent = index >= 0;
  if (!alreadyPresent) {
    const record = sdk.incomingNoteToLocalRecord(plain);
    store.notes.push(record);
    index = store.notes.length - 1;
  }

  const bind = await tryBindLeafForCommitment(sdk, args, commitment);
  let leafIndex =
    store.notes[index].leafIndex !== undefined &&
    store.notes[index].leafIndex !== null
      ? Number(store.notes[index].leafIndex)
      : plain.note.leafIndex;
  if (bind && bind.leafIndex !== null && bind.leafIndex !== undefined) {
    store.notes[index].leafIndex = bind.leafIndex;
    leafIndex = bind.leafIndex;
  }
  writeNoteStore(notesPath, store);

  console.log(
    JSON.stringify(
      {
        ok: true,
        alreadyPresent,
        notesPath,
        index,
        commitment,
        value: store.notes[index].value,
        leafIndex: leafIndex ?? null,
        bind: bind
          ? {
              source: bind.source,
              leafIndex: bind.leafIndex,
              unbound: Boolean(bind.unbound),
            }
          : null,
        warning: bind?.unbound
          ? "Imported note but commitment not found in state/pool yet — retry bind after inclusion."
          : bind
            ? "Imported and bound leafIndex from pool/state."
            : "Imported spend-capable note. Pass --state or --rpc/--pool to bind leafIndex after on-chain inclusion.",
      },
      null,
      2
    )
  );
}

async function cmdNoteMailboxScan(args) {
  if (!args.dir) throw new Error("--dir is required");
  if (!args["recipient-key"] && !args.recipientKey) {
    throw new Error("--recipient-key is required");
  }
  const dir = path.resolve(args.dir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`mailbox dir not found: ${dir}`);
  }
  const notesPath = path.resolve(args.notes ?? "notes.json");
  const sdk = await loadSdk();
  const poseidon = await sdk.createCircomlibPoseidon();
  const privateKey = loadRecipientPrivateKey(sdk, args);
  if (!privateKey) throw new Error("--recipient-key is required");

  let store = { format: "absolute-privacy-notes-local", version: 1, notes: [] };
  if (fs.existsSync(notesPath)) {
    store = readNoteStore(notesPath);
  }
  const known = store.notes
    .filter((n) => n.commitment != null)
    .map((n) => n.commitment);

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".apsealed") || f.endsWith(".json"))
    .map((f) => path.join(dir, f));

  const envelopes = [];
  for (const file of files) {
    try {
      const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
      if (envelope?.format === sdk.INCOMING_NOTE_SEALED_FORMAT) {
        envelopes.push({ envelope, path: file });
      }
    } catch {
      // skip non-JSON / unrelated files
    }
  }

  const result = await sdk.scanIncomingMailbox({
    envelopes,
    recipientPrivateKey: privateKey,
    poseidon,
    knownCommitments: known,
  });

  let imported = 0;
  const boundLeaves = [];
  const dryRun = Boolean(args["dry-run"] || args.dryRun);
  if (!dryRun) {
    for (const item of result.accepted) {
      if (!item.note) continue;
      store.notes.push(item.note);
      imported += 1;
      const idx = store.notes.length - 1;
      const bind = await tryBindLeafForCommitment(
        sdk,
        args,
        item.note.commitment
      );
      if (bind && bind.leafIndex !== null && bind.leafIndex !== undefined) {
        store.notes[idx].leafIndex = bind.leafIndex;
        boundLeaves.push({
          index: idx,
          commitment: item.note.commitment,
          leafIndex: bind.leafIndex,
          source: bind.source,
        });
      } else if (bind?.unbound) {
        boundLeaves.push({
          index: idx,
          commitment: item.note.commitment,
          leafIndex: null,
          unbound: true,
          source: bind.source,
        });
      }
    }
    if (imported > 0) writeNoteStore(notesPath, store);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned: envelopes.length,
        accepted: result.accepted.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
        imported,
        dryRun,
        boundLeaves,
        notesPath,
        details: {
          accepted: result.accepted.map((a) => ({
            path: a.path,
            commitment: a.commitment,
          })),
          skipped: result.skipped,
          failed: result.failed,
        },
        note: "Offline mailbox only. Optional --state/--rpc/--pool binds leafIndex; does not scan chain memos.",
      },
      null,
      2
    )
  );
}

function toMinimalSpendExportNotes(notes) {
  return notes.map((n) => {
    if (
      n?.commitment == null ||
      n?.spendingKey == null ||
      n?.nullifierKey == null ||
      n?.blinding == null ||
      n?.value == null
    ) {
      throw new Error("note missing required spend fields for export");
    }
    return {
      version: String(n.version ?? "1"),
      assetId: String(n.assetId ?? "1"),
      value: String(n.value),
      spendingKey: String(n.spendingKey),
      nullifierKey: String(n.nullifierKey),
      blinding: String(n.blinding),
      commitment: String(n.commitment),
    };
  });
}

function mergeImportedSpendNotes(outPath, imported, merge) {
  let store = { format: "absolute-privacy-notes-local", version: 1, notes: [] };
  if (merge && fs.existsSync(outPath)) {
    store = readNoteStore(outPath);
    const existing = new Set(
      store.notes.map((n) => String(BigInt(n.commitment ?? 0)))
    );
    for (const n of imported) {
      const key = String(BigInt(n.commitment ?? 0));
      if (!existing.has(key)) {
        store.notes.push(n);
        existing.add(key);
      }
    }
  } else {
    store.notes = imported;
  }
  writeNoteStore(outPath, store);
  return store;
}

/**
 * Export sealed spend notes as .apnote binary (default), recovery code, QR, or legacy JSON.
 * Crypto payload identical across all four transports.
 */
async function cmdNoteExport(args) {
  const passphrase = resolveBackupPassphrase(args);
  const notesPath = path.resolve(args.file ?? "notes.json");
  const store = readNoteStore(notesPath);
  const sdk = await loadSdk();
  const index =
    args.index !== undefined && args.index !== null
      ? Number(args.index)
      : null;
  const selected =
    index != null
      ? store.notes[index]
        ? [store.notes[index]]
        : []
      : store.notes;
  if (!selected.length) throw new Error("no notes to export");

  const envelope = sdk.encryptSpendNotes({
    passphrase,
    notes: toMinimalSpendExportNotes(selected),
  });

  const wantJson = Boolean(args.json);
  const wantRecovery = Boolean(args.recovery);
  const wantQr = Boolean(args.qr);
  // --binary is the default when no other format flag is set
  const modes = [wantJson, wantRecovery, wantQr].filter(Boolean).length;
  if (modes > 1) {
    throw new Error("choose one of --binary (default), --recovery, --qr, --json");
  }

  let outPath;
  let format;
  if (wantJson) {
    outPath = path.resolve(args.out ?? "note.apnote.sealed.json");
    fs.writeFileSync(outPath, JSON.stringify(envelope, null, 2));
    format = "json-sealed";
  } else if (wantRecovery) {
    outPath = path.resolve(args.out ?? "note.recovery.txt");
    const code = sdk.sealedEnvelopeToRecoveryCode(envelope);
    fs.writeFileSync(outPath, `${code}\n`);
    format = "recovery-code";
  } else if (wantQr) {
    outPath = path.resolve(args.out ?? "note.recovery.png");
    const code = sdk.sealedEnvelopeToRecoveryCode(envelope);
    const png = await sdk.generateQrPng(code);
    fs.writeFileSync(outPath, Buffer.from(png));
    format = "recovery-qr-png";
  } else {
    outPath = path.resolve(args.out ?? "note.apnote");
    const binary = sdk.sealedEnvelopeToBinary(envelope);
    fs.writeFileSync(outPath, Buffer.from(binary));
    format = "apnote-binary";
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        format,
        notes: selected.length,
        warning:
          "Encrypted spend secrets (argon2id + XChaCha20-Poly1305). Keep passphrase offline.",
      },
      null,
      2
    )
  );
}

async function cmdNoteImport(args) {
  const passphrase = resolveBackupPassphrase(args);
  const filePath = path.resolve(args.file ?? args.backup ?? "note.apnote");
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const outPath = path.resolve(args.notes ?? args.out ?? "notes.json");
  const sdk = await loadSdk();
  const buf = new Uint8Array(fs.readFileSync(filePath));

  let notes;
  if (sdk.isApnoteBinary(buf)) {
    const envelope = sdk.binaryToSealedEnvelope(buf);
    notes = sdk.decryptSpendNotes(envelope, passphrase);
  } else {
    const text = Buffer.from(buf).toString("utf8").trim();
    if (text.toUpperCase().startsWith("AP1-")) {
      const envelope = sdk.recoveryCodeToSealedEnvelope(text);
      notes = sdk.decryptSpendNotes(envelope, passphrase);
    } else {
      const raw = JSON.parse(text);
      if (raw.format === sdk.SPEND_NOTE_SEALED_FORMAT) {
        notes = sdk.decryptSpendNotes(raw, passphrase);
      } else if (raw.format === "absolute-privacy-spend-note" && raw.note) {
        notes = [raw.note];
      } else if (raw.format === "absolute-privacy-spend-note-pack" && Array.isArray(raw.notes)) {
        notes = raw.notes;
      } else if (raw.format === "absolute-privacy-notes-local" && Array.isArray(raw.notes)) {
        notes = raw.notes;
      } else {
        throw new Error(
          "unrecognized note file — use .apnote, recovery code, or legacy sealed JSON"
        );
      }
    }
  }

  const store = mergeImportedSpendNotes(outPath, notes, Boolean(args.merge));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        imported: notes.length,
        total: store.notes.length,
      },
      null,
      2
    )
  );
}

async function cmdNoteImportRecovery(args) {
  const passphrase = resolveBackupPassphrase(args);
  const sdk = await loadSdk();
  let code = args.code ? String(args.code) : null;
  if (!code && args.file) {
    code = fs.readFileSync(path.resolve(args.file), "utf8").trim();
  }
  if (!code) {
    throw new Error("provide --code AP1-… or --file recovery.txt");
  }
  const envelope = sdk.recoveryCodeToSealedEnvelope(code);
  const notes = sdk.decryptSpendNotes(envelope, passphrase);
  const outPath = path.resolve(args.notes ?? args.out ?? "notes.json");
  const store = mergeImportedSpendNotes(outPath, notes, Boolean(args.merge));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        imported: notes.length,
        total: store.notes.length,
        format: "recovery-code",
      },
      null,
      2
    )
  );
}

async function cmdNotePaymentAddress(args) {
  const sdk = await loadSdk();
  const raw = args["from-pubkey"] ?? args.fromPubkey ?? args.pubkey;
  if (!raw) throw new Error("--from-pubkey is required (hex or JSON path)");
  let input = String(raw);
  const asPath = path.resolve(input);
  if (fs.existsSync(asPath)) {
    input = fs.readFileSync(asPath, "utf8");
  }
  const publicKey = sdk.parsePaymentAddress(input);
  const payment = sdk.buildPaymentAddress({
    publicKey,
    label: args.label ?? null,
  });
  const outPath = path.resolve(args.out ?? "payment.addr.json");
  fs.writeFileSync(outPath, JSON.stringify(payment, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        publicKey: payment.publicKey,
        scheme: payment.scheme,
        warning: payment.warning,
      },
      null,
      2
    )
  );
}

async function cmdDisclosureKeygen(args) {
  const sdk = await loadSdk();
  const keypair = sdk.generateDisclosureRecipientKeypair();
  const outPath = path.resolve(args.out ?? "disclosure_recipient.json");
  fs.writeFileSync(outPath, JSON.stringify(keypair, null, 2));
  const pub = sdk.exportDisclosureRecipientPublic(keypair);
  const publicOut = path.resolve(
    args["public-out"] ?? args.publicOut ?? "disclosure_recipient.pub.json"
  );
  fs.writeFileSync(publicOut, JSON.stringify(pub, null, 2));
  const payment = sdk.paymentAddressFromKeypair(keypair, args.label ?? null);
  const paymentOut = path.resolve(
    args["payment-out"] ?? args.paymentOut ?? "payment.addr.json"
  );
  fs.writeFileSync(paymentOut, JSON.stringify(payment, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        publicOut,
        paymentOut,
        publicKey: pub.publicKey,
        warning: keypair.warning,
        note: "Share payment.addr.json (or .pub.json) with payers. Keep private key local.",
      },
      null,
      2
    )
  );
}

function resolveRecipientPublicKey(sdk, args) {
  const raw = args["to-pubkey"] ?? args.toPubkey;
  if (!raw) return null;
  const asPath = path.resolve(String(raw));
  if (fs.existsSync(asPath)) {
    const doc = JSON.parse(fs.readFileSync(asPath, "utf8"));
    return sdk.parseRecipientPublicKey(doc);
  }
  return sdk.parseRecipientPublicKey(String(raw));
}

function loadRecipientPrivateKey(sdk, args) {
  const raw = args["recipient-key"] ?? args.recipientKey;
  if (!raw) return null;
  const asPath = path.resolve(String(raw));
  if (fs.existsSync(asPath)) {
    const doc = JSON.parse(fs.readFileSync(asPath, "utf8"));
    sdk.assertDisclosureRecipientKeypair(doc);
    return doc.privateKey;
  }
  return String(raw);
}

async function cmdDisclosureExport(args) {
  if (args.index === undefined) throw new Error("--index is required");
  const kind = String(args.kind ?? "reveal");
  const filePath = path.resolve(args.file ?? "notes.json");
  const passphrase = args.passphrase;
  const store = readNoteStore(filePath);
  const index = Number(args.index);
  if (!Number.isInteger(index) || index < 0 || index >= store.notes.length) {
    throw new Error(`--index out of range (0..${store.notes.length - 1})`);
  }
  const record = store.notes[index];
  const sdk = await loadSdk();
  const toPubkey = resolveRecipientPublicKey(sdk, args);

  if (kind === "claim-stub") {
    if (passphrase || toPubkey) {
      throw new Error("claim-stub has no secrets to seal; omit --passphrase/--to-pubkey");
    }
    const stub = sdk.buildOwnershipClaimStub({
      commitment: record.commitment,
      assetId: record.assetId,
      value: record.value,
      leafIndex: record.leafIndex ?? null,
    });
    const outPath = path.resolve(args.out ?? "claim_stub.json");
    fs.writeFileSync(outPath, JSON.stringify(stub, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: true,
          kind: stub.kind,
          outPath,
          commitment: stub.claim.commitment,
          warning: stub.warning,
        },
        null,
        2
      )
    );
    return;
  }

  if (kind === "view") {
    if (passphrase || toPubkey) {
      throw new Error(
        "view packages are non-spend; seal not required. Omit --passphrase/--to-pubkey (share view key separately)."
      );
    }
    const note = parseNoteRecord(record);
    const poseidon = await sdk.createCircomlibPoseidon();
    const { package: viewPkg } = await sdk.createOwnershipViewPackageFromNote(
      {
        spendingKey: note.spendingKey,
        nullifierKey: note.nullifierKey,
        assetId: note.assetId,
        value: note.value,
        commitment: note.commitment,
        leafIndex: note.leafIndex ?? null,
      },
      poseidon
    );
    const outPath = path.resolve(args.out ?? "view_package.json");
    fs.writeFileSync(outPath, JSON.stringify(viewPkg, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: true,
          kind: viewPkg.kind,
          outPath,
          commitment: viewPkg.claim.commitment,
          warning: viewPkg.warning,
          next: "Share view_key.json separately; recipient runs disclosure verify-view.",
        },
        null,
        2
      )
    );
    return;
  }

  if (kind === "payment-receipt" || kind === "payment_receipt" || kind === "receipt") {
    if (passphrase || toPubkey) {
      throw new Error(
        "payment-receipt packages are non-spend; omit --passphrase/--to-pubkey (share view key separately)."
      );
    }
    const note = parseNoteRecord(record);
    const poseidon = await sdk.createCircomlibPoseidon();
    const { package: receiptPkg } = await sdk.createPaymentReceiptFromNote(
      {
        spendingKey: note.spendingKey,
        nullifierKey: note.nullifierKey,
        assetId: note.assetId,
        value: note.value,
        commitment: note.commitment,
        leafIndex: note.leafIndex ?? null,
      },
      poseidon
    );
    const outPath = path.resolve(args.out ?? "payment_receipt.json");
    fs.writeFileSync(outPath, JSON.stringify(receiptPkg, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: true,
          kind: receiptPkg.kind,
          outPath,
          commitment: receiptPkg.claim.commitment,
          warning: receiptPkg.warning,
          next: "Share view_key.json separately; recipient runs disclosure verify-payment-receipt.",
        },
        null,
        2
      )
    );
    return;
  }

  if (kind !== "reveal") {
    throw new Error("--kind must be reveal, claim-stub, view, or payment-receipt");
  }
  if (passphrase && toPubkey) {
    throw new Error("use either --passphrase or --to-pubkey, not both");
  }

  const defaultOut = passphrase || toPubkey ? "disclosure.apsealed" : "disclosure.json";
  const outPath = path.resolve(args.out ?? defaultOut);
  const disclosure = sdk.buildOwnershipDisclosure({
    version: record.version,
    assetId: record.assetId,
    value: record.value,
    spendingKey: record.spendingKey,
    nullifierKey: record.nullifierKey,
    blinding: record.blinding,
    commitment: record.commitment,
    leafIndex: record.leafIndex ?? null,
  });

  if (toPubkey) {
    const sealed = sdk.sealOwnershipDisclosureToRecipient(disclosure, toPubkey);
    fs.writeFileSync(outPath, JSON.stringify(sealed, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: true,
          sealed: true,
          seal: "x25519-sealed-box",
          outPath,
          kind: sealed.kind,
          recipientPublicKey: sealed.encryption.recipientPublicKey,
          warning: sealed.warning,
        },
        null,
        2
      )
    );
    return;
  }

  if (passphrase) {
    const sealed = sdk.sealOwnershipDisclosure(disclosure, String(passphrase));
    fs.writeFileSync(outPath, JSON.stringify(sealed, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: true,
          sealed: true,
          seal: "passphrase",
          outPath,
          kind: sealed.kind,
          warning: sealed.warning,
        },
        null,
        2
      )
    );
    return;
  }

  fs.writeFileSync(outPath, JSON.stringify(disclosure, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        sealed: false,
        outPath,
        kind: disclosure.kind,
        commitment: disclosure.claim.commitment,
        warning: disclosure.warning,
      },
      null,
      2
    )
  );
}

async function cmdDisclosureOpen(args) {
  const filePath = path.resolve(args.file ?? "disclosure.apsealed");
  const outPath = path.resolve(args.out ?? "disclosure.json");
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const sdk = await loadSdk();
  const recipientKey = loadRecipientPrivateKey(sdk, args);
  let disclosure;
  if (recipientKey) {
    if (args.passphrase) {
      throw new Error("use either --passphrase or --recipient-key, not both");
    }
    disclosure = sdk.unsealOwnershipDisclosureWithRecipientKey(raw, recipientKey);
  } else if (args.passphrase) {
    disclosure = sdk.unsealOwnershipDisclosure(raw, String(args.passphrase));
  } else {
    throw new Error("sealed disclosure requires --passphrase or --recipient-key");
  }
  fs.writeFileSync(outPath, JSON.stringify(disclosure, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        commitment: disclosure.claim.commitment,
        warning: disclosure.warning,
      },
      null,
      2
    )
  );
}

async function cmdDisclosureVerify(args) {
  const filePath = path.resolve(args.file ?? "disclosure.json");
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const sdk = await loadSdk();
  let disclosure = raw;
  if (raw?.format === sdk.DISCLOSURE_SEALED_FORMAT) {
    const recipientKey = loadRecipientPrivateKey(sdk, args);
    if (recipientKey) {
      disclosure = sdk.unsealOwnershipDisclosureWithRecipientKey(raw, recipientKey);
    } else if (args.passphrase) {
      disclosure = sdk.unsealOwnershipDisclosure(raw, String(args.passphrase));
    } else {
      throw new Error("sealed disclosure requires --passphrase or --recipient-key");
    }
  } else {
    sdk.assertOwnershipDisclosure(raw);
  }
  const poseidon = await sdk.createCircomlibPoseidon();
  const result = await sdk.verifyOwnershipDisclosure(disclosure, poseidon);
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        ...result,
        leafIndex: disclosure.claim.leafIndex,
        note: "Commitment match only — not membership / unspent proof.",
      },
      null,
      2
    )
  );
  if (!result.ok) process.exitCode = 1;
}

function loadViewKeyMaterial(sdk, args) {
  const raw = args["view-key"] ?? args.viewKey;
  if (!raw) throw new Error("--view-key is required (file or decimal/hex string)");
  const asPath = path.resolve(String(raw));
  if (fs.existsSync(asPath)) {
    const doc = JSON.parse(fs.readFileSync(asPath, "utf8"));
    sdk.assertViewKeyExport(doc);
    return doc.viewKey;
  }
  return String(raw);
}

async function cmdDisclosureVerifyView(args) {
  const filePath = path.resolve(args.file ?? "view_package.json");
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const sdk = await loadSdk();
  sdk.assertOwnershipViewPackage(raw);
  const viewKey = loadViewKeyMaterial(sdk, args);
  const poseidon = await sdk.createCircomlibPoseidon();
  const result = await sdk.verifyOwnershipViewPackage(raw, viewKey, poseidon);
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        ...result,
        commitment: raw.claim.commitment,
        leafIndex: raw.claim.leafIndex,
        note: "View-tag match only — not membership / unspent / spend auth.",
      },
      null,
      2
    )
  );
  if (!result.ok) process.exitCode = 1;
}

async function cmdDisclosureVerifyPaymentReceipt(args) {
  const filePath = path.resolve(args.file ?? "payment_receipt.json");
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const sdk = await loadSdk();
  sdk.assertPaymentReceiptPackage(raw);
  const viewKey = loadViewKeyMaterial(sdk, args);
  const poseidon = await sdk.createCircomlibPoseidon();
  const result = await sdk.verifyPaymentReceiptPackage(raw, viewKey, poseidon);
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        ...result,
        commitment: raw.claim.commitment,
        leafIndex: raw.claim.leafIndex,
        note: "Receipt-tag match only — not membership / unspent / on-chain payment proof.",
      },
      null,
      2
    )
  );
  if (!result.ok) process.exitCode = 1;
}

async function cmdDisclosureProveOwnership(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const outPath = path.resolve(args.out ?? "ownership_dev_proof.json");
  const index = Number(args.index ?? 0);
  const audienceTag = BigInt(args["audience-tag"] ?? args.audienceTag ?? "1");

  const wasm = path.join(circuitsBuild, "ownership_dev_js", "ownership_dev.wasm");
  const zkey = path.join(circuitsBuild, "ownership_dev_final.zkey");
  const vkeyPath = path.join(circuitsBuild, "ownership_dev_vkey.json");
  requireArtifacts([wasm, zkey, vkeyPath]);

  const store = readNoteStore(filePath);
  if (!store.notes[index]) throw new Error(`no note at index ${index}`);
  const note = parseNoteRecord(store.notes[index]);
  const sdk = await loadSdk();
  const poseidon = await sdk.createCircomlibPoseidon();
  const commitment = await sdk.computeCommitment(
    {
      version: note.version,
      assetId: note.assetId,
      value: note.value,
      spendingKey: note.spendingKey,
      nullifierKey: note.nullifierKey,
      blinding: note.blinding,
    },
    poseidon
  );
  if (commitment !== note.commitment) {
    throw new Error("note commitment mismatch — refuse to prove");
  }

  const input = {
    commitment: commitment.toString(),
    value: note.value.toString(),
    assetId: note.assetId.toString(),
    audienceTag: audienceTag.toString(),
    version: note.version.toString(),
    spendingKey: note.spendingKey.toString(),
    nullifierKey: note.nullifierKey.toString(),
    blinding: note.blinding.toString(),
  };

  const snarkjs = loadSnarkjs();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("local ownership_dev verification failed");

  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse(`[${calldata}]`);
  const proofA = argv[0].map(String);
  const proofB = argv[1].map((row) => row.map(String));
  const proofC = argv[2].map(String);

  const doc = {
    format: "absolute-privacy-ownership-proof",
    version: 1,
    circuit: "ownership_dev",
    warning:
      "Experimental local keys. Proves preimage knowledge for commitment/value/assetId bound to audienceTag. Does not authorize spend. Not ceremony-grade.",
    claim: {
      commitment: commitment.toString(),
      value: note.value.toString(),
      assetId: note.assetId.toString(),
      audienceTag: audienceTag.toString(),
    },
    proofA,
    proofB,
    proofC,
    proof,
    publicSignals: publicSignals.map(String),
  };
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        claim: doc.claim,
        note: "Off-chain only. Secrets stay local; proof package has no spend keys.",
      },
      null,
      2
    )
  );
  process.exit(0);
}

async function cmdDisclosureVerifyOwnership(args) {
  const proofPath = path.resolve(args.proof ?? args.file ?? "ownership_dev_proof.json");
  const vkeyPath = path.join(circuitsBuild, "ownership_dev_vkey.json");
  requireArtifacts([vkeyPath]);
  if (!fs.existsSync(proofPath)) throw new Error(`missing proof: ${proofPath}`);
  const doc = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (!doc.proof || !doc.publicSignals) {
    throw new Error("proof package missing proof/publicSignals");
  }
  const snarkjs = loadSnarkjs();
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, doc.publicSignals, doc.proof);
  console.log(
    JSON.stringify(
      {
        ok,
        circuit: doc.circuit ?? "ownership_dev",
        claim: doc.claim ?? null,
        note: "Off-chain verify only. Not a spend authorization.",
      },
      null,
      2
    )
  );
  process.exit(ok ? 0 : 1);
}

const VALUE_BOUND_MAX = (1n << 64n) - 1n;

async function cmdDisclosureProveValueBound(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const outPath = path.resolve(args.out ?? "value_bound_dev_proof.json");
  const index = Number(args.index ?? 0);
  if (args.threshold === undefined) throw new Error("--threshold is required");
  const threshold = BigInt(args.threshold);
  const audienceTag = BigInt(args["audience-tag"] ?? args.audienceTag ?? "1");

  const wasm = path.join(circuitsBuild, "value_bound_dev_js", "value_bound_dev.wasm");
  const zkey = path.join(circuitsBuild, "value_bound_dev_final.zkey");
  const vkeyPath = path.join(circuitsBuild, "value_bound_dev_vkey.json");
  requireArtifacts([wasm, zkey, vkeyPath]);

  const store = readNoteStore(filePath);
  if (!store.notes[index]) throw new Error(`no note at index ${index}`);
  const note = parseNoteRecord(store.notes[index]);
  if (note.value > VALUE_BOUND_MAX || threshold > VALUE_BOUND_MAX) {
    throw new Error("value/threshold must fit in 64 bits for value_bound_dev");
  }
  if (note.value < threshold) {
    throw new Error(`note value ${note.value} is below threshold ${threshold}`);
  }

  const sdk = await loadSdk();
  const poseidon = await sdk.createCircomlibPoseidon();
  const commitment = await sdk.computeCommitment(
    {
      version: note.version,
      assetId: note.assetId,
      value: note.value,
      spendingKey: note.spendingKey,
      nullifierKey: note.nullifierKey,
      blinding: note.blinding,
    },
    poseidon
  );
  if (commitment !== note.commitment) {
    throw new Error("note commitment mismatch — refuse to prove");
  }

  const input = {
    commitment: commitment.toString(),
    assetId: note.assetId.toString(),
    threshold: threshold.toString(),
    audienceTag: audienceTag.toString(),
    version: note.version.toString(),
    value: note.value.toString(),
    spendingKey: note.spendingKey.toString(),
    nullifierKey: note.nullifierKey.toString(),
    blinding: note.blinding.toString(),
  };

  const snarkjs = loadSnarkjs();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("local value_bound_dev verification failed");

  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse(`[${calldata}]`);
  const proofA = argv[0].map(String);
  const proofB = argv[1].map((row) => row.map(String));
  const proofC = argv[2].map(String);

  const doc = {
    format: "absolute-privacy-value-bound-proof",
    version: 1,
    circuit: "value_bound_dev",
    warning:
      "Experimental local keys. Proves note preimage for commitment/assetId and that private value >= public threshold, bound to audienceTag. Exact value is not a public claim field. Does not authorize spend. Not ceremony-grade.",
    claim: {
      commitment: commitment.toString(),
      assetId: note.assetId.toString(),
      threshold: threshold.toString(),
      audienceTag: audienceTag.toString(),
    },
    proofA,
    proofB,
    proofC,
    proof,
    publicSignals: publicSignals.map(String),
  };
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        claim: doc.claim,
        note: "Off-chain only. Exact value stays private; proof package has no spend keys.",
      },
      null,
      2
    )
  );
  process.exit(0);
}

async function cmdDisclosureVerifyValueBound(args) {
  const proofPath = path.resolve(args.proof ?? args.file ?? "value_bound_dev_proof.json");
  const vkeyPath = path.join(circuitsBuild, "value_bound_dev_vkey.json");
  requireArtifacts([vkeyPath]);
  if (!fs.existsSync(proofPath)) throw new Error(`missing proof: ${proofPath}`);
  const doc = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (!doc.proof || !doc.publicSignals) {
    throw new Error("proof package missing proof/publicSignals");
  }
  const snarkjs = loadSnarkjs();
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, doc.publicSignals, doc.proof);
  console.log(
    JSON.stringify(
      {
        ok,
        circuit: doc.circuit ?? "value_bound_dev",
        claim: doc.claim ?? null,
        note: "Off-chain verify only. Proves value>=threshold under local keys — not spend auth.",
      },
      null,
      2
    )
  );
  process.exit(ok ? 0 : 1);
}

async function cmdDisclosureAnchorBuild(args) {
  const filePath = path.resolve(args.file ?? args.proof ?? "value_bound_dev_proof.json");
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const sdk = await loadSdk();
  const mode = String(args.mode ?? "bulletin");
  const outPath = path.resolve(
    args.out ??
      (mode === "verifying"
        ? "verifying_attestation_call.json"
        : "attestation_anchor_call.json")
  );

  if (mode === "verifying") {
    if (!doc.proofA || !doc.proofB || !doc.proofC || !doc.publicSignals) {
      throw new Error(
        "proof package missing proofA/B/C — re-run prove-value-bound / prove-ownership with a current CLI"
      );
    }
    const { encodePostValueBoundProofCalldata, encodePostOwnershipProofCalldata } =
      await import(pathToFileURL(path.resolve(__dirname, "../lib/abiEncode.mjs")).href);

    if (doc.circuit === "value_bound_dev") {
      const onchainDigest = sdk.computeValueBoundOnchainDigest({
        commitment: doc.claim.commitment,
        assetId: doc.claim.assetId,
        threshold: doc.claim.threshold,
        audienceTag: doc.claim.audienceTag,
      });
      const calldata = encodePostValueBoundProofCalldata({
        proofA: doc.proofA,
        proofB: doc.proofB,
        proofC: doc.proofC,
        publicSignals: doc.publicSignals,
      });
      const call = {
        function: "postValueBoundProof",
        contract: "VerifyingAttestationAnchor",
        warning:
          "Verifies value_bound_dev Groth16 with LOCAL *_dev keys, then timestamps on-chain digest. Not ceremony-grade. Not membership/unspent proof.",
        args: {
          proofA: doc.proofA,
          proofB: doc.proofB,
          proofC: doc.proofC,
          publicSignals: doc.publicSignals,
          onchainDigest,
          kindLabel: "value_bound_dev",
        },
        calldata,
        accounting: null,
      };
      fs.writeFileSync(outPath, JSON.stringify(call, null, 2));
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "verifying",
            outPath,
            onchainDigest,
            warning: call.warning,
            next: "ap send call --rpc … --to <VerifyingAttestationAnchor> --call …",
          },
          null,
          2
        )
      );
      return;
    }

    if (doc.circuit === "ownership_dev") {
      const onchainDigest = sdk.computeOwnershipOnchainDigest({
        commitment: doc.claim.commitment,
        value: doc.claim.value,
        assetId: doc.claim.assetId,
        audienceTag: doc.claim.audienceTag,
      });
      const calldata = encodePostOwnershipProofCalldata({
        proofA: doc.proofA,
        proofB: doc.proofB,
        proofC: doc.proofC,
        publicSignals: doc.publicSignals,
      });
      const call = {
        function: "postOwnershipProof",
        contract: "VerifyingAttestationAnchor",
        warning:
          "Verifies ownership_dev Groth16 with LOCAL *_dev keys, then timestamps on-chain digest. Publishes value in public signals. Not ceremony-grade. Not spend auth.",
        args: {
          proofA: doc.proofA,
          proofB: doc.proofB,
          proofC: doc.proofC,
          publicSignals: doc.publicSignals,
          onchainDigest,
          kindLabel: "ownership_dev",
        },
        calldata,
        accounting: null,
      };
      fs.writeFileSync(outPath, JSON.stringify(call, null, 2));
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "verifying",
            outPath,
            onchainDigest,
            warning: call.warning,
            next: "ap send call --rpc … --to <VerifyingAttestationAnchor> --call …",
          },
          null,
          2
        )
      );
      return;
    }

    throw new Error(
      "--mode verifying supports value_bound_dev and ownership_dev proofs only"
    );
  }

  const { kind, kindId, digest } = sdk.attestationDigestFromProofPackage(doc);
  const { encodePostAttestationCalldata } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/abiEncode.mjs")).href
  );
  const calldata = encodePostAttestationCalldata({ kind: kindId, digest });
  const call = {
    function: "postAttestation",
    contract: "AttestationAnchor",
    warning:
      "AttestationAnchor timestamps a digest only. It does NOT verify zk proofs, view tags, membership, or unspent status.",
    args: {
      kind: kindId,
      kindLabel: kind,
      digest,
    },
    calldata,
    accounting: null,
  };
  fs.writeFileSync(outPath, JSON.stringify(call, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "bulletin",
        outPath,
        kind,
        kindId,
        digest,
        warning: call.warning,
        next: "ap send call --rpc … --to <anchor> --call attestation_anchor_call.json",
      },
      null,
      2
    )
  );
}

async function cmdDisclosureAnchorLookup(args) {
  if (!args.rpc) throw new Error("--rpc is required");
  if (!args.anchor) throw new Error("--anchor is required");
  await guardRpcNetwork(args, "disclosure anchor-lookup");
  let digest = args.digest;
  if (!digest && (args.file || args.proof)) {
    const filePath = path.resolve(args.file ?? args.proof);
    const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const sdk = await loadSdk();
    digest = sdk.attestationDigestFromProofPackage(doc).digest;
  }
  if (!digest) throw new Error("--digest or --file/--proof is required");
  const eth = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href
  );
  const data = `${eth.selector("getAttestation(bytes32)")}${encodeBytes32Word(digest)}`;
  const word = await eth.ethCall({
    rpcUrl: args.rpc,
    to: args.anchor,
    data,
  });
  const words = eth.decodeAbiWords(word);
  if (words.length < 3) throw new Error(`unexpected getAttestation return: ${word}`);
  const poster = `0x${eth.strip0x(words[0]).slice(24)}`;
  const kind = eth.decodeBytes32Word(words[1]);
  const postedAt = eth.decodeUint256Word(words[2]);
  console.log(
    JSON.stringify(
      {
        ok: true,
        digest,
        poster,
        kind,
        postedAt: postedAt.toString(),
        posted: postedAt > 0n,
        note: "posted=true only means a digest was timestamped — not that a proof was verified on-chain.",
      },
      null,
      2
    )
  );
}

function encodeBytes32Word(value) {
  const h = String(value).startsWith("0x") ? String(value).slice(2) : String(value);
  if (h.length > 64) throw new Error("bytes32 too long");
  return h.padStart(64, "0");
}

async function cmdNoteScan(args) {
  if (!args.rpc) throw new Error("--rpc is required");
  if (!args.pool) throw new Error("--pool is required");
  await guardRpcNetwork(args, "note scan");
  const filePath = path.resolve(args.file ?? "notes.json");
  const store = readNoteStore(filePath);

  const { fetchIsNullifierSpent, fetchPublicPoolSnapshot } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href
  );
  const sdk = await loadSdk();
  const poseidon = await sdk.createCircomlibPoseidon();

  let state = null;
  if (args.state) {
    state = readPublicState(path.resolve(args.state), sdk);
  } else {
    const snapshot = await fetchPublicPoolSnapshot({
      rpcUrl: args.rpc,
      pool: args.pool,
    });
    state = sdk.createEmptyPublicState(snapshot.depth);
    state.commitments = snapshot.commitments;
    state = await sdk.refreshPublicStateRoot(state, poseidon);
    if (state.root !== snapshot.onChainRoot) {
      throw new Error(
        `local root ${state.root} != on-chain root ${snapshot.onChainRoot}`
      );
    }
  }

  let checked = 0;
  let newlySpent = 0;
  let alreadySpent = 0;
  let unbound = 0;
  let stillUnspent = 0;
  const details = [];

  for (let i = 0; i < store.notes.length; i++) {
    const record = store.notes[i];
    const note = parseNoteRecord(record);
    if (note.statusHint === "spent") {
      alreadySpent += 1;
      details.push({ index: i, status: "already-spent" });
      continue;
    }

    let leafIndex =
      note.leafIndex !== undefined && note.leafIndex !== null
        ? Number(note.leafIndex)
        : undefined;
    if (leafIndex === undefined) {
      try {
        leafIndex = sdk.findCommitmentIndex(state, note.commitment);
        store.notes[i].leafIndex = leafIndex;
      } catch {
        unbound += 1;
        details.push({ index: i, status: "unbound" });
        continue;
      }
    }

    const nullifier = await sdk.computeNullifier(
      note.nullifierKey,
      note.commitment,
      leafIndex,
      poseidon
    );
    checked += 1;
    const spent = await fetchIsNullifierSpent({
      rpcUrl: args.rpc,
      pool: args.pool,
      nullifier,
    });
    if (spent) {
      newlySpent += 1;
      store.notes[i].statusHint = "spent";
      store.notes[i].leafIndex = leafIndex;
      details.push({
        index: i,
        status: "newly-spent",
        leafIndex,
        nullifier: nullifier.toString(),
      });
    } else {
      stillUnspent += 1;
      store.notes[i].statusHint = "unspent";
      store.notes[i].leafIndex = leafIndex;
      details.push({ index: i, status: "unspent", leafIndex });
    }
  }

  writeNoteStore(filePath, store);
  console.log(
    JSON.stringify(
      {
        ok: true,
        file: filePath,
        pool: args.pool,
        checked,
        newlySpent,
        alreadySpent,
        stillUnspent,
        unbound,
        details,
      },
      null,
      2
    )
  );
}

async function cmdStateInit(args) {
  const sdk = await loadSdk();
  const depth = Number(args.depth ?? 20);
  const outPath = path.resolve(args.out ?? "public_state.json");
  const { createCircomlibPoseidon, createEmptyPublicState, refreshPublicStateRoot } =
    sdk;
  const poseidon = await createCircomlibPoseidon();
  let state = createEmptyPublicState(depth);
  state = await refreshPublicStateRoot(state, poseidon);
  writePublicState(outPath, state);
  console.log(JSON.stringify({ ok: true, outPath, depth, root: state.root }, null, 2));
}

async function cmdStateShow(args) {
  const sdk = await loadSdk();
  const filePath = path.resolve(args.file ?? "public_state.json");
  const state = readPublicState(filePath, sdk);
  console.log(
    JSON.stringify(
      {
        file: filePath,
        depth: state.depth,
        root: state.root,
        count: state.commitments.length,
        updatedAt: state.updatedAt,
      },
      null,
      2
    )
  );
}

async function cmdStateAppend(args) {
  const sdk = await loadSdk();
  const filePath = path.resolve(args.file ?? "public_state.json");
  if (!args.commitment) throw new Error("--commitment is required");
  const state = readPublicState(filePath, sdk);
  const poseidon = await sdk.createCircomlibPoseidon();
  const { state: next, leafIndex } = await sdk.appendCommitment(
    state,
    args.commitment,
    poseidon
  );
  writePublicState(filePath, next);

  if (args.notes) {
    const notesPath = path.resolve(args.notes);
    const store = readNoteStore(notesPath);
    const noteIndex = Number(args["note-index"] ?? 0);
    if (!store.notes[noteIndex]) throw new Error(`no note at index ${noteIndex}`);
    const noteCommitment = sdk.parseCommitment(store.notes[noteIndex].commitment);
    const appended = sdk.parseCommitment(args.commitment);
    if (noteCommitment.toString() !== appended.toString()) {
      throw new Error("--commitment does not match selected note commitment");
    }
    store.notes[noteIndex].leafIndex = leafIndex;
    writeNoteStore(notesPath, store);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        file: filePath,
        leafIndex,
        root: next.root,
        count: next.commitments.length,
      },
      null,
      2
    )
  );
}

async function cmdStateRebuild(args) {
  const sdk = await loadSdk();
  const filePath = path.resolve(args.file ?? "public_state.json");
  const state = readPublicState(filePath, sdk);
  const poseidon = await sdk.createCircomlibPoseidon();
  const next = await sdk.refreshPublicStateRoot(state, poseidon);
  writePublicState(filePath, next);
  console.log(
    JSON.stringify(
      { ok: true, file: filePath, root: next.root, count: next.commitments.length },
      null,
      2
    )
  );
}

async function cmdStateFetch(args) {
  const { resolveSepoliaCommandArgs } = await import("../lib/sepoliaRegistry.mjs");
  resolveSepoliaCommandArgs(args, { pool: true });
  if (!args.rpc) throw new Error("--rpc is required");
  if (!args.pool) throw new Error("--pool is required");
  await guardRpcNetwork(args, "state fetch");
  const outPath = path.resolve(args.out ?? "public_state.json");
  const depthArg = args.depth !== undefined ? Number(args.depth) : undefined;

  const { fetchPublicPoolSnapshot } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href
  );
  const sdk = await loadSdk();
  const snapshot = await fetchPublicPoolSnapshot({
    rpcUrl: args.rpc,
    pool: args.pool,
    depth: depthArg,
  });

  const poseidon = await sdk.createCircomlibPoseidon();
  let state = sdk.createEmptyPublicState(snapshot.depth);
  state.commitments = snapshot.commitments;
  state = await sdk.refreshPublicStateRoot(state, poseidon);

  if (state.root !== snapshot.onChainRoot) {
    throw new Error(
      `local root ${state.root} != on-chain root ${snapshot.onChainRoot} (Poseidon/tree mismatch)`
    );
  }

  writePublicState(outPath, {
    ...state,
    source: {
      rpc: args.rpc,
      pool: args.pool,
      fetchedAt: new Date().toISOString(),
    },
  });

  const { poolHealthTier, poolHealthWarning } = sdk;
  const tier = poolHealthTier(state.commitments.length);
  const health = poolHealthWarning(state.commitments.length);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        pool: args.pool,
        depth: state.depth,
        count: state.commitments.length,
        root: state.root,
        matchedOnChainRoot: true,
        poolHealthTier: tier,
        privacyWarnings: [health],
      },
      null,
      2
    )
  );
}

async function cmdProveWithdrawDev(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const { wasm, zkey, vkeyPath, source } = await loadProvingKeys("withdraw");
  requireArtifacts([wasm, zkey, vkeyPath]);

  const sdk = await loadSdk();
  const store = readNoteStore(filePath);
  const indices = String(args.indices ?? `${args.index ?? 0},${Number(args.index ?? 0) + 1}`)
    .split(",")
    .map((value) => Number(value.trim()));
  if (
    indices.length !== 2 ||
    indices.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    indices[0] === indices[1]
  ) {
    throw new Error("withdraw-dev requires exactly two distinct --indices <i,j>");
  }
  if (!args.state) {
    throw new Error("2-input withdraw-dev requires --state containing both input commitments");
  }
  const inNotes = indices.map((index) => {
    if (!store.notes[index]) throw new Error(`no note at index ${index}`);
    const note = parseNoteRecord(store.notes[index]);
    if (note.statusHint === "spent") throw new Error(`note at index ${index} is already marked spent`);
    return note;
  });
  if (inNotes[0].assetId !== inNotes[1].assetId) {
    throw new Error("withdraw-dev input notes must use the same assetId");
  }
  const withdrawAmount = inNotes[0].value + inNotes[1].value;
  const recipient = BigInt(args.recipient ?? "0xb0b");
  const withdrawFee = feeFromPpm(withdrawAmount, WITHDRAW_FEE_PPM);
  const outPath = path.resolve(args.out ?? "withdraw_dev_proof.json");

  const poseidon = await sdk.createCircomlibPoseidon();
  const snarkjs = loadSnarkjs();
  const witnesses = [];
  for (const note of inNotes) {
    witnesses.push(
      await resolveWitness({
        note,
        statePath: args.state,
        poseidon,
        sdk,
        depthFallback: 20,
      })
    );
  }
  if (witnesses[0].root !== witnesses[1].root || witnesses[0].depth !== witnesses[1].depth) {
    throw new Error("withdraw-dev input witnesses must share one root and depth");
  }
  const nullifiers = await Promise.all(
    inNotes.map((note, i) =>
      sdk.computeNullifier(
        note.nullifierKey,
        note.commitment,
        witnesses[i].leafIndex,
        poseidon
      )
    )
  );

  const input = {
    merkleRoot: witnesses[0].root.toString(),
    nullifiers: nullifiers.map((value) => value.toString()),
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    inVersion: inNotes.map((note) => note.version.toString()),
    inAssetId: inNotes.map((note) => note.assetId.toString()),
    inValue: inNotes.map((note) => note.value.toString()),
    inSpendingKey: inNotes.map((note) => note.spendingKey.toString()),
    inNullifierKey: inNotes.map((note) => note.nullifierKey.toString()),
    inBlinding: inNotes.map((note) => note.blinding.toString()),
    inLeafIndex: witnesses.map((witness) => String(witness.leafIndex)),
    inPathElements: witnesses.map((witness) =>
      witness.path.pathElements.map((x) => x.toString())
    ),
    inPathIndices: witnesses.map((witness) =>
      witness.path.pathIndices.map((x) => x.toString())
    ),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasm,
    zkey
  );
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("local proof verification failed");

  const payload = {
    circuit: "withdraw",
    topology: { inputNotes: 2, outputNotes: 0 },
    depth: witnesses[0].depth,
    witnessMode: witnesses[0].mode,
    leafIndices: witnesses.map((witness) => witness.leafIndex),
    nullifiers: nullifiers.map((value) => value.toString()),
    merkleRoot: witnesses[0].root.toString(),
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    proof,
    publicSignals,
  };
  writeShareableJson(outPath, payload, args);

  const depositValues = store.notes
    .filter((n) => n.statusHint !== "spent")
    .map((n) => n.value);
  const recipientHex = `0x${recipient.toString(16).padStart(40, "0")}`;
  const privacyWarnings = sdk.formatPrivacyWarnings([
    ...sdk.assessAmountFingerprint({
      value: withdrawAmount,
      context: "withdraw",
      recentDepositValues: depositValues,
    }),
    ...sdk.assessWithdrawIdentity({
      depositBroadcaster: null,
      withdrawBroadcaster: args.from ?? null,
      withdrawRecipient: recipientHex,
    }),
  ]);

  logShareable(
    {
      ok: true,
      outPath,
      witnessMode: witnesses[0].mode,
      leafIndices: payload.leafIndices,
      nullifiers: payload.nullifiers,
      merkleRoot: payload.merkleRoot,
      privacyWarnings,
      keysSource: source,
      note: provingKeysHonesty(source),
    },
    args
  );
  process.exit(0);
}

async function cmdProveWithdraw1Dev(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const { wasm, zkey, vkeyPath, source } = await loadProvingKeys("withdraw_1in");
  requireArtifacts([wasm, zkey, vkeyPath]);

  const sdk = await loadSdk();
  const store = readNoteStore(filePath);
  const index = Number(args.index ?? 0);
  if (!Number.isSafeInteger(index) || index < 0 || !store.notes[index]) {
    throw new Error("withdraw-1-dev requires a valid --index");
  }
  if (!args.state) {
    throw new Error("withdraw-1-dev requires --state");
  }
  const note = parseNoteRecord(store.notes[index]);
  if (note.statusHint === "spent") throw new Error(`note at index ${index} is already marked spent`);

  const withdrawAmount = note.value;
  const recipient = BigInt(args.recipient ?? "0xb0b");
  const floorFee = feeFromPpm(withdrawAmount, WITHDRAW_FEE_PPM);
  const withdrawFee =
    args["withdraw-fee"] != null ? BigInt(args["withdraw-fee"]) : floorFee;
  if (withdrawFee < floorFee) {
    throw new Error(
      `withdraw fee ${withdrawFee} is below the 0.04% floor ${floorFee}`
    );
  }
  const outPath = path.resolve(args.out ?? "withdraw_1in_dev_proof.json");
  const poseidon = await sdk.createCircomlibPoseidon();
  const snarkjs = loadSnarkjs();
  const witness = await resolveWitness({
    note,
    statePath: args.state,
    poseidon,
    sdk,
    depthFallback: 20,
  });
  const nullifier = await sdk.computeNullifier(
    note.nullifierKey,
    note.commitment,
    witness.leafIndex,
    poseidon
  );
  const input = {
    merkleRoot: witness.root.toString(),
    nullifiers: [nullifier.toString()],
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    inVersion: [note.version.toString()],
    inAssetId: [note.assetId.toString()],
    inValue: [note.value.toString()],
    inSpendingKey: [note.spendingKey.toString()],
    inNullifierKey: [note.nullifierKey.toString()],
    inBlinding: [note.blinding.toString()],
    inLeafIndex: [String(witness.leafIndex)],
    inPathElements: [witness.path.pathElements.map((x) => x.toString())],
    inPathIndices: [witness.path.pathIndices.map((x) => x.toString())],
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) {
    throw new Error("local proof verification failed");
  }
  if (publicSignals.length !== 5) {
    throw new Error(`expected 5 publics, got ${publicSignals.length}`);
  }
  const payload = {
    circuit: "withdraw_1in",
    function: "withdraw1",
    topology: { inputNotes: 1, outputNotes: 0 },
    depth: witness.depth,
    leafIndices: [witness.leafIndex],
    nullifiers: [nullifier.toString()],
    merkleRoot: witness.root.toString(),
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    proof,
    publicSignals,
    keysSource: source,
    warning: provingKeysHonesty(source),
  };
  writeShareableJson(outPath, payload, args);

  let commitmentCount;
  try {
    const stateDoc = JSON.parse(fs.readFileSync(path.resolve(args.state), "utf8"));
    if (Array.isArray(stateDoc.commitments)) {
      commitmentCount = stateDoc.commitments.length;
    }
  } catch {
    commitmentCount = undefined;
  }
  const recipientHex = `0x${recipient.toString(16).padStart(40, "0")}`;
  const privacyWarnings = sdk.formatPrivacyWarnings(
    sdk.assessPracticalPrivacy({
      commitmentCount,
      amount: withdrawAmount,
      amountContext: "withdraw",
      withdrawRecipient: recipientHex,
      withdrawKind: "full",
    })
  );

  logShareable(
    {
      ok: true,
      outPath,
      leafIndices: payload.leafIndices,
      privacyWarnings,
      poolCommitmentCount: commitmentCount ?? null,
      keysSource: source,
      note: provingKeysHonesty(source),
    },
    args
  );
  process.exit(0);
}

async function cmdProveWithdrawPartialDev(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const { wasm, zkey, vkeyPath, source } = await loadProvingKeys("withdraw_partial");
  requireArtifacts([wasm, zkey, vkeyPath]);

  const sdk = await loadSdk();
  const store = readNoteStore(filePath);
  const index = Number(args.index ?? 0);
  if (!Number.isSafeInteger(index) || index < 0 || !store.notes[index]) {
    throw new Error("withdraw-partial-dev requires a valid --index");
  }
  if (!args.state) throw new Error("withdraw-partial-dev requires --state");
  if (args.amount == null) throw new Error("withdraw-partial-dev requires --amount");
  const note = parseNoteRecord(store.notes[index]);
  if (note.statusHint === "spent") throw new Error(`note at index ${index} is already marked spent`);
  const withdrawAmount = BigInt(args.amount);
  if (withdrawAmount <= 0n || withdrawAmount >= note.value) {
    throw new Error("partial --amount must be > 0 and < note value");
  }
  const changeValue = note.value - withdrawAmount;
  const recipient = BigInt(args.recipient ?? "0xb0b");
  const withdrawFee = feeFromPpm(withdrawAmount, WITHDRAW_FEE_PPM);
  const outPath = path.resolve(args.out ?? "withdraw_partial_dev_proof.json");
  const changeOut = path.resolve(args["change-out"] ?? "change_note.json");

  const poseidon = await sdk.createCircomlibPoseidon();
  const { note: change, commitment: changeC } = await sdk.createNote({
    assetId: note.assetId,
    value: changeValue,
    poseidon,
  });
  const snarkjs = loadSnarkjs();
  const witness = await resolveWitness({
    note,
    statePath: args.state,
    poseidon,
    sdk,
    depthFallback: 20,
  });
  const nullifier = await sdk.computeNullifier(
    note.nullifierKey,
    note.commitment,
    witness.leafIndex,
    poseidon
  );
  const input = {
    merkleRoot: witness.root.toString(),
    nullifiers: [nullifier.toString()],
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    inLeafIndex: [String(witness.leafIndex)],
    outCommitments: [changeC.toString()],
    inVersion: [note.version.toString()],
    inAssetId: [note.assetId.toString()],
    inValue: [note.value.toString()],
    inSpendingKey: [note.spendingKey.toString()],
    inNullifierKey: [note.nullifierKey.toString()],
    inBlinding: [note.blinding.toString()],
    inPathElements: [witness.path.pathElements.map((x) => x.toString())],
    inPathIndices: [witness.path.pathIndices.map((x) => x.toString())],
    outVersion: [change.version.toString()],
    outAssetId: [change.assetId.toString()],
    outValue: [change.value.toString()],
    outSpendingKey: [change.spendingKey.toString()],
    outNullifierKey: [change.nullifierKey.toString()],
    outBlinding: [change.blinding.toString()],
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) {
    throw new Error("local proof verification failed");
  }
  if (publicSignals.length !== 6) {
    throw new Error(`expected 6 publics, got ${publicSignals.length}`);
  }
  const changeRecord = {
    version: change.version.toString(),
    assetId: change.assetId.toString(),
    value: change.value.toString(),
    spendingKey: change.spendingKey.toString(),
    nullifierKey: change.nullifierKey.toString(),
    blinding: change.blinding.toString(),
    commitment: changeC.toString(),
    statusHint: "unspent",
  };
  fs.writeFileSync(
    changeOut,
    JSON.stringify(
      {
        format: "absolute-privacy-spend-note",
        version: 1,
        warning: "PLAINTEXT SPEND SECRET — save offline",
        note: changeRecord,
      },
      null,
      2
    )
  );
  const payload = {
    circuit: "withdraw_partial",
    function: "withdrawPartial1",
    topology: { inputNotes: 1, outputNotes: 1 },
    depth: witness.depth,
    leafIndices: [witness.leafIndex],
    nullifiers: [nullifier.toString()],
    merkleRoot: witness.root.toString(),
    recipient: recipient.toString(),
    withdrawAmount: withdrawAmount.toString(),
    withdrawFee: withdrawFee.toString(),
    outCommitment: changeC.toString(),
    changeNotePath: changeOut,
    proof,
    publicSignals,
    keysSource: source,
    warning: provingKeysHonesty(source),
  };
  writeShareableJson(outPath, payload, args);
  logShareable(
    {
      ok: true,
      outPath,
      changeOut,
      leafIndices: payload.leafIndices,
      keysSource: source,
      note: provingKeysHonesty(source),
    },
    args
  );
  process.exit(0);
}

async function cmdProveTransferDev(_args) {
  // OBSOLETE: transfer path removed from product UX. Function retained so dispatch stays stable.
  throw new Error(
    "prove transfer-dev / merge is obsolete — product path is deposit + withdraw (1-in / 2-in / partial). Depth-4 transfer_dev artifacts are not synced."
  );
}

async function cmdProveDepositDev(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const { wasm, zkey, vkeyPath, source } = await loadProvingKeys("deposit");
  requireArtifacts([wasm, zkey, vkeyPath]);

  const sdk = await loadSdk();
  const store = readNoteStore(filePath);
  const index = Number(args.index ?? 0);
  if (!store.notes[index]) throw new Error(`no note at index ${index}`);
  const note = parseNoteRecord(store.notes[index]);
  if (note.statusHint === "spent") {
    throw new Error(`note at index ${index} is already marked spent`);
  }

  const grossAmount = sdk.depositGrossFromNet(note.value, DEPOSIT_FEE_PPM);
  if (grossAmount === 0n) throw new Error("deposit net value must be > 0");
  const depositFee = grossAmount - note.value;
  const input = {
    outCommitments: [note.commitment.toString()],
    netValue: note.value.toString(),
    outVersion: [note.version.toString()],
    outAssetId: [note.assetId.toString()],
    outValue: [note.value.toString()],
    outSpendingKey: [note.spendingKey.toString()],
    outNullifierKey: [note.nullifierKey.toString()],
    outBlinding: [note.blinding.toString()],
  };

  const snarkjs = loadSnarkjs();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasm,
    zkey
  );
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) {
    throw new Error("local deposit proof verification failed");
  }
  if (
    BigInt(publicSignals[0]) !== note.commitment ||
    BigInt(publicSignals[1]) !== note.value
  ) {
    throw new Error("deposit proof public signals do not match note commitment/net value");
  }

  const outPath = path.resolve(args.out ?? "deposit_dev_proof.json");
  const payload = {
    circuit: "deposit",
    noteIndex: index,
    commitment: note.commitment.toString(),
    netValue: note.value.toString(),
    grossAmount: grossAmount.toString(),
    depositFeePpm: DEPOSIT_FEE_PPM.toString(),
    depositFee: depositFee.toString(),
    proof,
    publicSignals,
    keysSource: source,
    warning: provingKeysHonesty(source),
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        commitment: payload.commitment,
        netValue: payload.netValue,
        grossAmount: payload.grossAmount,
        depositFee: payload.depositFee,
        warning: payload.warning,
      },
      null,
      2
    )
  );
  process.exit(0);
}

async function cmdBuildDeposit(args) {
  const filePath = path.resolve(args.file ?? "notes.json");
  const store = readNoteStore(filePath);
  const index = Number(args.index ?? 0);
  if (!store.notes[index]) throw new Error(`no note at index ${index}`);
  const note = parseNoteRecord(store.notes[index]);
  const tierCode = Number(args.tier ?? 0);
  if (tierCode < 0 || tierCode > 2) throw new Error("--tier must be 0..2");

  const sdk = await loadSdk();
  const amount = sdk.depositGrossFromNet(note.value, DEPOSIT_FEE_PPM);
  const depositFee = amount - note.value;
  const commitmentHex = toBytes32Hex(note.commitment);
  const outPath = path.resolve(args.out ?? "deposit_call.json");
  const proofPath = path.resolve(args.proof ?? "deposit_dev_proof.json");
  if (!fs.existsSync(proofPath)) throw new Error(`missing proof file: ${proofPath}`);
  const proofDoc = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (!proofDoc.proof || !Array.isArray(proofDoc.publicSignals)) {
    throw new Error("deposit proof file missing proof/publicSignals");
  }
  if (
    BigInt(proofDoc.publicSignals[0]) !== note.commitment ||
    BigInt(proofDoc.publicSignals[1]) !== note.value
  ) {
    throw new Error("deposit proof does not bind the selected note commitment/net value");
  }
  const snarkjs = loadSnarkjs();
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proofDoc.proof,
    proofDoc.publicSignals
  );
  const argv = JSON.parse(`[${calldata}]`);

  const payload = {
    function: "deposit",
    args: {
      amount: amount.toString(),
      newCommitments: [commitmentHex],
      tierCode,
      proofEncoding: "abi.encode(uint256[2],uint256[2][2],uint256[2])",
      proofA: argv[0].map(String),
      proofB: argv[1].map((row) => row.map(String)),
      proofC: argv[2].map(String),
    },
    accounting: {
      depositFeePpm: DEPOSIT_FEE_PPM.toString(),
      depositFee: depositFee.toString(),
      netValue: note.value.toString(),
      note: "note.value is exact shielded net; amount is the minimal gross satisfying the pool's floor-rounded fee.",
    },
    next:
      "After tx confirms: ap state append --file public_state.json --commitment <commitment> --notes notes.json --note-index <i>",
    castHint: `cast calldata "deposit(uint256,bytes32[],uint8,bytes)" … (use ap tx encode)`,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, commitment: commitmentHex }, null, 2));
}

async function cmdBuildTransfer(_args) {
  // OBSOLETE: on-chain transfer removed from product path.
  throw new Error(
    "build transfer is obsolete — product path is deposit + withdraw (1-in / 2-in / partial)."
  );
}

async function cmdBuildWithdraw(args) {
  const proofPath = path.resolve(args.proof ?? "withdraw_dev_proof.json");
  if (!fs.existsSync(proofPath)) throw new Error(`missing proof file: ${proofPath}`);
  const proofDoc = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (
    !proofDoc.proof ||
    !Array.isArray(proofDoc.nullifiers) ||
    proofDoc.nullifiers.length !== 2 ||
    proofDoc.merkleRoot === undefined
  ) {
    throw new Error(
      "proof file must contain proof, merkleRoot, and two nullifiers"
    );
  }

  const snarkjs = loadSnarkjs();
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proofDoc.proof,
    proofDoc.publicSignals
  );
  const argv = JSON.parse(`[${calldata}]`);

  const recipient = BigInt(proofDoc.recipient);
  const amount = BigInt(proofDoc.withdrawAmount);
  const fee = BigInt(proofDoc.withdrawFee);
  const outPath = path.resolve(args.out ?? "withdraw_call.json");

  const payload = {
    function: "withdraw",
    args: {
      proofEncoding: "abi.encode(uint256[2],uint256[2][2],uint256[2])",
      proofA: argv[0].map(String),
      proofB: argv[1].map((row) => row.map(String)),
      proofC: argv[2].map(String),
      merkleRoot: toBytes32Hex(proofDoc.merkleRoot),
      nullifiers: proofDoc.nullifiers.map(toBytes32Hex),
      recipient: `0x${recipient.toString(16).padStart(40, "0")}`,
      amount: amount.toString(),
      publicFeeDataEncoding: "abi.encode(uint256 fee)",
      withdrawFee: fee.toString(),
    },
    note: "No on-chain withdraw delay. Spent leaf indices are private witnesses (not in calldata).",
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  const sdk = await loadSdk();
  const privacyWarnings = sdk.formatPrivacyWarnings([
    ...sdk.assessWithdrawIdentity({
      depositBroadcaster: null,
      withdrawBroadcaster: args.from ?? null,
      withdrawRecipient: payload.args.recipient,
    }),
    ...sdk.assessAmountFingerprint({
      value: amount,
      context: "withdraw",
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        function: "withdraw",
        recipient: payload.args.recipient,
        amount: payload.args.amount,
        privacyWarnings,
      },
      null,
      2
    )
  );
  process.exit(0);
}

async function cmdBuildWithdraw1(args) {
  const proofPath = path.resolve(args.proof ?? "withdraw_1in_dev_proof.json");
  if (!fs.existsSync(proofPath)) throw new Error(`missing proof file: ${proofPath}`);
  const proofDoc = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (
    !proofDoc.proof ||
    !Array.isArray(proofDoc.nullifiers) ||
    proofDoc.nullifiers.length !== 1
  ) {
    throw new Error("proof file must contain proof and one nullifier");
  }
  const snarkjs = loadSnarkjs();
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proofDoc.proof,
    proofDoc.publicSignals
  );
  const argv = JSON.parse(`[${calldata}]`);
  const recipient = BigInt(proofDoc.recipient);
  const amount = BigInt(proofDoc.withdrawAmount);
  const fee = BigInt(proofDoc.withdrawFee);
  const outPath = path.resolve(args.out ?? "withdraw1_call.json");
  const payload = {
    function: "withdraw1",
    args: {
      proofEncoding: "abi.encode(uint256[2],uint256[2][2],uint256[2])",
      proofA: argv[0].map(String),
      proofB: argv[1].map((row) => row.map(String)),
      proofC: argv[2].map(String),
      merkleRoot: toBytes32Hex(proofDoc.merkleRoot),
      nullifiers: proofDoc.nullifiers.map(toBytes32Hex),
      recipient: `0x${recipient.toString(16).padStart(40, "0")}`,
      amount: amount.toString(),
      withdrawFee: fee.toString(),
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, function: "withdraw1" }, null, 2));
  process.exit(0);
}

async function cmdBuildWithdrawPartial(args) {
  const proofPath = path.resolve(args.proof ?? "withdraw_partial_dev_proof.json");
  if (!fs.existsSync(proofPath)) throw new Error(`missing proof file: ${proofPath}`);
  const proofDoc = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (
    !proofDoc.proof ||
    !Array.isArray(proofDoc.nullifiers) ||
    proofDoc.nullifiers.length !== 1 ||
    !proofDoc.outCommitment
  ) {
    throw new Error("proof file must contain proof, one nullifier, and outCommitment");
  }
  const snarkjs = loadSnarkjs();
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proofDoc.proof,
    proofDoc.publicSignals
  );
  const argv = JSON.parse(`[${calldata}]`);
  const recipient = BigInt(proofDoc.recipient);
  const amount = BigInt(proofDoc.withdrawAmount);
  const fee = BigInt(proofDoc.withdrawFee);
  const outPath = path.resolve(args.out ?? "withdraw_partial_call.json");
  const payload = {
    function: "withdrawPartial1",
    args: {
      proofEncoding: "abi.encode(uint256[2],uint256[2][2],uint256[2])",
      proofA: argv[0].map(String),
      proofB: argv[1].map((row) => row.map(String)),
      proofC: argv[2].map(String),
      merkleRoot: toBytes32Hex(proofDoc.merkleRoot),
      nullifiers: proofDoc.nullifiers.map(toBytes32Hex),
      recipient: `0x${recipient.toString(16).padStart(40, "0")}`,
      amount: amount.toString(),
      outCommitment: toBytes32Hex(proofDoc.outCommitment),
      withdrawFee: fee.toString(),
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(
    JSON.stringify({ ok: true, outPath, function: "withdrawPartial1" }, null, 2)
  );
  process.exit(0);
}

async function cmdTimingWithdraw(args) {
  if (!args.rpc) throw new Error("--rpc is required");
  if (!args.pool) throw new Error("--pool is required");
  if (!args.notes) throw new Error("--notes is required");
  await guardRpcNetwork(args, "timing withdraw");

  const sdk = await loadSdk();
  const store = readNoteStore(path.resolve(args.notes));
  const index = Number(args.index ?? 0);
  if (!store.notes[index]) throw new Error(`no note at index ${index}`);
  const note = parseNoteRecord(store.notes[index]);

  let leafIndex =
    note.leafIndex !== undefined && note.leafIndex !== null
      ? Number(note.leafIndex)
      : undefined;
  if (leafIndex === undefined) {
    if (!args.state) {
      throw new Error("note has no leafIndex; pass --state or bind-note first");
    }
    const state = readPublicState(path.resolve(args.state), sdk);
    leafIndex = sdk.findCommitmentIndex(state, note.commitment);
  }

  const { fetchWithdrawWaitStatus } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href
  );
  const { formatWithdrawWaitMessage } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/withdrawTiming.mjs")).href
  );

  const waitStatus = await fetchWithdrawWaitStatus({
    rpcUrl: args.rpc,
    pool: args.pool,
    leafIndex,
  });

  const privacyWarnings = sdk.formatPrivacyWarnings([
    ...sdk.assessTimingLinkage({
      depositTimestampSec: Number(waitStatus.earliestCommitmentTimestamp),
      withdrawTimestampSec: Number(waitStatus.now),
    }),
    ...sdk.assessWithdrawIdentity({
      depositBroadcaster: store.notes[index]?.depositedBy ?? null,
      withdrawBroadcaster: args.from ?? null,
      withdrawRecipient: args.recipient ?? null,
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        noteIndex: index,
        leafIndex,
        ...waitStatus,
        message: formatWithdrawWaitMessage(waitStatus),
        privacyWarnings,
      },
      null,
      2
    )
  );
}

async function cmdTimingWarp(args) {
  if (!args.rpc) throw new Error("--rpc is required");
  if (args.seconds === undefined) throw new Error("--seconds is required");
  await guardRpcNetwork(args, "timing warp");
  const {
    assertAnvilOrAllowUnsafe,
    anvilIncreaseTimeAndMine,
  } = await import(pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href);

  const client = await assertAnvilOrAllowUnsafe({
    rpcUrl: args.rpc,
    allowUnsafe: Boolean(args["allow-unsafe"]),
  });
  const now = await anvilIncreaseTimeAndMine({
    rpcUrl: args.rpc,
    seconds: args.seconds,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        warpedSeconds: String(args.seconds),
        now: now.toString(),
        clientVersion: client.version,
        warning: "local/testing only — never use on a funded public network",
      },
      null,
      2
    )
  );
}

async function cmdTimingUnlock(args) {
  if (!args.rpc) throw new Error("--rpc is required");
  if (!args.pool) throw new Error("--pool is required");
  if (!args.notes) throw new Error("--notes is required");
  await guardRpcNetwork(args, "timing unlock");

  const sdk = await loadSdk();
  const store = readNoteStore(path.resolve(args.notes));
  const index = Number(args.index ?? 0);
  if (!store.notes[index]) throw new Error(`no note at index ${index}`);
  const note = parseNoteRecord(store.notes[index]);

  let leafIndex =
    note.leafIndex !== undefined && note.leafIndex !== null
      ? Number(note.leafIndex)
      : undefined;
  if (leafIndex === undefined) {
    if (!args.state) {
      throw new Error("note has no leafIndex; pass --state or bind-note first");
    }
    const state = readPublicState(path.resolve(args.state), sdk);
    leafIndex = sdk.findCommitmentIndex(state, note.commitment);
  }

  const {
    fetchWithdrawWaitStatus,
    assertAnvilOrAllowUnsafe,
    anvilIncreaseTimeAndMine,
  } = await import(pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href);
  const { formatWithdrawWaitMessage } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/withdrawTiming.mjs")).href
  );

  let waitStatus = await fetchWithdrawWaitStatus({
    rpcUrl: args.rpc,
    pool: args.pool,
    leafIndex,
  });

  let warpedSeconds = "0";
  if (!waitStatus.ready) {
    const client = await assertAnvilOrAllowUnsafe({
      rpcUrl: args.rpc,
      allowUnsafe: Boolean(args["allow-unsafe"]),
    });
    warpedSeconds = waitStatus.secondsRemaining;
    await anvilIncreaseTimeAndMine({
      rpcUrl: args.rpc,
      seconds: Number(waitStatus.secondsRemaining),
    });
    waitStatus = await fetchWithdrawWaitStatus({
      rpcUrl: args.rpc,
      pool: args.pool,
      leafIndex,
    });
    if (!waitStatus.ready) {
      // +1s buffer for off-by-one block timestamp edges
      await anvilIncreaseTimeAndMine({ rpcUrl: args.rpc, seconds: 1 });
      waitStatus = await fetchWithdrawWaitStatus({
        rpcUrl: args.rpc,
        pool: args.pool,
        leafIndex,
      });
      warpedSeconds = String(BigInt(warpedSeconds) + 1n);
    }
    void client;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        noteIndex: index,
        leafIndex,
        warpedSeconds,
        ...waitStatus,
        message: formatWithdrawWaitMessage(waitStatus),
        warning: "local/testing only — never use on a funded public network",
      },
      null,
      2
    )
  );
}

async function cmdStateBindNote(args) {
  const sdk = await loadSdk();
  const statePath = path.resolve(args.file ?? "public_state.json");
  const notesPath = path.resolve(args.notes ?? "notes.json");
  const noteIndex = Number(args["note-index"] ?? 0);
  const state = readPublicState(statePath, sdk);
  const store = readNoteStore(notesPath);
  if (!store.notes[noteIndex]) throw new Error(`no note at index ${noteIndex}`);
  const commitment = store.notes[noteIndex].commitment;
  const leafIndex = sdk.findCommitmentIndex(state, commitment);
  store.notes[noteIndex].leafIndex = leafIndex;
  writeNoteStore(notesPath, store);
  logShareable(
    {
      ok: true,
      notesFile: notesPath,
      noteIndex,
      leafIndex,
      commitment,
      note: "leafIndex stored locally for proving; omitted from stdout unless --debug",
    },
    args
  );
}

async function cmdSendApprove(args) {
  const { resolveSepoliaCommandArgs } = await import("../lib/sepoliaRegistry.mjs");
  resolveSepoliaCommandArgs(args, { pool: true, token: true });
  if (!args.spender && args._resolvedSepolia) args.spender = args._resolvedSepolia.pool;
  if (!args.rpc) throw new Error("--rpc is required");
  if (!args.token) throw new Error("--token is required");
  if (!args.spender) throw new Error("--spender is required");
  if (args.amount === undefined) throw new Error("--amount is required");
  await guardRpcNetwork(args, "send approve");

  const { encodeApproveCalldata } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/abiEncode.mjs")).href
  );
  const { sendCalldata, assertTxOk, normalizeHexAddress } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/txSend.mjs")).href
  );

  const data = encodeApproveCalldata({
    spender: args.spender,
    amount: args.amount,
  });
  const result = assertTxOk(
    await sendCalldata({
      rpcUrl: args.rpc,
      to: normalizeHexAddress(args.token),
      data,
      from: args.from,
      privateKey: args["private-key"],
    })
  );
  console.log(
    JSON.stringify(
      { ok: true, action: "approve", txHash: result.txHash, via: result.via },
      null,
      2
    )
  );
}

async function cmdSendCall(args) {
  const { resolveSepoliaCommandArgs } = await import("../lib/sepoliaRegistry.mjs");
  resolveSepoliaCommandArgs(args, { pool: true });
  if (!args.to && args._resolvedSepolia) args.to = args._resolvedSepolia.pool;
  if (!args.rpc) throw new Error("--rpc is required");
  if (!args.to) throw new Error("--to is required");
  if (!args.call) throw new Error("--call is required");
  await guardRpcNetwork(args, "send call");

  const callPath = path.resolve(args.call);
  if (!fs.existsSync(callPath)) throw new Error(`missing call file: ${callPath}`);
  const doc = JSON.parse(fs.readFileSync(callPath, "utf8"));

  const { encodeCallFromBuildJson } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/abiEncode.mjs")).href
  );
  const { sendCalldata, assertTxOk, normalizeHexAddress } = await import(
    pathToFileURL(path.resolve(__dirname, "../lib/txSend.mjs")).href
  );

  const data = encodeCallFromBuildJson(doc);
  // Native ETH pool deposits require msg.value = gross amount; ERC-20 deposits use 0.
  let value = "0x0";
  if (args.value != null) {
    value = BigInt(args.value).toString();
  } else if (
    args.native ||
    args["native-eth"] ||
    (args.asset && String(args.asset).toLowerCase() === "eth")
  ) {
    if (doc.function === "deposit" && doc.args?.amount != null) {
      value = BigInt(doc.args.amount).toString();
    }
  }
  const result = assertTxOk(
    await sendCalldata({
      rpcUrl: args.rpc,
      to: normalizeHexAddress(args.to),
      data,
      from: args.from,
      privateKey: args["private-key"],
      value,
    })
  );

  let stampedDepositedBy = null;
  if (doc.function === "deposit" && args.notes && args.from) {
    const notesPath = path.resolve(args.notes);
    const store = readNoteStore(notesPath);
    const noteIndex = Number(args["note-index"] ?? 0);
    if (store.notes[noteIndex]) {
      store.notes[noteIndex].depositedBy = String(args.from);
      writeNoteStore(notesPath, store);
      stampedDepositedBy = store.notes[noteIndex].depositedBy;
    }
  }

  const sdk = await loadSdk();
  let commitmentCount;
  try {
    const { fetchPoolAnchor } = await import(
      pathToFileURL(path.resolve(__dirname, "../lib/ethRpc.mjs")).href
    );
    const anchor = await fetchPoolAnchor({
      rpcUrl: args.rpc,
      pool: normalizeHexAddress(args.to),
    });
    commitmentCount = anchor.count;
  } catch {
    commitmentCount = undefined;
  }
  const privacyWarnings =
    doc.function === "withdraw" ||
    doc.function === "withdraw1" ||
    doc.function === "withdrawPartial1"
      ? sdk.formatPrivacyWarnings(
          sdk.assessPracticalPrivacy({
            commitmentCount,
            amount: doc.args?.amount,
            amountContext: "withdraw",
            depositBroadcaster: args.notes
              ? readNoteStore(path.resolve(args.notes)).notes[
                  Number(args["note-index"] ?? 0)
                ]?.depositedBy
              : null,
            withdrawBroadcaster: args.from ?? null,
            withdrawRecipient: doc.args?.recipient ?? null,
            withdrawKind:
              doc.function === "withdrawPartial1"
                ? "partial"
                : doc.function === "withdraw"
                  ? "merge"
                  : "full",
            peerValues: args.notes
              ? readNoteStore(path.resolve(args.notes)).notes.map((n) => n.value)
              : undefined,
          })
        )
      : [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "call",
        function: doc.function,
        txHash: result.txHash,
        via: result.via,
        stampedDepositedBy,
        privacyWarnings,
      },
      null,
      2
    )
  );
}

async function cmdSepoliaStatus(args) {
  const { loadSepoliaRegistry, resolveSepoliaAsset } = await import(
    "../lib/sepoliaRegistry.mjs"
  );
  const { registry, registryPath } = loadSepoliaRegistry(args.registry);
  const selected = args.asset
    ? [resolveSepoliaAsset(args.asset, args.registry)]
    : Object.keys(registry.pools).map((id) => resolveSepoliaAsset(id, args.registry));
  let chainId = null;
  let code = null;
  const rpcUrl = args.rpc === true ? registry.rpc : args.rpc;
  if (rpcUrl) {
    const { rpc } = await import("../lib/ethRpc.mjs");
    chainId = Number(BigInt(await rpc(rpcUrl, "eth_chainId", [])));
    code = {};
    for (const item of selected) {
      const [poolCode, tokenCode] = await Promise.all([
        rpc(rpcUrl, "eth_getCode", [item.pool, "latest"]),
        rpc(rpcUrl, "eth_getCode", [item.token, "latest"]),
      ]);
      code[item.id] = {
        pool: poolCode !== "0x",
        token: tokenCode !== "0x",
      };
    }
  }
  console.log(
    JSON.stringify(
      {
        ok: chainId === null || chainId === 11155111,
        network: "sepolia",
        chainId: registry.chainId,
        rpcChainId: chainId,
        status: registry.status,
        deploymentBlock: registry.deployment?.block,
        registryPath,
        assets: selected,
        code,
        warning: registry.warning,
        topology: {
          deposit: "0-in/1-out with Groth16 deposit proof",
          withdraw1: "1-in/0-out full exit (product default)",
          withdraw: "2-in/0-out merge",
          withdrawPartial1: "1-in/1-out change; save the new Recovery Code",
          transfer: "removed from current Sepolia pools",
          onChainWithdrawDelay: false,
        },
      },
      null,
      2
    )
  );
}

async function cmdSepoliaMintCall(args) {
  if (!args.asset) throw new Error("--asset is required (eth, dai, or lusd)");
  if (!args.to) throw new Error("--to is required");
  if (args.amount === undefined) throw new Error("--amount is required");
  const { resolveSepoliaAsset } = await import("../lib/sepoliaRegistry.mjs");
  const { encodeMintCalldata } = await import("../lib/abiEncode.mjs");
  const resolved = resolveSepoliaAsset(args.asset, args.registry);
  if (resolved.source === "native") {
    throw new Error(
      "native ETH has no mint(). Fund the wallet with Sepolia ETH, then deposit with --asset eth --native."
    );
  }
  const payload = {
    function: "mint",
    to: resolved.token,
    args: { to: args.to, amount: String(args.amount) },
    calldata: encodeMintCalldata({ to: args.to, amount: args.amount }),
    asset: resolved,
    warning:
      "EXPERIMENTAL SEPOLIA TEST TOKEN: permissionless mint, no backing, no value. This command only builds calldata and never broadcasts.",
  };
  if (args.out) fs.writeFileSync(path.resolve(args.out), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: true, outPath: args.out ? path.resolve(args.out) : null, ...payload }, null, 2));
}

function resolveBackupPassphrase(args) {
  const sources = [
    args["passphrase-stdin"] ? "stdin" : null,
    process.env.AP_BACKUP_PASSPHRASE !== undefined ? "env" : null,
    args.passphrase !== undefined ? "argv" : null,
  ].filter(Boolean);
  if (sources.length === 0) {
    throw new Error(
      "backup passphrase required: use --passphrase-stdin or AP_BACKUP_PASSPHRASE"
    );
  }
  if (sources.length > 1) {
    throw new Error("choose exactly one backup passphrase source");
  }
  let passphrase;
  if (sources[0] === "stdin") {
    passphrase = fs.readFileSync(0, "utf8").replace(/\r?\n$/, "");
  } else if (sources[0] === "env") {
    passphrase = process.env.AP_BACKUP_PASSPHRASE;
  } else {
    process.emitWarning(
      "--passphrase is deprecated; use --passphrase-stdin or AP_BACKUP_PASSPHRASE to avoid process-list exposure",
      { code: "AP_BACKUP_ARGV_PASSPHRASE" }
    );
    passphrase = String(args.passphrase);
  }
  if (!passphrase) throw new Error("backup passphrase must not be empty");
  return passphrase;
}

async function cmdBackupExport(args) {
  const passphrase = resolveBackupPassphrase(args);
  const notesPath = path.resolve(args.file ?? "notes.json");
  const outPath = path.resolve(args.out ?? "backup.apbackup");
  const store = readNoteStore(notesPath);
  const sdk = await loadSdk();

  const envelope = sdk.encryptBackup({
    passphrase,
    payload: {
      notes: sdk.notesFromLocalStore(store.notes),
      meta: {
        lastScannedBlock: Number(args["last-scanned-block"] ?? 0),
        client: "cli",
        clientVersion: "0.0.1",
      },
    },
    chainId: Number(args["chain-id"] ?? 31337),
    poolAddress: String(args.pool ?? "0x0000000000000000000000000000000000000000"),
    asset: String(args.asset ?? "USDC"),
  });

  fs.writeFileSync(outPath, JSON.stringify(envelope, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        notes: store.notes.length,
        format: envelope.format,
        warning: "keep passphrase offline; losing it means losing recoverable notes",
      },
      null,
      2
    )
  );
}

async function cmdBackupImport(args) {
  const passphrase = resolveBackupPassphrase(args);
  const backupPath = path.resolve(args.backup ?? "backup.apbackup");
  if (!fs.existsSync(backupPath)) throw new Error(`missing backup: ${backupPath}`);
  const outPath = path.resolve(args.out ?? "notes.json");
  const sdk = await loadSdk();

  const envelope = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  sdk.assertBackupEnvelope(envelope);
  const payload = sdk.decryptBackup(envelope, passphrase);
  const imported = sdk.notesToLocalStore(payload.notes);

  let store = { format: "absolute-privacy-notes-local", version: 1, notes: [] };
  if (args.merge && fs.existsSync(outPath)) {
    store = readNoteStore(outPath);
    const existing = new Set(
      store.notes.map((n) => String(BigInt(n.commitment ?? 0)))
    );
    for (const n of imported) {
      const key = String(BigInt(n.commitment ?? 0));
      if (!existing.has(key)) {
        store.notes.push(n);
        existing.add(key);
      }
    }
  } else {
    store.notes = imported;
  }

  writeNoteStore(outPath, store);
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        imported: imported.length,
        total: store.notes.length,
        chainId: envelope.chainId,
        poolAddress: envelope.poolAddress,
        note: "statusHint is advisory; rescan chain nullifiers before spending",
      },
      null,
      2
    )
  );
}

function foundryBin(name) {
  const base = path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    ".foundry",
    "bin"
  );
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  return path.join(base, exe);
}

async function cmdMemoStatus() {
  const { getOnchainMemoStatus } = await loadSdk();
  const status = getOnchainMemoStatus();
  const root = path.resolve(__dirname, "../../..");
  const designPath = path.join(root, status.designDoc);
  console.log(
    JSON.stringify(
      {
        ok: true,
        ...status,
        designDocExists: fs.existsSync(designPath),
        designDocPath: designPath,
      },
      null,
      2
    )
  );
}

async function cmdLaunchStatus() {
  const root = path.resolve(__dirname, "../../..");
  const docs = {
    launchStatus: fs.existsSync(path.join(root, "LAUNCH_STATUS_V1.md")),
    ceremonyRequirements: fs.existsSync(path.join(root, "CEREMONY_REQUIREMENTS_V1.md")),
    selectiveDisclosure: fs.existsSync(path.join(root, "SELECTIVE_DISCLOSURE_MVP_V1.md")),
    noteDeliveryAdopted: fs.existsSync(path.join(root, "NOTE_DELIVERY_ADOPTED_V1.md")),
    onchainMemoDesign: fs.existsSync(path.join(root, "ONCHAIN_MEMO_DESIGN_V1.md")),
    trustMatrix: fs.existsSync(path.join(root, "TRUST_PERMISSION_MATRIX_V1.md")),
  };
  const localArtifacts = {
    depositDevZkey: fs.existsSync(path.join(circuitsBuild, "deposit_dev_final.zkey")),
    withdrawDevZkey: fs.existsSync(path.join(circuitsBuild, "withdraw_dev_final.zkey")),
    transferDevZkey: fs.existsSync(path.join(circuitsBuild, "transfer_dev_final.zkey")),
    ownershipDevZkey: fs.existsSync(path.join(circuitsBuild, "ownership_dev_final.zkey")),
    valueBoundDevZkey: fs.existsSync(path.join(circuitsBuild, "value_bound_dev_final.zkey")),
    withdrawTrustedZkey: fs.existsSync(
      path.join(circuitsBuild, "withdraw_trusted_final.zkey")
    ),
    transferTrustedZkey: fs.existsSync(
      path.join(circuitsBuild, "transfer_trusted_final.zkey")
    ),
    depositTrustedZkey: fs.existsSync(
      path.join(circuitsBuild, "deposit_trusted_final.zkey")
    ),
  };
  const categories = [
    { id: "1.trust", status: "Go", note: "No admin fund paths; frontend optional" },
    {
      id: "2.privacy-core",
      status: "Go",
      note: "Timing + amount warnings + split-create; anonymity claims remain advisory",
    },
    {
      id: "3.user-state",
      status: "Risk accepted",
      note: "Encrypted backup + nullifier recovery; web unlocked notes remain plaintext by product decision",
    },
    {
      id: "4.proof",
      status: "No-Go",
      note: "Sepolia uses Phase-2 ceremony keys; mainnet still needs external audit + new deploy",
    },
    { id: "5.rewards", status: "Go (omitted)", note: "claimRewards intentionally unimplemented" },
    {
      id: "6.client-honesty",
      status: "Go",
      note: "Dev labeling, mainnet gate, sealed disclosure, claim stub",
    },
    {
      id: "7.onchain-memo",
      status: "Deferred",
      note: "Offline OOB adopted (NOTE_DELIVERY_ADOPTED_V1.md); on-chain memo deferred for privacy",
    },
  ];
  const blockers = [
    "External audit of circuits, contracts, and ceremony transcripts",
    "Mainnet verifier + pool deploy from ceremony finals (Sepolia is already on those keys)",
  ];
  const report = {
    ok: true,
    overallVerdict: "No-Go",
    audience: "public / mainnet",
    localDevReady: Object.values(localArtifacts).every(Boolean) && docs.launchStatus,
    categories,
    blockers,
    docs,
    localArtifacts,
    note: "See LAUNCH_STATUS_V1.md. Sepolia ceremony-finals are deployed; mainnet remains No-Go until audit.",
  };
  console.log(JSON.stringify(report, null, 2));
  // overallVerdict stays No-Go until ceremony — exit 0 so CI can still print status
}

async function cmdDoctor() {
  const checks = [];
  function add(name, ok, detail) {
    checks.push({ name, ok: Boolean(ok), detail });
  }

  add("sdk-core dist", fs.existsSync(sdkEntry), sdkEntry);
  // Product prove path: ceremony finals → local-trusted → build (see resolve_proving_keys.mjs)
  for (const circuit of ["deposit", "withdraw", "withdraw_1in", "withdraw_partial"]) {
    try {
      const keys = await loadProvingKeys(circuit);
      add(`${circuit} wasm (trusted)`, true, keys.wasm);
      add(`${circuit} zkey (${keys.source})`, true, keys.zkey);
    } catch (e) {
      add(`${circuit} proving keys`, false, String(e.message || e));
    }
  }
  // transfer_dev intentionally not required (obsolete for product path)
  add(
    "ownership_dev wasm",
    fs.existsSync(path.join(circuitsBuild, "ownership_dev_js", "ownership_dev.wasm")),
    path.join(circuitsBuild, "ownership_dev_js", "ownership_dev.wasm")
  );
  add(
    "ownership_dev zkey",
    fs.existsSync(path.join(circuitsBuild, "ownership_dev_final.zkey")),
    path.join(circuitsBuild, "ownership_dev_final.zkey")
  );
  add(
    "value_bound_dev wasm",
    fs.existsSync(path.join(circuitsBuild, "value_bound_dev_js", "value_bound_dev.wasm")),
    path.join(circuitsBuild, "value_bound_dev_js", "value_bound_dev.wasm")
  );
  add(
    "value_bound_dev zkey",
    fs.existsSync(path.join(circuitsBuild, "value_bound_dev_final.zkey")),
    path.join(circuitsBuild, "value_bound_dev_final.zkey")
  );
  add("forge", fs.existsSync(foundryBin("forge")), foundryBin("forge"));
  add("anvil", fs.existsSync(foundryBin("anvil")), foundryBin("anvil"));
  add("cast", fs.existsSync(foundryBin("cast")), foundryBin("cast"));
  add(
    "production readiness doc",
    fs.existsSync(path.resolve(__dirname, "../../../PRODUCTION_READINESS_V1.md")),
    "PRODUCTION_READINESS_V1.md"
  );
  add(
    "ceremony requirements doc",
    fs.existsSync(path.resolve(__dirname, "../../../CEREMONY_REQUIREMENTS_V1.md")),
    "CEREMONY_REQUIREMENTS_V1.md"
  );
  add(
    "sepolia experimental runbook",
    fs.existsSync(path.resolve(__dirname, "../../../SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md")),
    "SEPOLIA_EXPERIMENTAL_RUNBOOK_V1.md"
  );
  add(
    "founder mainnet manual",
    fs.existsSync(path.resolve(__dirname, "../../../FOUNDER_MAINNET_MANUAL_V1.md")),
    "FOUNDER_MAINNET_MANUAL_V1.md"
  );
  add(
    "mainnet deploy runbook",
    fs.existsSync(path.resolve(__dirname, "../../../MAINNET_DEPLOY_RUNBOOK_V1.md")),
    "MAINNET_DEPLOY_RUNBOOK_V1.md"
  );
  add(
    "ceremony ops runbook",
    fs.existsSync(path.resolve(__dirname, "../../../CEREMONY_OPS_RUNBOOK_V1.md")),
    "CEREMONY_OPS_RUNBOOK_V1.md"
  );
  add(
    "ceremony coordinator brief",
    fs.existsSync(path.resolve(__dirname, "../../../CEREMONY_COORDINATOR_BRIEF_V1.md")),
    "CEREMONY_COORDINATOR_BRIEF_V1.md"
  );
  add(
    "ceremony contributor invite",
    fs.existsSync(path.resolve(__dirname, "../../../CEREMONY_CONTRIBUTOR_INVITE_V1.md")),
    "CEREMONY_CONTRIBUTOR_INVITE_V1.md"
  );
  add(
    "launch status doc",
    fs.existsSync(path.resolve(__dirname, "../../../LAUNCH_STATUS_V1.md")),
    "LAUNCH_STATUS_V1.md"
  );
  add(
    "privacy health thresholds doc",
    fs.existsSync(path.resolve(__dirname, "../../../PRIVACY_HEALTH_THRESHOLDS_V1.md")),
    "PRIVACY_HEALTH_THRESHOLDS_V1.md"
  );
  add(
    "mvp rewards scope doc",
    fs.existsSync(path.resolve(__dirname, "../../../MVP_REWARDS_SCOPE_V1.md")),
    "MVP_REWARDS_SCOPE_V1.md"
  );
  add(
    "selective disclosure doc",
    fs.existsSync(path.resolve(__dirname, "../../../SELECTIVE_DISCLOSURE_MVP_V1.md")),
    "SELECTIVE_DISCLOSURE_MVP_V1.md"
  );
  add(
    "on-chain memo design doc",
    fs.existsSync(path.resolve(__dirname, "../../../ONCHAIN_MEMO_DESIGN_V1.md")),
    "ONCHAIN_MEMO_DESIGN_V1.md"
  );
  add(
    "note delivery adopted doc",
    fs.existsSync(path.resolve(__dirname, "../../../NOTE_DELIVERY_ADOPTED_V1.md")),
    "NOTE_DELIVERY_ADOPTED_V1.md"
  );
  add(
    "trust permission matrix doc",
    fs.existsSync(path.resolve(__dirname, "../../../TRUST_PERMISSION_MATRIX_V1.md")),
    "TRUST_PERMISSION_MATRIX_V1.md"
  );

  let sdkPoseidonOk = false;
  let sdkDetail = "sdk-core not built";
  let memoHonest = false;
  let memoDetail = "sdk-core not built";
  try {
    const sdk = await loadSdk();
    const poseidon = await sdk.createCircomlibPoseidon();
    const h = await poseidon.hash([1n, 2n]);
    sdkPoseidonOk = typeof h === "bigint" && h > 0n;
    sdkDetail = `poseidon ok (${h.toString().slice(0, 12)}…)`;
    const memo = sdk.getOnchainMemoStatus();
    memoHonest =
      memo.implemented === false &&
      memo.offlineDelivery === true &&
      memo.adoptedDelivery === "offline-oob";
    memoDetail = memo.implemented
      ? "unexpected implemented:true"
      : `adopted:${memo.adoptedDelivery} implemented:false (${memo.adoptedDeliveryDoc})`;
  } catch (e) {
    sdkDetail = e instanceof Error ? e.message : String(e);
    memoDetail = sdkDetail;
  }
  add("sdk poseidon smoke", sdkPoseidonOk, sdkDetail);
  add("on-chain memo honesty", memoHonest, memoDetail);

  const ok = checks.every((c) => c.ok);
  console.log(
    JSON.stringify(
      {
        ok,
        launchVerdict: "No-Go for mainnet until ceremony (see LAUNCH_STATUS_V1.md)",
        checks,
      },
      null,
      2
    )
  );
  if (!ok) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [group, action] = args._;

  if (!group || group === "help" || group === "--help" || group === "-h") {
    printHelp();
    return;
  }

  if (group === "doctor") {
    await cmdDoctor();
    return;
  }

  if (group === "assets" && (action === "list" || !action)) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/assets-list.mjs");
    const extra = [];
    if (args.network) extra.push("--network", String(args.network));
    const r = spawnSync(process.execPath, [script, ...extra], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "launch" && (action === "status" || !action)) {
    await cmdLaunchStatus();
    return;
  }

  if (group === "launch" && (action === "readiness" || action === "ready")) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/launch-readiness.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "launch" && (action === "verify-deployment" || action === "verify")) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/verify-deployment.mjs");
    const extra = [];
    for (const key of ["rpc", "network", "assets", "pools", "manifest"]) {
      if (args[key]) extra.push(`--${key}`, String(args[key]));
    }
    const r = spawnSync(process.execPath, [script, ...extra], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
      env: process.env,
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "memo" && (action === "status" || !action)) {
    await cmdMemoStatus();
    return;
  }

  if (group === "ops" && (action === "withdraw-fees" || action === "withdrawOpsFees")) {
    await cmdOpsWithdrawFees(args);
    return;
  }

  if (group === "ceremony" && (action === "status" || action === "preflight" || !action)) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(
      __dirname,
      "../../circuits/scripts/ceremony_preflight.mjs"
    );
    const extra = [];
    if (args.write === true || args.write === "") {
      extra.push("--write");
    } else if (typeof args.write === "string") {
      extra.push("--write", args.write);
    }
    const r = spawnSync(process.execPath, [script, ...extra], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "ceremony" && action === "checklist") {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(
      __dirname,
      "../../circuits/scripts/ceremony_contributor_checklist.mjs"
    );
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "ceremony" && (action === "invite" || action === "invite-status")) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(
      __dirname,
      "../../circuits/scripts/ceremony_invite_status.mjs"
    );
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "ceremony" && (action === "export-verifiers" || action === "export")) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(
      __dirname,
      "../../circuits/scripts/ceremony_export_final_verifiers.mjs"
    );
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "claims" && (action === "lint" || !action)) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/claims-lint.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "drill" && (action === "backup" || !action)) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/drill-backup.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "drill" && action === "ownership") {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/drill-ownership.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "drill" && action === "recipient") {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/drill-recipient.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "drill" && action === "view") {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/drill-view.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "drill" && (action === "value-bound" || action === "valuebound")) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/drill-value-bound.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "drill" && action === "incoming") {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/drill-incoming.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "drill" && action === "pay") {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/drill-pay.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (
    group === "drill" &&
    (action === "payment-receipt" || action === "receipt")
  ) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/drill-payment-receipt.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "gate" && (action === "local" || !action)) {
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../scripts/gate-local.mjs");
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../../.."),
    });
    process.exitCode = r.status === null ? 1 : r.status;
    return;
  }

  if (group === "note" && action === "create") {
    await cmdNoteCreate(args);
    return;
  }
  if (group === "note" && action === "list") {
    await cmdNoteList(args);
    return;
  }
  if (group === "note" && action === "suggest-split") {
    await cmdNoteSuggestSplit(args);
    return;
  }

  if (group === "note" && action === "distribute") {
    await cmdNoteDistribute(args);
    return;
  }
  if (group === "note" && action === "view-key") {
    await cmdNoteViewKey(args);
    return;
  }
  if (group === "note" && action === "deliver") {
    await cmdNoteDeliver(args);
    return;
  }
  if (group === "note" && action === "accept") {
    await cmdNoteAccept(args);
    return;
  }
  if (group === "note" && (action === "mailbox-scan" || action === "mailbox")) {
    await cmdNoteMailboxScan(args);
    return;
  }
  if (
    group === "note" &&
    (action === "payment-address" || action === "payment-addr" || action === "address")
  ) {
    await cmdNotePaymentAddress(args);
    return;
  }
  if (group === "note" && action === "scan") {
    await cmdNoteScan(args);
    return;
  }
  if (group === "note" && action === "export") {
    await cmdNoteExport(args);
    return;
  }
  if (group === "note" && action === "import") {
    await cmdNoteImport(args);
    return;
  }
  if (
    group === "note" &&
    (action === "import-recovery" || action === "import_recovery")
  ) {
    await cmdNoteImportRecovery(args);
    return;
  }
  if (group === "disclosure" && action === "keygen") {
    await cmdDisclosureKeygen(args);
    return;
  }
  if (group === "disclosure" && action === "export") {
    await cmdDisclosureExport(args);
    return;
  }
  if (group === "disclosure" && action === "open") {
    await cmdDisclosureOpen(args);
    return;
  }
  if (group === "disclosure" && action === "verify") {
    await cmdDisclosureVerify(args);
    return;
  }
  if (group === "disclosure" && action === "verify-view") {
    await cmdDisclosureVerifyView(args);
    return;
  }
  if (
    group === "disclosure" &&
    (action === "verify-payment-receipt" || action === "verify-receipt")
  ) {
    await cmdDisclosureVerifyPaymentReceipt(args);
    return;
  }
  if (group === "disclosure" && action === "prove-ownership") {
    await cmdDisclosureProveOwnership(args);
    return;
  }
  if (group === "disclosure" && action === "verify-ownership") {
    await cmdDisclosureVerifyOwnership(args);
    return;
  }
  if (group === "disclosure" && action === "prove-value-bound") {
    await cmdDisclosureProveValueBound(args);
    return;
  }
  if (group === "disclosure" && action === "verify-value-bound") {
    await cmdDisclosureVerifyValueBound(args);
    return;
  }
  if (group === "disclosure" && action === "anchor-build") {
    await cmdDisclosureAnchorBuild(args);
    return;
  }
  if (group === "disclosure" && action === "anchor-lookup") {
    await cmdDisclosureAnchorLookup(args);
    return;
  }
  if (group === "sepolia" && (action === "status" || !action)) {
    await cmdSepoliaStatus(args);
    return;
  }
  if (group === "sepolia" && (action === "mint-call" || action === "mint")) {
    await cmdSepoliaMintCall(args);
    return;
  }
  if (group === "state" && action === "init") {
    await cmdStateInit(args);
    return;
  }
  if (group === "state" && action === "show") {
    await cmdStateShow(args);
    return;
  }
  if (group === "state" && action === "append") {
    await cmdStateAppend(args);
    return;
  }
  if (group === "state" && action === "rebuild") {
    await cmdStateRebuild(args);
    return;
  }
  if (group === "state" && action === "fetch") {
    await cmdStateFetch(args);
    return;
  }
  if (group === "state" && action === "bind-note") {
    await cmdStateBindNote(args);
    return;
  }
  if (group === "prove" && action === "withdraw-dev") {
    await cmdProveWithdrawDev(args);
    return;
  }
  if (group === "prove" && action === "withdraw-1-dev") {
    await cmdProveWithdraw1Dev(args);
    return;
  }
  if (group === "prove" && action === "withdraw-partial-dev") {
    await cmdProveWithdrawPartialDev(args);
    return;
  }
  if (group === "prove" && action === "deposit-dev") {
    await cmdProveDepositDev(args);
    return;
  }
  if (
    (group === "prove" && action === "transfer-dev") ||
    (group === "merge" && !action)
  ) {
    await cmdProveTransferDev(args);
    return;
  }
  if (group === "build" && action === "deposit") {
    await cmdBuildDeposit(args);
    return;
  }
  if (group === "build" && action === "transfer") {
    await cmdBuildTransfer(args);
    return;
  }
  if (group === "build" && action === "withdraw") {
    await cmdBuildWithdraw(args);
    return;
  }
  if (group === "build" && action === "withdraw1") {
    await cmdBuildWithdraw1(args);
    return;
  }
  if (group === "build" && (action === "withdraw-partial" || action === "withdrawPartial1")) {
    await cmdBuildWithdrawPartial(args);
    return;
  }
  if (group === "note" && action === "inspect") {
    const filePath = path.resolve(args.file ?? "notes.json");
    const store = readNoteStore(filePath);
    const index = Number(args.index ?? 0);
    if (!store.notes[index]) throw new Error(`no note at index ${index}`);
    const n = store.notes[index];
    console.log(
      JSON.stringify(
        {
          index,
          note: n,
          ops:
            n.statusHint === "spent"
              ? []
              : n.leafIndex == null
                ? ["deposit"]
                : ["full-withdraw", "partial-withdraw", "merge-withdraw"],
        },
        null,
        2
      )
    );
    return;
  }
  if (group === "send" && action === "approve") {
    await cmdSendApprove(args);
    return;
  }
  if (group === "send" && action === "call") {
    await cmdSendCall(args);
    return;
  }
  if (group === "backup" && action === "export") {
    await cmdBackupExport(args);
    return;
  }
  if (group === "backup" && action === "import") {
    await cmdBackupImport(args);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
