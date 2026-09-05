import { useEffect, useMemo, useRef, useState } from "react";
import {
  assertBackupEnvelope,
  assertExperimentalNetworkAllowed,
  assessAmountFingerprint,
  assessDepositBurst,
  buildOwnershipClaimStub,
  buildOwnershipDisclosure,
  createCircomlibPoseidon,
  createNote,
  depositGrossFromNet,
  DEPOSIT_FEE_PPM,
  createNotesFromSuggestedSplit,
  createNotesFromCustomDistribution,
  decryptBackup,
  encryptBackup,
  notesFromLocalStore,
  notesToLocalStore,
  poolHealthTier,
  poolHealthWarning,
  assessPracticalPrivacy,
  sealOwnershipDisclosure,
  sealOwnershipDisclosureToRecipient,
  generateDisclosureRecipientKeypair,
  exportDisclosureRecipientPublic,
  paymentAddressFromKeypair,
  createOwnershipViewPackageFromNote,
  buildViewKeyExport,
  createPaymentReceiptFromNote,
  buildIncomingNotePackageFromNote,
  sealIncomingNoteToRecipient,
  unsealIncomingNoteWithRecipientKey,
  verifyIncomingNotePlaintext,
  incomingNoteToLocalRecord,
  scanIncomingMailbox,
  assertDisclosureRecipientKeypair,
  type BackupEnvelope,
  type PrivacyWarning,
} from "@absolute-privacy/sdk-core";
import {
  encodeApproveCalldata,
  encodeBalanceOfCalldata,
  encodeDepositCalldata,
  encodeIsKnownRootCalldata,
  encodeMintCalldata,
  encodeWithdrawCalldata,
  encodeWithdraw1Calldata,
  encodeWithdrawPartial1Calldata,
  SELECTOR_POOL_ASSET,
} from "./abi";
import {
  bindNotesToPublicState,
  fetchSyncedPoolState,
  noteBoundToPool,
} from "./poolState";
import { scanNullifiersAgainstPool } from "./scanNullifiers";
import { estimateSilentExtraFee, hasSilentRelayerTip } from "./fees";
import {
  proveWithdrawDev,
  recipientHex,
  withdrawNullifierHexes,
  type WithdrawDevProofBundle,
} from "./proveWithdrawDev";
import {
  proveWithdraw1Dev,
  withdraw1NullifierHex,
  withdraw1RecipientHex,
  type Withdraw1DevProofBundle,
} from "./proveWithdraw1Dev";
import {
  proveWithdrawPartialDev,
  withdrawPartialNullifierHex,
  withdrawPartialRecipientHex,
  type WithdrawPartialDevProofBundle,
} from "./proveWithdrawPartialDev";
import { proveOwnershipDev } from "./proveOwnershipDev";
import { proveValueBoundDev } from "./proveValueBoundDev";
import {
  proveDepositDev,
  type DepositDevProofBundle,
} from "./proveDepositDev";
import {
  buildBulletinAttestationCall,
  buildVerifyingOwnershipCall,
  buildVerifyingValueBoundCall,
} from "./attestationCall";
import {
  clearLocalSecrets,
  downloadJson,
  downloadSpendNotes,
  downloadBackupFile,
  emptyNotesStore,
  loadPlainNotes,
  parseImportedNoteFile,
  parseRecoveryCode,
  purgeLegacyBrowserNoteStorage,
  recoveryCodeNeedsPassword,
  scrubNoteSecretsInPlace,
  toBytes32Hex,
  type LocalNoteRecord,
  type NotesStore,
  type SealedBackupArtifacts,
} from "./storage";
import { humanToBaseUnits } from "./amountFormat";
import {
  formatAssetAmount,
  privacyAdviceForUi,
  shortTx,
} from "./userNotice";
import { shortHex } from "./guideLogic";
import { ACTIVE_NETWORK, isActiveChainId } from "./networkConfig";
import { formatUserError } from "./formatUserError";
import { ProductShell, type AppPage, type PoolOption } from "./productPages";
import { AppDialogHost, snapshotSessionNotes, useAppDialogs } from "./AppDialog";
import { relayWithdrawCalldata } from "./relayerClient";
import {
  connectWallet,
  disconnectWallet,
  subscribeWalletEvents,
  decodeAddressWord,
  decodeBoolWord,
  ethCall,
  getChainIdHex,
  sendTransaction,
  switchToSepolia,
  waitReceipt,
  watchAsset,
} from "./wallet";

type Status = { kind: "idle" | "ok" | "err"; text: string; at: number };
type SepoliaPoolPreset = {
  id: string;
  pool: string;
  asset: string;
  assetSymbol: string;
  assetDecimals: number;
  assetSource: string;
  native?: boolean;
};
type SepoliaRegistry = {
  chainId: number;
  status: string;
  warning: string;
  pools: Record<string, Omit<SepoliaPoolPreset, "id">>;
};
type TxStatus = {
  label: string;
  hash: string;
  state: "pending" | "confirmed";
};

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export function App() {
  const dialogs = useAppDialogs();

  async function askExportPassphrase(): Promise<
    { cancelled: true } | { cancelled: false; passphrase?: string }
  > {
    const choice = await dialogs.askPassword("export");
    if (choice.kind === "cancel") return { cancelled: true };
    if (choice.kind === "skip") return { cancelled: false };
    return { cancelled: false, passphrase: choice.password };
  }

  async function askImportPassphrase(): Promise<string | null> {
    const choice = await dialogs.askPassword("import");
    return choice.kind === "password" ? choice.password : null;
  }

  async function explainPartialChangeNote(
    note: LocalNoteRecord,
    exitAmount: bigint,
    phase: "prepare" | "send"
  ): Promise<boolean> {
    const noteValue = BigInt(note.value);
    if (exitAmount <= 0n || exitAmount >= noteValue) {
      throw new Error(
        "partial withdraw must leave positive change; use full withdraw for the entire note"
      );
    }
    return dialogs.confirmPartialChange({
      phase,
      exitLabel: formatAssetAmount(exitAmount, assetDecimals, assetSymbol),
      remainderLabel: formatAssetAmount(
        noteValue - exitAmount,
        assetDecimals,
        assetSymbol
      ),
    });
  }

  async function saveChangeNoteOrCancel(
    changeNote: LocalNoteRecord
  ): Promise<boolean> {
    const changeChoice = await askExportPassphrase();
    if (changeChoice.cancelled) return false;
    const artifacts = await downloadSpendNotes(
      [changeNote],
      changeChoice.passphrase
    );
    if (artifacts) setBackupPanel(artifacts);
    return true;
  }

  const [store, setStore] = useState<NotesStore>(() => loadPlainNotes());
  const [value, setValue] = useState("100000000000000000");
  const [customAmounts, setCustomAmounts] = useState(
    "100000000000000000,100000000000000000"
  );
  const [humanAmount, setHumanAmount] = useState("0.1");
  const [mintAmountHuman, setMintAmountHuman] = useState("1000");
  const [passphrase, setPassphrase] = useState("");
  const [recipientPubkey, setRecipientPubkey] = useState("");
  const [deliveryKeyJson, setDeliveryKeyJson] = useState("");
  const [valueBoundThreshold, setValueBoundThreshold] = useState("100000");
  const [poolAddress, setPoolAddress] = useState(ZERO_ADDR);
  const [tokenAddress, setTokenAddress] = useState("");
  const [sepoliaPools, setSepoliaPools] = useState<SepoliaPoolPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [latestTx, setLatestTx] = useState<TxStatus | null>(null);
  const [chainId, setChainId] = useState(String(ACTIVE_NETWORK.chainId));
  const [account, setAccount] = useState("");
  const [walletChain, setWalletChain] = useState("");
  const accountRef = useRef("");
  accountRef.current = account;
  const [poolRoot, setPoolRoot] = useState("");
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [poolHealth, setPoolHealth] = useState<string | null>(null);
  const [privacyHints, setPrivacyHints] = useState<string[]>([]);
  const [depositJson, setDepositJson] = useState("");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [withdrawMode, setWithdrawMode] = useState<
    "full" | "partial" | "merge2"
  >("full");
  const [partialHumanAmount, setPartialHumanAmount] = useState("0.1");
  const [proofBundle, setProofBundle] = useState<WithdrawDevProofBundle | null>(
    null
  );
  const [withdraw1Bundle, setWithdraw1Bundle] =
    useState<Withdraw1DevProofBundle | null>(null);
  const [withdrawPartialBundle, setWithdrawPartialBundle] =
    useState<WithdrawPartialDevProofBundle | null>(null);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState(0);
  const [selectedSpendIndices, setSelectedSpendIndices] = useState<number[]>([]);
  const [provedSpendIndices, setProvedSpendIndices] = useState<
    [number, number] | null
  >(null);
  const [provedOneIndex, setProvedOneIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "", at: 0 });
  const [unlocked, setUnlocked] = useState(true);
  const [notesSavedAck, setNotesSavedAck] = useState(false);
  const [backupPanel, setBackupPanel] = useState<SealedBackupArtifacts | null>(
    null
  );
  const [recoveryPaste, setRecoveryPaste] = useState("");
  const [page, setPage] = useState<AppPage>("deposit");
  const [mintCompleted, setMintCompleted] = useState(false);
  const [keepNoteBacklog, setKeepNoteBacklog] = useState(false);

  const noteEntries = useMemo(
    () => store.notes.map((n, index) => ({ n, index })),
    [store.notes]
  );

  const selectedNote = store.notes[selectedNoteIndex] ?? null;
  const selectedIsSpendable =
    !!selectedNote && selectedNote.statusHint !== "spent";
  const hasTwoSpendInputs =
    selectedSpendIndices.length === 2 &&
    selectedSpendIndices.every(
      (index) => store.notes[index]?.statusHint !== "spent"
    );
  /** Active product pools = Sepolia deployment, presented as the live app network. */
  const productPoolOptions: PoolOption[] = useMemo(
    () =>
      sepoliaPools.map((p) => {
        const labels = ACTIVE_NETWORK.productLabels[p.id] ?? {
          name: p.assetSymbol,
          symbol: p.assetSymbol,
        };
        return {
          id: p.id,
          name: labels.name,
          label: `${labels.name} (${labels.symbol})`,
          symbol: labels.symbol,
          decimals: p.assetDecimals,
          pool: p.pool,
          asset: p.asset,
          native: p.native === true,
          source: "active" as const,
        };
      }),
    [sepoliaPools]
  );

  const selectedPoolOption =
    productPoolOptions.find((p) => p.id === selectedPresetId) ?? null;
  const selectedPreset =
    sepoliaPools.find((preset) => preset.id === selectedPresetId) ?? null;
  const isNativePool = selectedPoolOption?.native === true;
  const assetDecimals = selectedPoolOption?.decimals ?? 18;
  const assetSymbol = selectedPoolOption?.symbol ?? "TOKEN";
  const unboundUnspent = useMemo(
    () =>
      store.notes
        .map((n, index) => ({ n, index }))
        .filter(({ n }) => {
          if (n.statusHint === "spent") return false;
          if (!poolAddress) return n.leafIndex == null;
          return !noteBoundToPool(n, poolAddress);
        }),
    [store.notes, poolAddress]
  );
  const boundUnspent = useMemo(
    () =>
      store.notes
        .map((n, index) => ({ n, index }))
        .filter(({ n }) => {
          if (n.statusHint === "spent") return false;
          if (!poolAddress) return n.leafIndex != null;
          return noteBoundToPool(n, poolAddress);
        }),
    [store.notes, poolAddress]
  );

  // Never persist spend notes in the browser — wipe any legacy keys on boot.
  useEffect(() => {
    purgeLegacyBrowserNoteStorage();
  }, []);

  // Load the active product pool registry (Sepolia until mainnet ships).
  useEffect(() => {
    let cancelled = false;
    void fetch(ACTIVE_NETWORK.poolsPath, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`pools registry HTTP ${r.status}`);
        return (await r.json()) as SepoliaRegistry;
      })
      .then((registry) => {
        if (cancelled) return;
        if (registry.chainId !== ACTIVE_NETWORK.chainId) {
          throw new Error(
            `pool registry chainId ${registry.chainId} != active ${ACTIVE_NETWORK.chainId}`
          );
        }
        const presets = Object.entries(registry.pools).map(([id, pool]) => {
          const native =
            pool.native === true ||
            !pool.asset ||
            pool.asset.toLowerCase() === ZERO_ADDR;
          return {
            id,
            ...pool,
            asset: native ? ZERO_ADDR : pool.asset,
            assetSymbol: native ? "ETH" : pool.assetSymbol,
            native,
          };
        });
        setSepoliaPools(presets);
        setSelectedPresetId((current) => {
          if (current && presets.some((p) => p.id === current)) return current;
          const first = presets[0];
          if (first) {
            setPoolAddress(first.pool);
            setTokenAddress(first.asset);
            return first.id;
          }
          return current;
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({
            kind: "err",
            at: Date.now(),
            text: `Could not load pool registry: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allowUnloadRef = useRef(false);
  const leavePromptBusyRef = useRef(false);
  const confirmLeaveRef = useRef(dialogs.confirmLeavePage);
  confirmLeaveRef.current = dialogs.confirmLeavePage;
  const notesCountRef = useRef(store.notes.length);
  notesCountRef.current = store.notes.length;
  const notesSnapshotRef = useRef(
    snapshotSessionNotes(store.notes, assetDecimals, assetSymbol)
  );
  notesSnapshotRef.current = snapshotSessionNotes(
    store.notes,
    assetDecimals,
    assetSymbol
  );
  const sessionOpenRef = useRef(unlocked);
  sessionOpenRef.current = unlocked;
  const dialogOpenRef = useRef(false);
  dialogOpenRef.current = dialogs.request != null;

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (allowUnloadRef.current) return;
      if (!sessionOpenRef.current || notesCountRef.current === 0) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    function isReloadShortcut(e: KeyboardEvent) {
      if (e.key === "F5") return true;
      const mod = e.metaKey || e.ctrlKey;
      return Boolean(mod && (e.key === "r" || e.key === "R"));
    }
    function onKey(e: KeyboardEvent) {
      if (!isReloadShortcut(e)) return;
      if (!sessionOpenRef.current || notesCountRef.current === 0) return;
      e.preventDefault();
      if (leavePromptBusyRef.current || dialogOpenRef.current) return;
      leavePromptBusyRef.current = true;
      void confirmLeaveRef
        .current(notesSnapshotRef.current, "leave")
        .then((ok) => {
          if (!ok) return;
          allowUnloadRef.current = true;
          window.location.reload();
        })
        .finally(() => {
          leavePromptBusyRef.current = false;
        });
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (allowUnloadRef.current) return;
      if (!sessionOpenRef.current || notesCountRef.current === 0) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    function isReloadShortcut(e: KeyboardEvent) {
      if (e.key === "F5") return true;
      const mod = e.metaKey || e.ctrlKey;
      return Boolean(mod && (e.key === "r" || e.key === "R"));
    }
    function onKey(e: KeyboardEvent) {
      if (!isReloadShortcut(e)) return;
      if (!sessionOpenRef.current || notesCountRef.current === 0) return;
      e.preventDefault();
      if (leavePromptBusyRef.current) return;
      leavePromptBusyRef.current = true;
      void confirmLeaveRef
        .current(notesSnapshotRef.current, "leave")
        .then((ok) => {
          if (!ok) return;
          allowUnloadRef.current = true;
          window.location.reload();
        })
        .finally(() => {
          leavePromptBusyRef.current = false;
        });
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    return subscribeWalletEvents({
      onAccounts(accounts) {
        const next = accounts[0] ?? "";
        const prev = accountRef.current;
        setAccount(next);
        if (!next) {
          if (prev) {
            setStatus({ kind: "ok", text: "Wallet disconnected.", at: Date.now() });
          }
          return;
        }
        if (next.toLowerCase() === prev.toLowerCase()) return;
        setWithdrawRecipient((current) =>
          !current || (prev && current.toLowerCase() === prev.toLowerCase())
            ? next
            : current
        );
        void getChainIdHex()
          .then((cid) => {
            setWalletChain(cid);
            setChainId(String(Number.parseInt(cid, 16)));
          })
          .catch(() => {
            /* chain id refresh is best-effort while the account event is applied */
          });
        setStatus({
          kind: "ok",
          at: Date.now(),
          text: `Active wallet ${shortHex(next)}.`,
        });
      },
      onChain(cid) {
        if (!cid) return;
        setWalletChain(cid);
        const parsed = Number.parseInt(cid, 16);
        if (!Number.isNaN(parsed)) setChainId(String(parsed));
      },
    });
  }, []);

  useEffect(() => {
    if (
      selectedNoteIndex >= store.notes.length ||
      store.notes[selectedNoteIndex]?.statusHint === "spent"
    ) {
      const next = store.notes.findIndex((n) => n.statusHint !== "spent");
      if (next >= 0) setSelectedNoteIndex(next);
    }
  }, [store.notes, selectedNoteIndex]);

  useEffect(() => {
    setSelectedSpendIndices((indices) =>
      indices.filter(
        (index) =>
          store.notes[index] && store.notes[index].statusHint !== "spent"
      ).slice(0, 2)
    );
  }, [store.notes]);

  useEffect(() => {
    if (page === "deposit" && unboundUnspent.length > 0) {
      const stillUnbound =
        store.notes[selectedNoteIndex]?.leafIndex == null &&
        store.notes[selectedNoteIndex]?.statusHint !== "spent";
      if (!stillUnbound) {
        setSelectedNoteIndex(unboundUnspent[0].index);
      }
    }
    if (
      page === "withdraw" &&
      selectedSpendIndices.length === 0 &&
      boundUnspent.length >= 2
    ) {
      setSelectedSpendIndices([boundUnspent[0].index, boundUnspent[1].index]);
    }
  }, [
    page,
    unboundUnspent,
    boundUnspent,
    selectedNoteIndex,
    selectedSpendIndices.length,
    store.notes,
  ]);

  function setOk(text: string) {
    setStatus({ kind: "ok", text, at: Date.now() });
  }
  function setErr(text: string) {
    setStatus({ kind: "err", text, at: Date.now() });
  }
  function notifyCaught(e: unknown) {
    const msg = formatUserError(e);
    if (/^Cancelled/.test(msg)) setOk(msg);
    else setErr(msg);
  }

  function clearSpendProofContext() {
    setProofBundle(null);
    setWithdraw1Bundle(null);
    setWithdrawPartialBundle(null);
    setProvedSpendIndices(null);
    setProvedOneIndex(null);
    setSelectedSpendIndices([]);
  }

  async function refreshPoolAndBindNotes(opts?: {
    preferCommitment?: string;
  }): Promise<{ bound: number; count: number; root: string }> {
    if (!poolAddress || poolAddress.endsWith("000000000000000000000000")) {
      throw new Error("set the deployed pool address");
    }
    const synced = await fetchSyncedPoolState(poolAddress);
    setPoolRoot(
      `0x${BigInt(synced.onChainRoot).toString(16).padStart(64, "0")}`
    );
    setPoolCount(synced.commitments.length);
    const health = poolHealthWarning(synced.commitments.length);
    setPoolHealth(`${poolHealthTier(synced.commitments.length)} · ${health.message}`);
    if (health.severity === "warn") {
      showPrivacyWarnings([health]);
    }

    let bound = 0;
    let notesAfter: LocalNoteRecord[] = [];
    const poolMeta = {
      address: poolAddress,
      symbol: assetSymbol,
    };
    setStore((prev) => {
      const result = bindNotesToPublicState(prev.notes, synced, poolMeta);
      bound = result.bound;
      notesAfter = result.notes;
      return { ...prev, notes: result.notes };
    });

    if (opts?.preferCommitment) {
      const idx = notesAfter.findIndex(
        (n) => BigInt(n.commitment) === BigInt(opts.preferCommitment!)
      );
      if (idx >= 0) setSelectedNoteIndex(idx);
    }

    return {
      bound,
      count: synced.commitments.length,
      root: synced.root,
    };
  }

  function showPrivacyWarnings(warnings: PrivacyWarning[]) {
    const lines = privacyAdviceForUi(warnings);
    setPrivacyHints(lines);
    return lines;
  }

  function peerValuesExcept(skipIndices: number[]): string[] {
    const skip = new Set(skipIndices);
    return store.notes
      .filter((_, index) => !skip.has(index))
      .filter((n) => n.statusHint !== "spent")
      .map((n) => n.value);
  }

  function adviseWithdrawPrivacy(params: {
    amount: string | bigint;
    skipIndices: number[];
    depositBroadcaster?: string | null;
    kind: "full" | "partial" | "merge";
  }) {
    return showPrivacyWarnings(
      assessPracticalPrivacy({
        commitmentCount: poolCount,
        amount: params.amount,
        peerValues: peerValuesExcept(params.skipIndices),
        amountContext: "withdraw",
        depositBroadcaster: params.depositBroadcaster,
        withdrawRecipient,
        withdrawKind: params.kind,
        decimals: assetDecimals,
      })
    );
  }

  /** Encrypt + show Recovery Code first; file download is optional. */
  async function admitNotesAfterMandatorySave(
    records: LocalNoteRecord[]
  ): Promise<boolean> {
    if (records.length === 0) return false;
    if (!(await dialogs.confirmSaveNotes(records.length))) {
      setErr("Cancelled — notes were not created and nothing was stored.");
      return false;
    }
    const exportChoice = await askExportPassphrase();
    if (exportChoice.cancelled) {
      setErr("Cancelled — notes were not created and nothing was stored.");
      return false;
    }
    const artifacts = await downloadSpendNotes(
      records,
      exportChoice.passphrase
    );
    if (!artifacts) {
      setErr("Failed to build backup.");
      return false;
    }
    setBackupPanel(artifacts);
    setNotesSavedAck(true);
    return true;
  }

  async function mergeImportedNotes(parsed: LocalNoteRecord[]) {
    const start = store.notes.length;
    setNotesSavedAck(true);
    setUnlocked(true);

    const notePoolAddr = parsed[0]?.poolAddress?.toLowerCase?.() ?? "";
    const matchedOption = notePoolAddr
      ? productPoolOptions.find((p) => p.pool.toLowerCase() === notePoolAddr)
      : undefined;
    let syncPool = poolAddress;
    let syncSymbol = assetSymbol;
    if (matchedOption) {
      setSelectedPresetId(matchedOption.id);
      setPoolAddress(matchedOption.pool);
      setTokenAddress(matchedOption.asset);
      syncPool = matchedOption.pool;
      syncSymbol = matchedOption.symbol;
    }

    const existingKeys = new Set(store.notes.map((n) => n.commitment));
    const merged = [
      ...store.notes,
      ...parsed.filter((n) => !existingKeys.has(n.commitment)),
    ];

    let notesAfter: LocalNoteRecord[] = merged;
    if (syncPool && !syncPool.endsWith("000000000000000000000000")) {
      setOk("Importing note and syncing pool / nullifiers…");
      const result = await scanNullifiersAgainstPool({
        pool: syncPool,
        assetSymbol: syncSymbol,
        notes: merged,
      });
      setPoolRoot(
        `0x${BigInt(result.poolRoot).toString(16).padStart(64, "0")}`
      );
      setPoolCount(result.poolCount);
      const health = poolHealthWarning(result.poolCount);
      setPoolHealth(
        `${poolHealthTier(result.poolCount)} · ${health.message}`
      );
      if (health.severity === "warn") {
        showPrivacyWarnings([health]);
      }
      notesAfter = result.notes;
      setStore((prev) => ({ ...prev, notes: result.notes }));

      const imported = notesAfter.find(
        (n) =>
          parsed[0]?.commitment != null &&
          BigInt(n.commitment) === BigInt(parsed[0].commitment)
      );
      if (imported && imported.leafIndex != null) {
        const idx = notesAfter.indexOf(imported);
        if (idx >= 0) setSelectedNoteIndex(idx);
        else setSelectedNoteIndex(Math.max(0, start));
      } else {
        setSelectedNoteIndex(Math.max(0, start));
      }
      setOk(
        `Restored ${parsed.length} note(s) and synced the pool (${result.poolCount} notes).`
      );
    } else {
      setStore((prev) => ({ ...prev, notes: merged }));
      setSelectedNoteIndex(Math.max(0, start));
      setOk(`Restored ${parsed.length} note(s) into this tab.`);
    }
  }

  async function onImportSpendNotesFile(file: File) {
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const isBinary =
        buf.length >= 4 &&
        buf[0] === 0x41 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x31;
      let passphrase: string | undefined;
      if (isBinary) {
        const p = await askImportPassphrase();
        if (!p) {
          setErr("Cancelled — password required to decrypt the .apnote file.");
          return;
        }
        passphrase = p;
      } else {
        const text = new TextDecoder().decode(buf).trim();
        if (recoveryCodeNeedsPassword(text) && text.toUpperCase().startsWith("AP1")) {
          const p = await askImportPassphrase();
          if (!p) {
            setErr("Cancelled — password required to decrypt the recovery code.");
            return;
          }
          passphrase = p;
        } else {
          try {
            const raw = JSON.parse(text) as { format?: string };
            if (raw.format === "absolute-privacy-spend-note-sealed") {
              const p = await askImportPassphrase();
              if (!p) {
                setErr("Cancelled — password required to decrypt the note file.");
                return;
              }
              passphrase = p;
            }
          } catch {
            // parseImportedNoteFile will surface the error
          }
        }
      }
      // Re-wrap bytes so parseImportedNoteFile can read the same payload
      const rebuilt = new File([buf], file.name, { type: file.type });
      const parsed = await parseImportedNoteFile(rebuilt, passphrase);
      await mergeImportedNotes(parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportRecoveryCode(code: string) {
    setBusy(true);
    try {
      let passphrase: string | undefined;
      if (recoveryCodeNeedsPassword(code)) {
        const p = await askImportPassphrase();
        if (!p) {
          setErr("Cancelled — password required to decrypt the recovery code.");
          return;
        }
        passphrase = p;
      }
      const parsed = parseRecoveryCode(code, passphrase);
      await mergeImportedNotes(parsed);
      setRecoveryPaste("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateNote() {
    setBusy(true);
    try {
      const amount = BigInt(value);
      if (amount <= 0n) throw new Error("value must be > 0");
      const poseidon = await createCircomlibPoseidon();
      const { note, commitment } = await createNote({
        assetId: 1n,
        value: amount,
        poseidon,
      });
      const record: LocalNoteRecord = {
        version: note.version.toString(),
        assetId: note.assetId.toString(),
        value: note.value.toString(),
        spendingKey: note.spendingKey.toString(),
        nullifierKey: note.nullifierKey.toString(),
        blinding: note.blinding.toString(),
        commitment: commitment.toString(),
        statusHint: "unspent",
      };
      if (!(await admitNotesAfterMandatorySave([record]))) return;
      const nextIndex = store.notes.length;
      setStore((prev) => ({ ...prev, notes: [...prev.notes, record] }));
      setSelectedNoteIndex(nextIndex);
      const hints = showPrivacyWarnings(
        assessAmountFingerprint({ value: amount, context: "deposit" })
      );
      setOk(
        `Recovery Code ready — copy it below (file optional). Commitment …${commitment
          .toString()
          .slice(-10)}${hints.length ? ` · ${hints.length} privacy hint(s)` : ""}`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateSplitNotes() {
    setBusy(true);
    try {
      const amount = BigInt(value);
      if (amount <= 0n) throw new Error("value must be > 0");
      const poseidon = await createCircomlibPoseidon();
      const { suggestion, created } = await createNotesFromSuggestedSplit({
        value: amount,
        parts: 3,
        assetId: 1n,
        poseidon,
      });
      const records: LocalNoteRecord[] = created.map(({ note, commitment }) => ({
        version: note.version.toString(),
        assetId: note.assetId.toString(),
        value: note.value.toString(),
        spendingKey: note.spendingKey.toString(),
        nullifierKey: note.nullifierKey.toString(),
        blinding: note.blinding.toString(),
        commitment: commitment.toString(),
        statusHint: "unspent",
      }));
      if (!(await admitNotesAfterMandatorySave(records))) return;
      const start = store.notes.length;
      setStore((prev) => ({ ...prev, notes: [...prev.notes, ...records] }));
      setSelectedNoteIndex(start);
      const hints = showPrivacyWarnings([
        ...assessAmountFingerprint({ value: amount, context: "deposit" }),
        ...assessDepositBurst({ partsCreating: 3, context: "create" }),
      ]);
      setPrivacyHints([
        ...hints,
        `[info/suggest_split] ${suggestion.note}`,
        "[info/split_create] Deposit parts separately — avoid same-block bursts.",
      ]);
      setOk(
        `Downloaded ${records.length} note file(s): ${suggestion.parts.join(" + ")} = ${suggestion.sum}. Save offline.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCustomDistribute() {
    setBusy(true);
    try {
      const total = BigInt(value);
      if (total <= 0n) throw new Error("value/total must be > 0");
      const poseidon = await createCircomlibPoseidon();
      const { plan, created, changeNote } =
        await createNotesFromCustomDistribution({
          total,
          amounts: customAmounts,
          assetId: 1n,
          poseidon,
        });
      const all = changeNote ? [...created, changeNote] : created;
      const records: LocalNoteRecord[] = all.map(({ note, commitment }) => ({
        version: note.version.toString(),
        assetId: note.assetId.toString(),
        value: note.value.toString(),
        spendingKey: note.spendingKey.toString(),
        nullifierKey: note.nullifierKey.toString(),
        blinding: note.blinding.toString(),
        commitment: commitment.toString(),
        statusHint: "unspent",
      }));
      if (!(await admitNotesAfterMandatorySave(records))) return;
      const start = store.notes.length;
      setStore((prev) => ({ ...prev, notes: [...prev.notes, ...records] }));
      setSelectedNoteIndex(start);
      const partCount = all.length;
      const hints = showPrivacyWarnings([
        ...assessAmountFingerprint({ value: total, context: "deposit" }),
        ...assessDepositBurst({ partsCreating: partCount, context: "create" }),
      ]);
      setPrivacyHints([
        ...hints,
        `[info/distribute] ${plan.note}`,
        `[info/distribute] ${plan.privacyNote}`,
      ]);
      setOk(
        `Downloaded note file(s) for ${created.length} notes` +
          (changeNote ? ` + change ${plan.change}` : "") +
          `: ${plan.amounts.join(" + ")}. Save offline.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  function onExportOwnershipDisclosure() {
    try {
      const { index, note } = requireSelectedSpendable();
      const disclosure = buildOwnershipDisclosure({
        version: note.version,
        assetId: note.assetId,
        value: note.value,
        spendingKey: note.spendingKey,
        nullifierKey: note.nullifierKey,
        blinding: note.blinding,
        commitment: note.commitment,
        leafIndex: note.leafIndex ?? null,
      });
      const pub = recipientPubkey.trim();
      if (pub && passphrase.length >= 8) {
        throw new Error("use either passphrase or recipient pubkey, not both");
      }
      if (pub) {
        const sealed = sealOwnershipDisclosureToRecipient(disclosure, pub);
        downloadJson(`disclosure_note_${index}.apsealed`, sealed);
        setOk(
          `Exported recipient-bound disclosure for note #${index} (X25519; plaintext is spend-capable after decrypt).`
        );
      } else if (passphrase.length >= 8) {
        const sealed = sealOwnershipDisclosure(disclosure, passphrase);
        downloadJson(`disclosure_note_${index}.apsealed`, sealed);
        setOk(
          `Exported sealed ownership disclosure for note #${index} (passphrase-sealed).`
        );
      } else {
        throw new Error(
          "Refusing plaintext ownership disclosure export. Provide a passphrase (≥8) or recipient pubkey to seal."
        );
      }
    } catch (e) {
      setErr(formatUserError(e));
    }
  }

  function onGenerateRecipientKeys() {
    try {
      const keypair = generateDisclosureRecipientKeypair();
      const pub = exportDisclosureRecipientPublic(keypair);
      const payment = paymentAddressFromKeypair(keypair);
      // Never auto-download private keys — only public payment material.
      downloadJson("disclosure_recipient.pub.json", pub);
      downloadJson("payment.addr.json", payment);
      setRecipientPubkey(pub.publicKey);
      setDeliveryKeyJson(JSON.stringify(keypair));
      setOk(
        "Generated X25519 payment keys in-session. Public key + payment.addr downloaded; private key stays in memory only (copy manually if needed)."
      );
    } catch (e) {
      setErr(formatUserError(e));
    }
  }

  async function onAcceptIncomingNote(file: File) {
    setBusy(true);
    try {
      if (!deliveryKeyJson.trim()) {
        throw new Error(
          "paste or Gen recipient private key JSON first (disclosure_recipient.json)"
        );
      }
      const keypair = JSON.parse(deliveryKeyJson) as unknown;
      assertDisclosureRecipientKeypair(keypair);
      const envelope = JSON.parse(await file.text()) as unknown;
      const poseidon = await createCircomlibPoseidon();
      const plain = unsealIncomingNoteWithRecipientKey(
        envelope as Parameters<typeof unsealIncomingNoteWithRecipientKey>[0],
        keypair.privateKey
      );
      const verified = await verifyIncomingNotePlaintext(plain, poseidon);
      if (!verified.ok) throw new Error("incoming note commitment mismatch");
      const record = incomingNoteToLocalRecord(plain) as LocalNoteRecord;
      const dup = store.notes.findIndex(
        (n) =>
          n.commitment != null &&
          BigInt(n.commitment) === BigInt(record.commitment)
      );
      if (dup >= 0) {
        setSelectedNoteIndex(dup);
        if (poolAddress && !poolAddress.endsWith("000000000000000000000000")) {
          const sync = await refreshPoolAndBindNotes({
            preferCommitment: record.commitment,
          });
          setOk(
            `Note already present at index ${dup}; rebound leaves=${sync.count}.`
          );
        } else {
          setOk(`Note already present at index ${dup} (commitment match).`);
        }
        return;
      }
      if (!(await admitNotesAfterMandatorySave([record]))) return;
      const nextIndex = store.notes.length; // about to push
      setStore((prev) => ({ ...prev, notes: [...prev.notes, record] }));
      setSelectedNoteIndex(nextIndex);
      if (poolAddress && !poolAddress.endsWith("000000000000000000000000")) {
        const sync = await refreshPoolAndBindNotes({
          preferCommitment: record.commitment,
        });
        setOk(
          `Accepted sealed note (value ${record.value}) and bound leaf from pool (leaves=${sync.count}). Offline delivery only.`
        );
      } else {
        setOk(
          `Accepted sealed incoming note (value ${record.value}). Set pool address + Sync & bind for leafIndex.`
        );
      }
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onMailboxScanFiles(files: FileList | File[]) {
    setBusy(true);
    try {
      if (!deliveryKeyJson.trim()) {
        throw new Error(
          "paste or Gen recipient private key JSON first (disclosure_recipient.json)"
        );
      }
      const keypair = JSON.parse(deliveryKeyJson) as unknown;
      assertDisclosureRecipientKeypair(keypair);
      const poseidon = await createCircomlibPoseidon();
      const list = Array.from(files);
      const envelopes: Array<{ envelope: unknown; path?: string }> = [];
      for (const file of list) {
        try {
          const envelope = JSON.parse(await file.text()) as {
            format?: string;
          };
          if (envelope.format === "absolute-privacy-incoming-note-sealed") {
            envelopes.push({ envelope, path: file.name });
          }
        } catch {
          // skip noise
        }
      }
      const known = store.notes
        .filter((n) => n.commitment != null)
        .map((n) => n.commitment);
      const result = await scanIncomingMailbox({
        envelopes,
        recipientPrivateKey: keypair.privateKey,
        poseidon,
        knownCommitments: known,
      });
      const imported = result.accepted
        .map((a) => a.note)
        .filter(Boolean) as LocalNoteRecord[];
      if (imported.length > 0) {
        if (!(await admitNotesAfterMandatorySave(imported))) return;
        setStore((prev) => ({
          ...prev,
          notes: [...prev.notes, ...imported],
        }));
        setNotesSavedAck(true);
      }
      let bindNote = "";
      if (
        imported.length > 0 &&
        poolAddress &&
        !poolAddress.endsWith("000000000000000000000000")
      ) {
        const sync = await refreshPoolAndBindNotes({
          preferCommitment: imported[0]?.commitment,
        });
        bindNote = ` Bound leaves=${sync.count}.`;
      }
      setOk(
        `Offline mailbox: accepted ${result.accepted.length}, skipped ${result.skipped.length}, failed ${result.failed.length}.${bindNote} Not chain scan.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onExportViewKeyAndPackage() {
    setBusy(true);
    try {
      const { index, note } = requireSelectedSpendable();
      const poseidon = await createCircomlibPoseidon();
      const { viewKey, package: viewPkg } = await createOwnershipViewPackageFromNote(
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
      const { package: receiptPkg } = await createPaymentReceiptFromNote(
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
      const keyDoc = buildViewKeyExport({
        viewKey,
        commitmentHint: note.commitment,
      });
      downloadJson(`view_key_note_${index}.json`, keyDoc);
      downloadJson(`view_package_note_${index}.json`, viewPkg);
      downloadJson(`payment_receipt_note_${index}.json`, receiptPkg);
      downloadJson(
        `view_bulletin_call_note_${index}.json`,
        buildBulletinAttestationCall(viewPkg)
      );
      downloadJson(
        `receipt_bulletin_call_note_${index}.json`,
        buildBulletinAttestationCall(receiptPkg)
      );
      setOk(
        `Exported view key + ownership_view + payment_receipt (+ bulletin calldata) for note #${index}.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  function onDeliverIncomingNote() {
    try {
      const { index, note } = requireSelectedSpendable();
      if (!recipientPubkey.trim()) {
        throw new Error("set recipient pubkey (or Gen recipient keys) before deliver");
      }
      const plaintext = buildIncomingNotePackageFromNote({
        version: BigInt(note.version),
        assetId: BigInt(note.assetId),
        value: BigInt(note.value),
        spendingKey: BigInt(note.spendingKey),
        nullifierKey: BigInt(note.nullifierKey),
        blinding: BigInt(note.blinding),
        leafIndex: note.leafIndex ?? undefined,
        commitment: note.commitment,
      });
      const sealed = sealIncomingNoteToRecipient(plaintext, recipientPubkey.trim());
      downloadJson(`incoming_note_${index}.apsealed.json`, sealed);
      setOk(
        `Sealed incoming note #${index} to recipient (offline delivery). Commitment hint ${sealed.hint.commitment}. Not on-chain memo.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    }
  }

  function onExportClaimStub() {
    try {
      const { index, note } = requireSelectedSpendable();
      const stub = buildOwnershipClaimStub({
        commitment: note.commitment,
        assetId: note.assetId,
        value: note.value,
        leafIndex: note.leafIndex ?? null,
      });
      downloadJson(`claim_stub_note_${index}.json`, stub);
      setOk(`Exported claim stub for note #${index} (no secrets — not a proof).`);
    } catch (e) {
      setErr(formatUserError(e));
    }
  }

  async function onProveOwnershipDev() {
    setBusy(true);
    try {
      const { index, note } = requireSelectedSpendable();
      setOk(`Proving ownership_dev attestation for note #${index}…`);
      const pkg = await proveOwnershipDev({ note, audienceTag: 1 });
      downloadJson(`ownership_dev_note_${index}.json`, pkg);
      downloadJson(
        `ownership_bulletin_call_note_${index}.json`,
        buildBulletinAttestationCall(pkg)
      );
      downloadJson(
        `ownership_verifying_call_note_${index}.json`,
        buildVerifyingOwnershipCall(pkg)
      );
      setOk(
        `Exported ownership_dev proof + bulletin/verifying calldata for note #${index} (local keys; not ceremony-grade).`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onProveValueBoundDev() {
    setBusy(true);
    try {
      const { index, note } = requireSelectedSpendable();
      setOk(`Proving value_bound_dev (value >= ${valueBoundThreshold})…`);
      const pkg = await proveValueBoundDev({
        note,
        threshold: valueBoundThreshold,
        audienceTag: 1,
      });
      downloadJson(`value_bound_dev_note_${index}.json`, pkg);
      downloadJson(
        `value_bound_bulletin_call_note_${index}.json`,
        buildBulletinAttestationCall(pkg)
      );
      downloadJson(
        `value_bound_verifying_call_note_${index}.json`,
        buildVerifyingValueBoundCall(pkg)
      );
      setOk(
        `Exported value_bound_dev proof + bulletin/verifying calldata for note #${index} (exact value private; local keys).`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  function buildDepositPayload(
    index = selectedNoteIndex,
    proof?: DepositDevProofBundle
  ) {
    const note = store.notes[index];
    if (!note) throw new Error("select a note first");
    if (note.statusHint === "spent") throw new Error("selected note is spent");
    const netValue = BigInt(note.value);
    const amount = depositGrossFromNet(netValue, DEPOSIT_FEE_PPM);
    const fee = amount - netValue;
    const commitmentHex = toBytes32Hex(note.commitment);
    return {
      note,
      index,
      amount,
      fee,
      commitmentHex,
      payload: {
        function: "deposit",
        args: {
          amount: amount.toString(),
          newCommitments: [commitmentHex],
          tierCode: 0,
          ...(proof
            ? {
                proofA: proof.proofA,
                proofB: proof.proofB,
                proofC: proof.proofC,
              }
            : {}),
        },
        accounting: {
          depositFeePpm: DEPOSIT_FEE_PPM.toString(),
          depositFee: fee.toString(),
          netValue: netValue.toString(),
        },
        warning:
          "Notes never leave this browser. Broadcast only via your wallet.",
      },
    };
  }

  async function onBuildDeposit() {
    setBusy(true);
    try {
      const note = store.notes[selectedNoteIndex];
      if (!note) throw new Error("select a note first");
      setOk("Generating local deposit_dev proof…");
      const proof = await proveDepositDev(note);
      const { payload } = buildDepositPayload(selectedNoteIndex, proof);
      setDepositJson(JSON.stringify(payload, null, 2));
      downloadJson("deposit_call.json", payload);
      setOk("Deposit proof + gross-amount call JSON ready (downloaded).");
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function assertWalletNetworkOk(context: string) {
    const cid = await getChainIdHex();
    setWalletChain(cid);
    setChainId(String(Number.parseInt(cid, 16)));
    if (selectedPreset && !isActiveChainId(Number.parseInt(cid, 16))) {
      throw new Error(
        `switch wallet to chainId ${ACTIVE_NETWORK.chainId} (${ACTIVE_NETWORK.displayName})`
      );
    }
    assertExperimentalNetworkAllowed({
      chainId: cid,
      context,
    });
    return cid;
  }

  async function onConnectWallet() {
    setBusy(true);
    try {
      const addr = await connectWallet();
      const cid = await getChainIdHex();
      setAccount(addr);
      setWalletChain(cid);
      setChainId(String(Number.parseInt(cid, 16)));
      setWithdrawRecipient((current) => (current ? current : addr));
      try {
        assertExperimentalNetworkAllowed({ chainId: cid, context: "wallet connect" });
        if (!isActiveChainId(Number.parseInt(cid, 16))) {
          setOk(
            `Connected ${shortHex(addr)}. Switch wallet to ${ACTIVE_NETWORK.displayName} (chain ${ACTIVE_NETWORK.chainId}) — use Get tokens → Switch wallet to network.`
          );
        } else {
          setOk(`Connected ${shortHex(addr)} on ${ACTIVE_NETWORK.displayName}.`);
        }
      } catch (e) {
        setOk(`Connected ${shortHex(addr)} — this network is blocked.`);
        setErr(formatUserError(e));
      }
    } catch (e) {
      notifyCaught(e);
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnectWallet() {
    setBusy(true);
    try {
      await disconnectWallet();
      setAccount("");
      setWalletChain("");
      setOk(
        "Wallet disconnected. Connect again to choose the account that pays on-chain."
      );
    } catch (e) {
      setAccount("");
      setWalletChain("");
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSwitchToSepolia() {
    setBusy(true);
    try {
      const cid = await switchToSepolia();
      setWalletChain(cid);
      setChainId(String(Number.parseInt(cid, 16)));
      setOk("Wallet switched to Sepolia. Continue with mint or create notes.");
    } catch (e) {
      notifyCaught(e);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateProductNote() {
    setBusy(true);
    try {
      const amount = humanToBaseUnits(humanAmount, assetDecimals);
      setValue(amount.toString());
      const poseidon = await createCircomlibPoseidon();
      const { note, commitment } = await createNote({
        assetId: 1n,
        value: amount,
        poseidon,
      });
      if (!poolAddress || poolAddress.endsWith("000000000000000000000000")) {
        throw new Error("select an asset pool before creating a note");
      }
      const record: LocalNoteRecord = {
        version: note.version.toString(),
        assetId: note.assetId.toString(),
        value: note.value.toString(),
        spendingKey: note.spendingKey.toString(),
        nullifierKey: note.nullifierKey.toString(),
        blinding: note.blinding.toString(),
        commitment: commitment.toString(),
        statusHint: "unspent",
        poolAddress,
        assetSymbol,
      };
      if (!(await admitNotesAfterMandatorySave([record]))) return;
      const nextIndex = store.notes.length;
      setStore((prev) => ({ ...prev, notes: [...prev.notes, record] }));
      setSelectedNoteIndex(nextIndex);
      setOk(
        `Recovery Code ready (${humanAmount} ${assetSymbol}). Copy it like a seed phrase (file download optional), then deposit into this same ${assetSymbol} pool.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Drop undeposited session leftovers, then make two fresh notes with mandatory download. */
  async function onDiscardUnboundAndCreateTwo() {
    setBusy(true);
    try {
      const freshTotal = "200000000000000000";
      const freshParts = "100000000000000000,100000000000000000";
      setValue(freshTotal);
      setCustomAmounts(freshParts);
      const poseidon = await createCircomlibPoseidon();
      const { created, changeNote } = await createNotesFromCustomDistribution({
        total: freshTotal,
        amounts: freshParts,
        assetId: 1n,
        poseidon,
      });
      const all = changeNote ? [...created, changeNote] : created;
      const records: LocalNoteRecord[] = all.map(({ note, commitment }) => ({
        version: note.version.toString(),
        assetId: note.assetId.toString(),
        value: note.value.toString(),
        spendingKey: note.spendingKey.toString(),
        nullifierKey: note.nullifierKey.toString(),
        blinding: note.blinding.toString(),
        commitment: commitment.toString(),
        statusHint: "unspent",
      }));
      if (!(await admitNotesAfterMandatorySave(records))) return;
      let removed = 0;
      let freshStart = 0;
      setStore((prev) => {
        const kept = prev.notes.filter(
          (n) => n.statusHint === "spent" || n.leafIndex != null
        );
        removed = prev.notes.length - kept.length;
        freshStart = kept.length;
        return { ...prev, notes: [...kept, ...records] };
      });
      setProofBundle(null);
      setProvedSpendIndices(null);
      setSelectedSpendIndices([]);
      setSelectedNoteIndex(freshStart);
      setKeepNoteBacklog(false);
      purgeLegacyBrowserNoteStorage();
      setOk(
        `Removed ${removed} undeposited leftover note(s). Downloaded two fresh notes. Save the file, then deposit.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  function onSelectPoolOption(id: string) {
    const option = productPoolOptions.find((entry) => entry.id === id);
    if (!option) {
      setSelectedPresetId("");
      clearSpendProofContext();
      return;
    }
    setSelectedPresetId(id);
    setPoolAddress(option.pool);
    setTokenAddress(option.asset);
    setPoolRoot("");
    setPoolCount(null);
    clearSpendProofContext();
    setOk(`Selected ${option.label} pool.`);
  }

  async function onMintSepoliaTestToken() {
    setBusy(true);
    try {
      if (!account) throw new Error("connect wallet first");
      const cid = await getChainIdHex();
      setWalletChain(cid);
      if (!isActiveChainId(Number.parseInt(cid, 16))) {
        throw new Error(
          `Mint requires the active network (chainId ${ACTIVE_NETWORK.chainId})`
        );
      }
      if (!selectedPreset) {
        throw new Error("select a pool first");
      }
      if (selectedPreset.native || selectedPreset.asset === ZERO_ADDR) {
        throw new Error(
          "ETH is the native network currency — no mint. Fund your wallet with ETH, then Deposit."
        );
      }
      const amount = humanToBaseUnits(
        mintAmountHuman,
        selectedPreset.assetDecimals
      );
      const data = encodeMintCalldata({ recipient: account, amount });
      const tx = await sendTransaction({
        from: account,
        to: selectedPreset.asset,
        data,
        value: "0x0",
      });
      setLatestTx({
        label: `${selectedPreset.assetSymbol} mint`,
        hash: tx,
        state: "pending",
      });
      await waitReceipt(tx);
      setLatestTx({
        label: `${selectedPreset.assetSymbol} mint`,
        hash: tx,
        state: "confirmed",
      });
      setMintCompleted(true);
      setOk(
        `Mint confirmed for ${mintAmountHuman} ${assetSymbol}. You can add the token to MetaMask, then Deposit.`
      );
    } catch (e) {
      notifyCaught(e);
    } finally {
      setBusy(false);
    }
  }

  async function onWatchLabAsset() {
    setBusy(true);
    try {
      if (!selectedPreset) throw new Error("select a pool first");
      if (selectedPreset.native || selectedPreset.asset === ZERO_ADDR) {
        throw new Error("Native ETH is already in MetaMask — no token to add.");
      }
      const ok = await watchAsset({
        address: selectedPreset.asset,
        symbol: assetSymbol.slice(0, 11),
        decimals: selectedPreset.assetDecimals,
      });
      setOk(
        ok
          ? `${assetSymbol} suggested to MetaMask.`
          : "Wallet did not add the asset."
      );
    } catch (e) {
      notifyCaught(e);
    } finally {
      setBusy(false);
    }
  }

  function onUseLabPoolInApp(id: string) {
    onSelectPoolOption(id);
    setPage("deposit");
    setOk("Pool selected. Continue with Deposit.");
  }

  async function onReadPool() {
    setBusy(true);
    try {
      if (!poolAddress || poolAddress.length !== 42) {
        throw new Error("set a valid pool address first");
      }
      const assetRaw = await ethCall({
        to: poolAddress,
        data: SELECTOR_POOL_ASSET,
      });
      const asset = decodeAddressWord(assetRaw);
      setTokenAddress(asset);

      const sync = await refreshPoolAndBindNotes();
      setOk(
        `Read the ${assetSymbol} pool: ${sync.count} notes, ${sync.bound} of yours matched.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSyncBindNotes() {
    setBusy(true);
    try {
      if (!poolAddress || poolAddress.endsWith("000000000000000000000000")) {
        throw new Error("set the deployed pool address");
      }
      // Bind leaves + mark notes whose nullifier is already spent on-chain.
      const result = await scanNullifiersAgainstPool({
        pool: poolAddress,
        assetSymbol,
        notes: store.notes,
      });
      setPoolRoot(
        `0x${BigInt(result.poolRoot).toString(16).padStart(64, "0")}`
      );
      setPoolCount(result.poolCount);
      const health = poolHealthWarning(result.poolCount);
      setPoolHealth(
        `${poolHealthTier(result.poolCount)} · ${health.message}`
      );
      if (health.severity === "warn") {
        showPrivacyWarnings([health]);
      }
      setStore((prev) => ({ ...prev, notes: result.notes }));
      setOk(
        `Synced the ${assetSymbol} pool (${result.poolCount} notes). Checked ${result.checked} of your notes: ${result.newlySpent} newly spent, ${result.stillUnspent} still spendable.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Re-scan selected note(s); throw if already spent on-chain. */
  async function assertSelectedNotesUnspentOnChain(
    indices: number[]
  ): Promise<LocalNoteRecord[]> {
    const pool = poolForWitness();
    const result = await scanNullifiersAgainstPool({
      pool,
      assetSymbol,
      notes: store.notes,
    });
    setStore((prev) => ({ ...prev, notes: result.notes }));
    setPoolCount(result.poolCount);
    setPoolRoot(
      `0x${BigInt(result.poolRoot).toString(16).padStart(64, "0")}`
    );
    const fresh = indices.map((i) => result.notes[i]);
    for (const n of fresh) {
      if (!n) throw new Error("selected note missing after sync");
      if (n.statusHint === "spent") {
        throw new Error(
          "This note was already spent on-chain (nullifier used). It cannot be withdrawn again. Use a fresh unspent note, or the new Recovery Code from a prior partial withdraw."
        );
      }
    }
    return fresh as LocalNoteRecord[];
  }

  async function onScanNullifiers() {
    setBusy(true);
    try {
      if (!poolAddress || poolAddress.endsWith("000000000000000000000000")) {
        throw new Error("set the deployed pool address");
      }
      setOk("Scanning nullifiers against pool…");
      const result = await scanNullifiersAgainstPool({
        pool: poolAddress,
        notes: store.notes,
      });
      setPoolRoot(
        `0x${BigInt(result.poolRoot).toString(16).padStart(64, "0")}`
      );
      setPoolCount(result.poolCount);
      setStore((prev) => ({ ...prev, notes: result.notes }));
      setOk(
        `Nullifier scan: checked=${result.checked} newlySpent=${result.newlySpent} unspent=${result.stillUnspent} unbound=${result.unbound}`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onApproveAndDeposit(noteIndex = selectedNoteIndex) {
    setBusy(true);
    try {
      if (!account) throw new Error("connect wallet first");
      await assertWalletNetworkOk(
        isNativePool ? "native ETH deposit" : "approve + deposit"
      );
      if (!poolAddress || poolAddress.endsWith("000000000000000000000000")) {
        throw new Error("set the deployed pool address");
      }
      let token = tokenAddress;
      if (!token) {
        const assetRaw = await ethCall({
          to: poolAddress,
          data: SELECTOR_POOL_ASSET,
        });
        token = decodeAddressWord(assetRaw);
        setTokenAddress(token);
      }
      const nativeDeposit =
        isNativePool ||
        !token ||
        token.toLowerCase() === ZERO_ADDR;

      const selected = store.notes[noteIndex];
      if (!selected) throw new Error("select a note first");
      if (selected.statusHint === "spent") {
        throw new Error("selected note is already spent");
      }
      if (noteBoundToPool(selected, poolAddress)) {
        throw new Error("selected note is already deposited in this pool; pick an unbound note");
      }
      if (
        selected.poolAddress &&
        selected.poolAddress.toLowerCase() !== poolAddress.toLowerCase() &&
        selected.leafIndex != null
      ) {
        throw new Error(
          `this note belongs to the ${selected.assetSymbol ?? "other"} pool — switch asset back before depositing, or create a new note for ${assetSymbol}`
        );
      }
      const netValue = BigInt(selected.value);
      const gross = depositGrossFromNet(netValue, DEPOSIT_FEE_PPM);
      const fee = gross - netValue;
      if (
        !(await dialogs.confirmDeposit({
          netLabel: formatAssetAmount(netValue, assetDecimals, assetSymbol),
          feeLabel: formatAssetAmount(fee, assetDecimals, assetSymbol),
          grossLabel: formatAssetAmount(gross, assetDecimals, assetSymbol),
          native: nativeDeposit,
        }))
      ) {
        throw new Error("Cancelled — deposit was not started");
      }
      setSelectedNoteIndex(noteIndex);
      setOk("Building deposit proof in this tab…");
      const proof = await proveDepositDev(selected);
      const { amount, commitmentHex, payload, note, index } =
        buildDepositPayload(noteIndex, proof);
      setDepositJson(JSON.stringify(payload, null, 2));

      if (!nativeDeposit) {
        const balRaw = await ethCall({
          to: token,
          data: encodeBalanceOfCalldata(account),
        });
        const bal = BigInt(balRaw);
        if (bal < BigInt(amount)) {
          throw new Error(
            `Insufficient ${assetSymbol} balance: wallet has ${formatAssetAmount(bal, assetDecimals, assetSymbol)}, note needs ${formatAssetAmount(amount, assetDecimals, assetSymbol)}. Mint more ${assetSymbol} in Get tokens, then retry Deposit.`
          );
        }
        const approveData = encodeApproveCalldata({
          spender: poolAddress,
          amount,
        });
        const approveTx = await sendTransaction({
          from: account,
          to: token,
          data: approveData,
        });
        setLatestTx({
          label: "Token approval",
          hash: approveTx,
          state: "pending",
        });
        await waitReceipt(approveTx);
        setLatestTx({
          label: "Token approval",
          hash: approveTx,
          state: "confirmed",
        });
      }

      const depositData = encodeDepositCalldata({
        amount,
        newCommitments: [commitmentHex],
        tierCode: 0,
        proofA: proof.proofA,
        proofB: proof.proofB,
        proofC: proof.proofC,
      });
      const depositTx = await sendTransaction({
        from: account,
        to: poolAddress,
        data: depositData,
        value: nativeDeposit
          ? `0x${BigInt(amount).toString(16)}`
          : "0x0",
      });
      setLatestTx({
        label: nativeDeposit ? "ETH deposit" : "Deposit",
        hash: depositTx,
        state: "pending",
      });
      await waitReceipt(depositTx);
      setLatestTx({
        label: nativeDeposit ? "ETH deposit" : "Deposit",
        hash: depositTx,
        state: "confirmed",
      });

      // Deposit is on-chain; keep success even if local sync/download glitches.
      try {
        const sync = await refreshPoolAndBindNotes({
          preferCommitment: note.commitment,
        });
        let notesSnapshot: LocalNoteRecord[] = [];
        setStore((prev) => {
          const notes = prev.notes.map((n, i) =>
            i === index
              ? {
                  ...n,
                  depositedBy: account,
                  poolAddress,
                  assetSymbol,
                }
              : n
          );
          notesSnapshot = notes;
          return { ...prev, notes };
        });
        const depositedRecord = notesSnapshot[index];
        if (!depositedRecord || !noteBoundToPool(depositedRecord, poolAddress)) {
          setOk(
            `Deposit confirmed (${shortTx(depositTx)}) but this note is not in the ${assetSymbol} pool yet. Stay on ${assetSymbol} and click Sync pool. Do not re-deposit the same note.`
          );
          return;
        }
        const nextUnbound = notesSnapshot.findIndex(
          (n) => n.statusHint !== "spent" && !noteBoundToPool(n, poolAddress)
        );
        const depositChoice = await askExportPassphrase();
        if (depositChoice.cancelled) {
          setOk(
            `Deposit confirmed (${formatAssetAmount(depositedRecord.value, assetDecimals, assetSymbol)}). Backup refresh skipped — keep your Recovery Code.`
          );
        } else {
          const artifacts = await downloadSpendNotes(
            [depositedRecord],
            depositChoice.passphrase
          );
          if (artifacts) setBackupPanel(artifacts);
          setNotesSavedAck(true);
          if (nextUnbound >= 0) {
            setSelectedNoteIndex(nextUnbound);
            setOk(
              `Deposit confirmed. Copy the Recovery Code below, then deposit a second ${assetSymbol} note if you want merge later. Pool now has ${sync.count} notes.`
            );
          } else {
            setOk(
              `Deposit confirmed. Copy the Recovery Code below, then go to Withdraw when you are ready.`
            );
          }
        }
      } catch (syncErr) {
        setOk(
          `Deposit confirmed (${shortTx(depositTx)}). Local sync failed: ${formatUserError(syncErr)}. Click Sync pool — do not deposit the same note again.`
        );
      }
    } catch (e) {
      notifyCaught(e);
    } finally {
      setBusy(false);
    }
  }

  function requireSelectedSpendable(): { index: number; note: LocalNoteRecord } {
    if (!selectedIsSpendable || !selectedNote) {
      throw new Error("select an unspent note from the list");
    }
    return { index: selectedNoteIndex, note: selectedNote };
  }

  function requireTwoSpendable(): {
    indices: [number, number];
    notes: [LocalNoteRecord, LocalNoteRecord];
  } {
    if (!hasTwoSpendInputs) {
      throw new Error("select exactly two distinct unspent bound notes");
    }
    const indices = [...selectedSpendIndices] as [number, number];
    if (indices[0] === indices[1]) {
      throw new Error("input notes must be distinct");
    }
    const notes = indices.map((index) => store.notes[index]) as [
      LocalNoteRecord,
      LocalNoteRecord,
    ];
    if (
      notes.some(
        (note) => !poolAddress || !noteBoundToPool(note, poolAddress)
      )
    ) {
      throw new Error(
        "both selected notes must be deposited in the currently selected pool; switch asset / Sync pool"
      );
    }
    if (notes[0].commitment === notes[1].commitment) {
      throw new Error("duplicate input commitments are not allowed");
    }
    return { indices, notes };
  }

  function poolForWitness(): string {
    if (!poolAddress || poolAddress.endsWith("000000000000000000000000")) {
      throw new Error("revision-2 proving requires a deployed pool address");
    }
    return poolAddress;
  }

  async function onProveWithdraw() {
    setBusy(true);
    try {
      if (!withdrawRecipient.startsWith("0x") || withdrawRecipient.length !== 42) {
        throw new Error("recipient must be a 20-byte hex address");
      }
      const pool = poolForWitness();

      if (withdrawMode === "full") {
        const [note] = await assertSelectedNotesUnspentOnChain([
          selectedNoteIndex,
        ]);
        if (!note || !noteBoundToPool(note, pool)) {
          throw new Error("select one note deposited in the current pool");
        }
        setOk("Building withdraw proof in this tab…");
        const bundle = await proveWithdraw1Dev({
          note,
          recipient: withdrawRecipient,
          pool,
        });
        setWithdraw1Bundle(bundle);
        setWithdrawPartialBundle(null);
        setProofBundle(null);
        setProvedOneIndex(selectedNoteIndex);
        setProvedSpendIndices(null);
        adviseWithdrawPrivacy({
          amount: bundle.withdrawAmount,
          skipIndices: [selectedNoteIndex],
          depositBroadcaster: note.depositedBy,
          kind: "full",
        });
        setOk(
          `Proof ready for ${formatAssetAmount(bundle.withdrawAmount, assetDecimals, assetSymbol)}. Next: Silent send.`
        );
        return;
      }

      if (withdrawMode === "partial") {
        const [note] = await assertSelectedNotesUnspentOnChain([
          selectedNoteIndex,
        ]);
        if (!note || !noteBoundToPool(note, pool)) {
          throw new Error("select one note deposited in the current pool");
        }
        const amount = humanToBaseUnits(partialHumanAmount, assetDecimals);
        if (!(await explainPartialChangeNote(note, amount, "prepare"))) {
          throw new Error("Cancelled — proof was not started");
        }
        setOk("Building partial withdraw proof in this tab…");
        const bundle = await proveWithdrawPartialDev({
          note,
          recipient: withdrawRecipient,
          pool,
          withdrawAmount: amount,
          assetSymbol,
        });
        setWithdrawPartialBundle(bundle);
        setWithdraw1Bundle(null);
        setProofBundle(null);
        setProvedOneIndex(selectedNoteIndex);
        setProvedSpendIndices(null);
        adviseWithdrawPrivacy({
          amount: bundle.withdrawAmount,
          skipIndices: [selectedNoteIndex],
          depositBroadcaster: note.depositedBy,
          kind: "partial",
        });
        setOk(
          `Partial proof ready for ${formatAssetAmount(bundle.withdrawAmount, assetDecimals, assetSymbol)}. Next: Silent send or Send via wallet — that is when you save the new Recovery Code for the leftover.`
        );
        return;
      }

      const { indices } = requireTwoSpendable();
      const notes = (await assertSelectedNotesUnspentOnChain(indices)) as [
        LocalNoteRecord,
        LocalNoteRecord,
      ];
      setOk("Syncing the pool, then building the merge proof…");
      const bundle = await proveWithdrawDev({
        notes,
        recipient: withdrawRecipient,
        pool,
      });
      setProofBundle(bundle);
      setWithdraw1Bundle(null);
      setWithdrawPartialBundle(null);
      setProvedSpendIndices(indices);
      setProvedOneIndex(null);
      setStore((prev) => ({
        ...prev,
        notes: prev.notes.map((n, i) =>
          i === indices[0]
            ? { ...n, leafIndex: bundle.leafIndices[0] }
            : i === indices[1]
              ? { ...n, leafIndex: bundle.leafIndices[1] }
              : n
        ),
      }));
      adviseWithdrawPrivacy({
        amount: bundle.withdrawAmount,
        skipIndices: [...indices],
        depositBroadcaster: notes[0]?.depositedBy,
        kind: "merge",
      });
      setOk(
        `Merge proof ready for ${formatAssetAmount(bundle.withdrawAmount, assetDecimals, assetSymbol)}. Next: Silent send.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function buildWithdrawCalldata(proven?: {
    full?: Withdraw1DevProofBundle | null;
    partial?: WithdrawPartialDevProofBundle | null;
    merge?: WithdrawDevProofBundle | null;
  }): Promise<{
    label: string;
    data: string;
    mode: "full" | "partial" | "merge2";
  }> {
    if (!poolAddress || poolAddress.endsWith("000000000000000000000000")) {
      throw new Error("set the deployed pool address");
    }

    if (withdrawMode === "full") {
      const bundle = proven?.full ?? withdraw1Bundle;
      if (!bundle) throw new Error("Prove full withdraw first");
      const merkleRoot = BigInt(bundle.merkleRoot);
      const knownRootRaw = await ethCall({
        to: poolAddress,
        data: encodeIsKnownRootCalldata(merkleRoot),
      });
      if (!decodeBoolWord(knownRootRaw)) {
        throw new Error("withdraw proof root is unknown; Sync and prove again");
      }
      return {
        label: "Withdraw1",
        mode: "full",
        data: encodeWithdraw1Calldata({
          proofA: bundle.proofA,
          proofB: bundle.proofB,
          proofC: bundle.proofC,
          merkleRoot,
          nullifiers: withdraw1NullifierHex(bundle),
          recipient: withdraw1RecipientHex(bundle),
          amount: bundle.withdrawAmount,
          withdrawFee: bundle.withdrawFee,
        }),
      };
    }

    if (withdrawMode === "partial") {
      const bundle = proven?.partial ?? withdrawPartialBundle;
      if (!bundle) {
        throw new Error("Prove partial withdraw first (and save the change note)");
      }
      const merkleRoot = BigInt(bundle.merkleRoot);
      const knownRootRaw = await ethCall({
        to: poolAddress,
        data: encodeIsKnownRootCalldata(merkleRoot),
      });
      if (!decodeBoolWord(knownRootRaw)) {
        throw new Error("withdraw proof root is unknown; Sync and prove again");
      }
      return {
        label: "WithdrawPartial",
        mode: "partial",
        data: encodeWithdrawPartial1Calldata({
          proofA: bundle.proofA,
          proofB: bundle.proofB,
          proofC: bundle.proofC,
          merkleRoot,
          nullifiers: withdrawPartialNullifierHex(bundle),
          recipient: withdrawPartialRecipientHex(bundle),
          amount: bundle.withdrawAmount,
          outCommitment: toBytes32Hex(bundle.outCommitment),
          withdrawFee: bundle.withdrawFee,
        }),
      };
    }

    const bundle = proven?.merge ?? proofBundle;
    if (!bundle) {
      throw new Error(
        "No merge-withdraw proof in memory. Prove again after selecting two notes."
      );
    }
    const merkleRoot = BigInt(bundle.merkleRoot);
    const knownRootRaw = await ethCall({
      to: poolAddress,
      data: encodeIsKnownRootCalldata(merkleRoot),
    });
    if (!decodeBoolWord(knownRootRaw)) {
      throw new Error(
        "withdraw proof root is unknown or evicted; regenerate both witnesses against a retained root"
      );
    }
    return {
      label: "Withdraw",
      mode: "merge2",
      data: encodeWithdrawCalldata({
        proofA: bundle.proofA,
        proofB: bundle.proofB,
        proofC: bundle.proofC,
        merkleRoot,
        nullifiers: withdrawNullifierHexes(bundle),
        recipient: recipientHex(bundle),
        amount: bundle.withdrawAmount,
        withdrawFee: bundle.withdrawFee,
      }),
    };
  }

  async function finalizeWithdrawSuccess(params: {
    mode: "full" | "partial" | "merge2";
    label: string;
    tx: string;
    via: "wallet" | "relayer";
    spentIndex?: number | null;
    spentIndices?: number[] | null;
    changeNote?: LocalNoteRecord | null;
  }) {
    const tx = shortTx(params.tx);
    const silent = params.via === "relayer";
    if (params.mode === "full") {
      const idx = params.spentIndex ?? provedOneIndex;
      if (idx == null) throw new Error("proved note index lost");
      setStore((prev) => ({
        ...prev,
        notes: prev.notes.map((n, i) =>
          i === idx ? { ...n, statusHint: "spent" } : n
        ),
      }));
      setWithdraw1Bundle(null);
      setProvedOneIndex(null);
      setOk(
        silent
          ? `Silent send confirmed (${tx}). Funds are on the way. This tab never sent note secrets.`
          : `Withdraw confirmed (${tx}). This note is spent.`
      );
      return;
    }
    if (params.mode === "partial") {
      const idx = params.spentIndex ?? provedOneIndex;
      const change = params.changeNote ?? withdrawPartialBundle?.changeNote;
      if (idx == null) throw new Error("proved note index lost");
      if (!change) throw new Error("partial bundle missing");
      setStore((prev) => ({
        ...prev,
        notes: [
          ...prev.notes.map((n, i) =>
            i === idx ? { ...n, statusHint: "spent" } : n
          ),
          change,
        ],
      }));
      setWithdrawPartialBundle(null);
      setProvedOneIndex(null);
      const sync = await refreshPoolAndBindNotes({
        preferCommitment: change.commitment,
      });
      setOk(
        silent
          ? `Silent partial send confirmed (${tx}). The leftover is in the pool — keep the new Recovery Code. Pool now has ${sync.count} notes.`
          : `Partial withdraw confirmed (${tx}). The leftover is in the pool — keep the new Recovery Code. Pool now has ${sync.count} notes.`
      );
      return;
    }
    const spent = new Set(params.spentIndices ?? provedSpendIndices ?? []);
    if (spent.size === 0) {
      throw new Error("proved input selection was lost; refusing local state update");
    }
    setStore((prev) => ({
      ...prev,
      notes: prev.notes.map((n, i) =>
        spent.has(i) ? { ...n, statusHint: "spent" } : n
      ),
    }));
    setProofBundle(null);
    setProvedSpendIndices(null);
    setSelectedSpendIndices([]);
    setOk(
      silent
        ? `Silent merge confirmed (${tx}). Both notes are spent.`
        : `Merge withdraw confirmed (${tx}). Both notes are spent.`
    );
  }

  async function onSendWithdraw() {
    setBusy(true);
    try {
      if (!account) throw new Error("connect wallet first (top right)");
      await assertWalletNetworkOk("send withdraw");
      if (withdrawMode === "partial") {
        const note = store.notes[selectedNoteIndex];
        if (!note || !withdrawPartialBundle) {
          throw new Error("Prove partial withdraw first");
        }
        const amount = humanToBaseUnits(partialHumanAmount, assetDecimals);
        if (!(await explainPartialChangeNote(note, amount, "send"))) {
          throw new Error("Cancelled — send was not started");
        }
        const changeNote = withdrawPartialBundle.changeNote;
        if (!(await saveChangeNoteOrCancel(changeNote))) {
          throw new Error("Cancelled — save the new Recovery Code before this send");
        }
        setOk("Opening MetaMask for withdraw — confirm the transaction…");
        const built = await buildWithdrawCalldata();
        const tx = await sendTransaction({
          from: account,
          to: poolAddress,
          data: built.data,
        });
        setLatestTx({ label: built.label, hash: tx, state: "pending" });
        await waitReceipt(tx);
        setLatestTx({ label: built.label, hash: tx, state: "confirmed" });
        await finalizeWithdrawSuccess({
          mode: built.mode,
          label: built.label,
          tx,
          via: "wallet",
          spentIndex: selectedNoteIndex,
          changeNote,
        });
        return;
      }
      setOk("Opening MetaMask for withdraw — confirm the transaction…");
      const built = await buildWithdrawCalldata();
      const tx = await sendTransaction({
        from: account,
        to: poolAddress,
        data: built.data,
      });
      setLatestTx({ label: built.label, hash: tx, state: "pending" });
      await waitReceipt(tx);
      setLatestTx({ label: built.label, hash: tx, state: "confirmed" });
      await finalizeWithdrawSuccess({
        mode: built.mode,
        label: built.label,
        tx,
        via: "wallet",
        spentIndex: selectedNoteIndex,
        spentIndices: selectedSpendIndices,
      });
    } catch (e) {
      notifyCaught(e);
    } finally {
      setBusy(false);
    }
  }

  function recipientMatchesProof(bundleRecipient: string): boolean {
    try {
      return (
        `0x${BigInt(bundleRecipient).toString(16).padStart(40, "0")}`.toLowerCase() ===
        withdrawRecipient.toLowerCase()
      );
    } catch {
      return false;
    }
  }

  async function onSilentSendWithdraw() {
    setBusy(true);
    try {
      if (!withdrawRecipient.startsWith("0x") || withdrawRecipient.length !== 42) {
        throw new Error("recipient must be a 20-byte hex address");
      }
      const pool = poolForWitness();
      let extraFee = await estimateSilentExtraFee(isNativePool);
      if (extraFee < 1n) extraFee = 1n;

      let proven: {
        full?: Withdraw1DevProofBundle | null;
        partial?: WithdrawPartialDevProofBundle | null;
        merge?: WithdrawDevProofBundle | null;
      } = {};

      if (withdrawMode === "full") {
        const [note] = await assertSelectedNotesUnspentOnChain([
          selectedNoteIndex,
        ]);
        if (!note || !noteBoundToPool(note, pool)) {
          throw new Error("select one note deposited in the current pool");
        }
        const reuse =
          withdraw1Bundle &&
          provedOneIndex === selectedNoteIndex &&
          recipientMatchesProof(withdraw1Bundle.recipient) &&
          hasSilentRelayerTip(
            withdraw1Bundle.withdrawFee,
            withdraw1Bundle.withdrawAmount
          );
        let bundle = withdraw1Bundle;
        if (!reuse) {
          setOk(
            "Building Silent send proof (includes the relayer gas tip from the note)…"
          );
          bundle = await proveWithdraw1Dev({
            note,
            recipient: withdrawRecipient,
            pool,
            extraFee,
          });
        }
        if (!bundle) throw new Error("Prove full withdraw first");
        setWithdraw1Bundle(bundle);
        setWithdrawPartialBundle(null);
        setProofBundle(null);
        setProvedOneIndex(selectedNoteIndex);
        setProvedSpendIndices(null);
        proven = { full: bundle };
      } else if (withdrawMode === "partial") {
        const [note] = await assertSelectedNotesUnspentOnChain([
          selectedNoteIndex,
        ]);
        if (!note || !noteBoundToPool(note, pool)) {
          throw new Error("select one note deposited in the current pool");
        }
        const amount = humanToBaseUnits(partialHumanAmount, assetDecimals);
        if (!(await explainPartialChangeNote(note, amount, "send"))) {
          throw new Error("Cancelled — send was not started");
        }
        const reuse =
          withdrawPartialBundle &&
          provedOneIndex === selectedNoteIndex &&
          recipientMatchesProof(withdrawPartialBundle.recipient) &&
          withdrawPartialBundle.withdrawAmount === amount.toString() &&
          hasSilentRelayerTip(
            withdrawPartialBundle.withdrawFee,
            withdrawPartialBundle.withdrawAmount
          );
        let bundle = withdrawPartialBundle;
        if (!reuse) {
          setOk(
            "Building Silent send proof (includes the relayer gas tip from the note)…"
          );
          bundle = await proveWithdrawPartialDev({
            note,
            recipient: withdrawRecipient,
            pool,
            withdrawAmount: amount,
            assetSymbol,
            extraFee,
          });
        }
        if (!bundle) throw new Error("Prove partial withdraw first");
        if (!(await saveChangeNoteOrCancel(bundle.changeNote))) {
          throw new Error("Cancelled — save the new Recovery Code before Silent send");
        }
        setWithdrawPartialBundle(bundle);
        setWithdraw1Bundle(null);
        setProofBundle(null);
        setProvedOneIndex(selectedNoteIndex);
        setProvedSpendIndices(null);
        proven = { partial: bundle };
      } else {
        const { indices } = requireTwoSpendable();
        const notes = (await assertSelectedNotesUnspentOnChain(indices)) as [
          LocalNoteRecord,
          LocalNoteRecord,
        ];
        const reuse =
          proofBundle &&
          provedSpendIndices != null &&
          provedSpendIndices.length === 2 &&
          ((provedSpendIndices[0] === indices[0] &&
            provedSpendIndices[1] === indices[1]) ||
            (provedSpendIndices[0] === indices[1] &&
              provedSpendIndices[1] === indices[0])) &&
          recipientMatchesProof(proofBundle.recipient) &&
          hasSilentRelayerTip(proofBundle.withdrawFee, proofBundle.withdrawAmount);
        let bundle = proofBundle;
        if (!reuse) {
          setOk(
            "Building Silent send proof (includes the relayer gas tip from the note)…"
          );
          bundle = await proveWithdrawDev({
            notes,
            recipient: withdrawRecipient,
            pool,
            extraFee,
          });
        }
        if (!bundle) throw new Error("Prove merge withdraw first");
        setProofBundle(bundle);
        setWithdraw1Bundle(null);
        setWithdrawPartialBundle(null);
        setProvedSpendIndices(indices);
        setProvedOneIndex(null);
        proven = { merge: bundle };
      }

      setOk("Sending calldata to the local relayer…");
      const built = await buildWithdrawCalldata(proven);
      const { txHash } = await relayWithdrawCalldata({
        to: poolAddress,
        data: built.data,
      });
      setLatestTx({ label: `${built.label}-silent`, hash: txHash, state: "pending" });
      await waitReceipt(txHash);
      setLatestTx({
        label: `${built.label}-silent`,
        hash: txHash,
        state: "confirmed",
      });
      await finalizeWithdrawSuccess({
        mode: built.mode,
        label: built.label,
        tx: txHash,
        via: "relayer",
        spentIndex: selectedNoteIndex,
        spentIndices:
          withdrawMode === "merge2" ? [...selectedSpendIndices] : null,
        changeNote: proven.partial?.changeNote ?? null,
      });
    } catch (e) {
      const msg = formatUserError(e);
      if (/fetch|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) {
        setErr(
          `Silent send needs the local relayer at http://127.0.0.1:8787. Start it, then try again. ${msg}`
        );
      } else if (/fee too low/i.test(msg)) {
        setErr(
          "Silent send needs a gas tip from the note above the 0.04% protocol fee. Wait for the proof to finish, then try Silent send once."
        );
      } else if (/execution reverted|unknown reason/i.test(msg)) {
        setErr(
          `${msg} — This note was probably already spent. Click Sync pool, then use an unspent note or the new Recovery Code from a partial withdraw.`
        );
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onLockVault() {
    setBusy(true);
    try {
      if (passphrase.length < 8) throw new Error("passphrase must be ≥ 8 chars");
      if (store.notes.length === 0) throw new Error("no session notes to encrypt");
      const envelope = encryptBackup({
        passphrase,
        payload: {
          notes: notesFromLocalStore(store.notes),
          meta: {
            lastScannedBlock: 0,
            client: "web",
            clientVersion: "0.0.1",
          },
        },
        chainId: Number(chainId),
        poolAddress,
        asset: selectedPreset?.assetSymbol ?? "TOKEN",
      });
      downloadJson("backup.apbackup", envelope);
      setStore(emptyNotesStore());
      setNotesSavedAck(true);
      setUnlocked(false);
      purgeLegacyBrowserNoteStorage();
      setOk(
        "Encrypted .apbackup downloaded. Session notes cleared from this tab. Nothing kept in the browser."
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onExportBackup() {
    setBusy(true);
    try {
      if (passphrase.length < 8) throw new Error("passphrase must be ≥ 8 chars");
      if (store.notes.length === 0) throw new Error("no session notes to export");
      const envelope = encryptBackup({
        passphrase,
        payload: {
          notes: notesFromLocalStore(store.notes),
          meta: {
            lastScannedBlock: 0,
            client: "web",
            clientVersion: "0.0.1",
          },
        },
        chainId: Number(chainId),
        poolAddress,
        asset: selectedPreset?.assetSymbol ?? "TOKEN",
      });
      downloadJson("backup.apbackup", envelope);
      setNotesSavedAck(true);
      setOk("Encrypted backup downloaded. Keep that file offline.");
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onImportBackup(file: File) {
    setBusy(true);
    try {
      if (passphrase.length < 8) throw new Error("passphrase must be ≥ 8 chars");
      const text = await file.text();
      const envelope = JSON.parse(text) as BackupEnvelope;
      assertBackupEnvelope(envelope);
      const payload = decryptBackup(envelope, passphrase);
      const notes = notesToLocalStore(payload.notes) as LocalNoteRecord[];
      setStore({
        format: "absolute-privacy-notes-local",
        version: 1,
        notes,
      });
      setUnlocked(true);
      setNotesSavedAck(true);
      purgeLegacyBrowserNoteStorage();
      setOk(
        `Imported ${notes.length} note(s) into this tab only. Run Scan nullifiers before spending.`
      );
    } catch (e) {
      setErr(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    if (store.notes.length > 0) {
      const ok = await dialogs.confirmLeavePage(
        snapshotSessionNotes(store.notes, assetDecimals, assetSymbol),
        "clear",
      );
      if (!ok) return;
    }
    scrubNoteSecretsInPlace(store.notes);
    clearLocalSecrets();
    setStore(emptyNotesStore());
    setDepositJson("");
    setWithdraw1Bundle(null);
    setWithdrawPartialBundle(null);
    setProofBundle(null);
    setBackupPanel(null);
    setUnlocked(true);
    setNotesSavedAck(false);
    setOk("This tab is empty now. Deposits in the pool are unchanged.");
  }

  // Advanced handlers remain available for future Extra tools; keep referenced.
  void onCreateNote;
  void onCreateSplitNotes;
  void onCreateCustomDistribute;
  void onExportOwnershipDisclosure;
  void onAcceptIncomingNote;
  void onMailboxScanFiles;
  void onExportViewKeyAndPackage;
  void onDeliverIncomingNote;
  void onExportClaimStub;
  void onProveOwnershipDev;
  void onProveValueBoundDev;
  void onBuildDeposit;
  void onDiscardUnboundAndCreateTwo;
  void onReadPool;
  void onScanNullifiers;
  void onLockVault;
  void valueBoundThreshold;
  void setValueBoundThreshold;
  void deliveryKeyJson;
  void depositJson;
  void poolRoot;
  void poolCount;
  void poolHealth;
  void notesSavedAck;
  void mintCompleted;
  void keepNoteBacklog;
  void customAmounts;
  void setCustomAmounts;
  void value;
  void tokenAddress;

  return (
    <>
      <AppDialogHost request={dialogs.request} />
      <ProductShell
      page={page}
      onPage={setPage}
      busy={busy}
      statusText={status.text}
      statusKind={status.kind}
      statusNonce={status.at}
      account={account}
      chainId={chainId}
      walletChain={walletChain}
      poolOptions={productPoolOptions}
      selectedPoolId={selectedPresetId}
      onSelectPool={onSelectPoolOption}
      poolAddress={poolAddress}
      tokenAddress={tokenAddress}
      assetSymbol={assetSymbol}
      assetDecimals={assetDecimals}
      noteEntries={noteEntries}
      selectedNoteIndex={selectedNoteIndex}
      onSelectNote={setSelectedNoteIndex}
      selectedSpendIndices={selectedSpendIndices}
      onToggleSpend={(index) => {
        const current = selectedSpendIndices;
        const next = current.includes(index)
          ? current.filter((entry) => entry !== index)
          : [...current, index].slice(0, 2);
        const proved = provedSpendIndices;
        const sameAsProved =
          proved != null &&
          next.length === 2 &&
          ((next[0] === proved[0] && next[1] === proved[1]) ||
            (next[0] === proved[1] && next[1] === proved[0]));
        if (!sameAsProved) {
          setProofBundle(null);
          setWithdraw1Bundle(null);
          setWithdrawPartialBundle(null);
          setProvedSpendIndices(null);
          setProvedOneIndex(null);
        }
        setSelectedSpendIndices(next);
      }}
      hasTwoSpendInputs={hasTwoSpendInputs}
      unboundCount={unboundUnspent.length}
      boundCount={boundUnspent.length}
      humanAmount={humanAmount}
      onHumanAmount={setHumanAmount}
      withdrawRecipient={withdrawRecipient}
      onWithdrawRecipient={setWithdrawRecipient}
      withdrawMode={withdrawMode}
      onWithdrawMode={(m) => {
        setWithdrawMode(m);
        clearSpendProofContext();
        setPrivacyHints([]);
      }}
      partialHumanAmount={partialHumanAmount}
      onPartialHumanAmount={setPartialHumanAmount}
      recipientPubkey={recipientPubkey}
      onRecipientPubkey={setRecipientPubkey}
      passphrase={passphrase}
      onPassphrase={setPassphrase}
      latestTx={latestTx}
      proofReady={
        withdrawMode === "full"
          ? !!withdraw1Bundle
          : withdrawMode === "partial"
            ? !!withdrawPartialBundle
            : !!proofBundle
      }
      privacyHints={privacyHints}
      onConnect={() => void onConnectWallet()}
      onDisconnect={() => void onDisconnectWallet()}
      selectedNetwork="sepolia"
      onSelectNetwork={(id) => {
        if (id === "mainnet") {
          setErr(
            "Ethereum mainnet is not published yet. Sepolia is the live test network."
          );
          return;
        }
        if (!account) {
          setOk(
            "Sepolia is the live test network. Connect a wallet to switch MetaMask to it."
          );
          return;
        }
        void onSwitchToSepolia();
      }}
      onCreateAndDownload={() => void onCreateProductNote()}
      onImportNotes={(file) => void onImportSpendNotesFile(file)}
      onImportRecoveryCode={(code) => void handleImportRecoveryCode(code)}
      recoveryPaste={recoveryPaste}
      onRecoveryPaste={setRecoveryPaste}
      backupArtifacts={backupPanel}
      onConfirmRecoverySaved={() => {
        setBackupPanel(null);
        setOk(
          "Recovery Code saved acknowledgment recorded. Keep the code + password offline."
        );
      }}
      onCopyRecoveryCode={async () => {
        if (!backupPanel) return false;
        try {
          await navigator.clipboard.writeText(backupPanel.recoveryCode);
          setOk(
            "Recovery Code copied — paste into a safe offline place, then clear clipboard."
          );
          return true;
        } catch {
          setErr(
            "Could not copy automatically — reveal the code and copy it manually."
          );
          return false;
        }
      }}
      onRedownloadApnote={() => {
        if (!backupPanel) return;
        downloadBackupFile(backupPanel);
        setOk(
          backupPanel.encrypted
            ? "Optional .apnote file downloaded — Recovery Code remains primary."
            : "Optional note file downloaded — Recovery Code remains primary."
        );
      }}
      onDeposit={() => {
        const idx =
          selectedIsSpendable && selectedNote && selectedNote.leafIndex == null
            ? selectedNoteIndex
            : unboundUnspent[0]?.index;
        if (idx == null) {
          setErr("Create or import an undeposited note first");
          return;
        }
        void onApproveAndDeposit(idx);
      }}
      onSync={() => void onSyncBindNotes()}
      onProveWithdraw={() => void onProveWithdraw()}
      onSendWithdraw={() => {
        if (!account) {
          setErr(
            "Wallet send needs Connect (top right). Or use Silent send (relayer) without a wallet."
          );
          return;
        }
        const ready =
          withdrawMode === "full"
            ? !!withdraw1Bundle
            : withdrawMode === "partial"
              ? !!withdrawPartialBundle
              : !!proofBundle;
        if (!ready) {
          setErr("Prove withdraw first for the selected mode, then Send.");
          return;
        }
        void onSendWithdraw();
      }}
      onSilentSendWithdraw={() => {
        const ready =
          withdrawMode === "full"
            ? !!withdraw1Bundle
            : withdrawMode === "partial"
              ? !!withdrawPartialBundle
              : !!proofBundle;
        if (!ready) {
          setErr("Prove withdraw first, then Silent send.");
          return;
        }
        void onSilentSendWithdraw();
      }}
      onGenRecipientKeys={onGenerateRecipientKeys}
      onExportBackup={() => void onExportBackup()}
      onImportBackup={(file) => void onImportBackup(file)}
      onClearSession={onClear}
      onRedownloadNotes={() => {
        void (async () => {
          if (!(await dialogs.confirmSaveNotes(store.notes.length))) return;
          const exportChoice = await askExportPassphrase();
          if (exportChoice.cancelled) {
            setErr("Cancelled — backup was not created.");
            return;
          }
          const artifacts = await downloadSpendNotes(
            store.notes,
            exportChoice.passphrase
          );
          if (artifacts) setBackupPanel(artifacts);
          setNotesSavedAck(true);
          setOk(
            "Recovery Code ready below — copy it (like a seed phrase). File download is optional."
          );
        })();
      }}
      labPools={productPoolOptions}
      mintAmountHuman={mintAmountHuman}
      onMintAmountHuman={setMintAmountHuman}
      onSwitchSepolia={() => void onSwitchToSepolia()}
      onMint={() => void onMintSepoliaTestToken()}
      onWatchAsset={() => void onWatchLabAsset()}
      onUseLabPoolInApp={onUseLabPoolInApp}
    />
    </>
  );
}
