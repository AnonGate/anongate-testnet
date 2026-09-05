import { useEffect, useState, type ReactNode } from "react";
import type { LocalNoteRecord, SealedBackupArtifacts } from "./storage";
import { baseUnitsToHuman } from "./amountFormat";
import { shortHex } from "./guideLogic";
import { ACTIVE_NETWORK, type ProductNetworkId } from "./networkConfig";
import { RecoveryBackupModal } from "./RecoveryBackupModal";
import { AssetPoolSelect } from "./AssetPoolSelect";
import { NetworkSelect } from "./NetworkSelect";
import { StatusToasts } from "./StatusToasts";
import { PrivacyField } from "./PrivacyField";
import { HelpTip, LabelWithHelp } from "./HelpTip";

export type AppPage = "deposit" | "withdraw" | "recover" | "lab";

export type PoolOption = {
  id: string;
  name: string;
  label: string;
  symbol: string;
  decimals: number;
  pool: string;
  asset: string;
  native?: boolean;
  source: "active" | "mainnet";
};

type NoteEntry = { n: LocalNoteRecord; index: number };

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
      </svg>
    </span>
  );
}

function ActionPair(props: { children: ReactNode }) {
  return <span className="action-pair">{props.children}</span>;
}

function ExplorerLink(props: { href: string; label: string }) {
  return (
    <a
      className="explorer-link"
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={props.label}
      title={props.label}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.2 3.5H4.2A1.7 1.7 0 0 0 2.5 5.2v6.6A1.7 1.7 0 0 0 4.2 13.5h6.6a1.7 1.7 0 0 0 1.7-1.7V9.8" />
        <path d="M9.2 2.5h4.3V6.8M8.6 7.4 13.5 2.5" />
      </svg>
    </a>
  );
}

function commitLabel(commitment: string): string {
  try {
    return shortHex(`0x${BigInt(commitment).toString(16)}`, 6, 4);
  } catch {
    return shortHex(commitment, 6, 4);
  }
}

export type ProductUiProps = {
  page: AppPage;
  onPage: (page: AppPage) => void;
  busy: boolean;
  statusText: string;
  statusKind: "idle" | "ok" | "err";
  statusNonce: number;
  account: string;
  chainId: string;
  walletChain: string;
  poolOptions: PoolOption[];
  selectedPoolId: string;
  onSelectPool: (id: string) => void;
  poolAddress: string;
  tokenAddress: string;
  assetSymbol: string;
  assetDecimals: number;
  noteEntries: NoteEntry[];
  selectedNoteIndex: number;
  onSelectNote: (index: number) => void;
  selectedSpendIndices: number[];
  onToggleSpend: (index: number) => void;
  hasTwoSpendInputs: boolean;
  unboundCount: number;
  boundCount: number;
  humanAmount: string;
  onHumanAmount: (v: string) => void;
  withdrawRecipient: string;
  onWithdrawRecipient: (v: string) => void;
  withdrawMode: "full" | "partial" | "merge2";
  onWithdrawMode: (m: "full" | "partial" | "merge2") => void;
  partialHumanAmount: string;
  onPartialHumanAmount: (v: string) => void;
  recipientPubkey: string;
  onRecipientPubkey: (v: string) => void;
  passphrase: string;
  onPassphrase: (v: string) => void;
  latestTx: { label: string; hash: string; state: string } | null;
  proofReady: boolean;
  privacyHints: string[];
  onConnect: () => void;
  onDisconnect: () => void;
  onCreateAndDownload: () => void;
  onImportNotes: (file: File) => void;
  onImportRecoveryCode: (code: string) => void;
  recoveryPaste: string;
  onRecoveryPaste: (v: string) => void;
  backupArtifacts: SealedBackupArtifacts | null;
  onConfirmRecoverySaved: () => void;
  onCopyRecoveryCode: () => Promise<boolean>;
  onRedownloadApnote: () => void;
  onDeposit: () => void;
  onSync: () => void;
  onProveWithdraw: () => void;
  onSendWithdraw: () => void;
  onSilentSendWithdraw: () => void;
  onGenRecipientKeys: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onClearSession: () => void;
  onRedownloadNotes: () => void;
  selectedNetwork: ProductNetworkId;
  onSelectNetwork: (id: ProductNetworkId) => void;
  labPools: PoolOption[];
  mintAmountHuman: string;
  onMintAmountHuman: (v: string) => void;
  onSwitchSepolia: () => void;
  onMint: () => void;
  onWatchAsset: () => void;
  onUseLabPoolInApp: (id: string) => void;
};

/** Shared restore UX: Recovery Code primary; .apnote file optional. */
function RestoreNotesPanel(props: {
  idPrefix: string;
  busy: boolean;
  recoveryPaste: string;
  onRecoveryPaste: (v: string) => void;
  onImportRecoveryCode: (code: string) => void;
  onImportNotes: (file: File) => void;
  title?: string;
  subtitle?: string;
  folded?: boolean;
}) {
  const heading = props.title ?? "Restore notes into this tab";
  const hint =
    props.subtitle ??
    "Paste your Recovery Code (primary). File upload is optional.";

  const fields = (
    <>
      <div className="field">
        <LabelWithHelp
          htmlFor={`${props.idPrefix}-recovery`}
          tipKey="recoveryCode"
          extra={<span className="chip-primary">Primary</span>}
        >
          Recovery Code
        </LabelWithHelp>
        <textarea
          id={`${props.idPrefix}-recovery`}
          className="recovery-input"
          rows={3}
          placeholder="AP1-XXXXXXXX-…"
          value={props.recoveryPaste}
          onChange={(e) => props.onRecoveryPaste(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={props.busy || !props.recoveryPaste.trim()}
          onClick={() => props.onImportRecoveryCode(props.recoveryPaste)}
        >
          Import Recovery Code
        </button>
      </div>

      <details className="fold-panel fold-panel-sub">
        <summary>
          <span className="fold-panel-text">
            <span className="fold-panel-title">
              Optional: .apnote file <HelpTip tipKey="optionalApnote" />
            </span>
            <span className="fold-panel-hint">
              Same payload as the Recovery Code, if that is what you saved.
            </span>
          </span>
          <span className="fold-panel-mark" aria-hidden />
        </summary>
        <div className="fold-panel-body">
          <div className="actions">
            <ActionPair>
              <label className="btn secondary file">
                Upload .apnote file
                <input
                  type="file"
                  accept=".apnote,.apnote.sealed.json,.json,.apnote.json,application/octet-stream,application/json"
                  hidden
                  disabled={props.busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) props.onImportNotes(f);
                  }}
                />
              </label>
              <HelpTip tipKey="optionalApnote" />
            </ActionPair>
          </div>
        </div>
      </details>
    </>
  );

  if (!props.folded) {
    return (
      <div className="restore-panel">
        <div className="restore-panel-head">
          <h3>
            {heading} <HelpTip tipKey="tabRecover" />
          </h3>
          <p>{hint}</p>
        </div>
        {fields}
      </div>
    );
  }

  return (
    <details
      className="fold-panel"
      defaultOpen={Boolean(props.recoveryPaste.trim())}
    >
      <summary
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".help-tip")) e.preventDefault();
        }}
      >
        <span className="fold-panel-text">
          <span className="fold-panel-title">
            {heading} <HelpTip tipKey="tabRecover" />
          </span>
          <span className="fold-panel-hint">{hint}</span>
        </span>
        <span className="fold-panel-mark" aria-hidden />
      </summary>
      <div className="fold-panel-body">{fields}</div>
    </details>
  );
}

function NoteCards(props: {
  notes: NoteEntry[];
  selectedNoteIndex: number;
  selectedSpendIndices: number[];
  assetSymbol: string;
  poolAddress: string;
  decimals: number;
  mode: "single" | "spend";
  onSelectNote: (index: number) => void;
  onToggleSpend: (index: number) => void;
}) {
  if (props.notes.length === 0) {
    return (
      <p className="meta empty-notes">
        No notes in this session yet. Create a Recovery Code, or restore one
        below.
      </p>
    );
  }
  return (
    <div className="notes">
      {props.notes.map(({ n, index }) => {
        const spent = n.statusHint === "spent";
        const symbol = n.assetSymbol || props.assetSymbol;
        const samePool =
          !n.poolAddress ||
          !props.poolAddress ||
          n.poolAddress.toLowerCase() === props.poolAddress.toLowerCase();
        const boundHere = n.leafIndex != null && samePool;
        const boundElsewhere =
          n.leafIndex != null && !samePool && !!n.poolAddress;
        const selected = index === props.selectedNoteIndex;
        const checked = props.selectedSpendIndices.includes(index);
        const status = spent
          ? "spent"
          : boundHere
            ? `in ${symbol} pool · leaf ${n.leafIndex}`
            : boundElsewhere
              ? `in ${symbol} pool · switch asset to use`
              : "not deposited";
        const ops =
          spent || !boundHere
            ? "—"
            : "Full · Partial · Merge";
        const body = (
          <>
            <span className="note-top">
              <strong>
                {baseUnitsToHuman(n.value, props.decimals)} {symbol}
              </strong>
              <span className={`pill ${spent ? "is-spent" : boundHere ? "is-live" : "is-wait"}`}>
                {status}
              </span>
            </span>
            <span className="note-bottom">
              <span className="meta">#{index} · {ops}</span>
              <code>{commitLabel(n.commitment)}</code>
            </span>
          </>
        );
        if (props.mode === "spend") {
          return (
            <div key={`${n.commitment}-${index}`} className="note-row">
              <label className="spend-toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    spent ||
                    !boundHere ||
                    (!checked && props.selectedSpendIndices.length >= 2)
                  }
                  onChange={() => props.onToggleSpend(index)}
                />
                use
              </label>
              <button
                type="button"
                className={`note ${selected ? "selected" : ""} ${spent ? "spent" : ""}`}
                disabled={spent}
                onClick={() => props.onSelectNote(index)}
              >
                {body}
              </button>
            </div>
          );
        }
        return (
          <button
            key={`${n.commitment}-${index}`}
            type="button"
            className={`note ${selected ? "selected" : ""} ${spent ? "spent" : ""}`}
            disabled={spent}
            onClick={() => props.onSelectNote(index)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function PoolBar(props: ProductUiProps) {
  return (
    <div className="pool-bar">
      <div className="field pool-bar-select">
        <LabelWithHelp htmlFor="assetPool" tipKey="assetPool">
          Asset pool
        </LabelWithHelp>
        <AssetPoolSelect
          id="assetPool"
          options={props.poolOptions}
          value={props.selectedPoolId}
          onChange={props.onSelectPool}
        />
      </div>
      <div className="stat-row">
        <span className="stat">
          <span className="stat-k">
            Pool <HelpTip tipKey="poolAddress" />
            {props.poolAddress &&
            props.poolAddress.startsWith("0x") &&
            props.poolAddress.length === 42 &&
            !/^0x0+$/i.test(props.poolAddress) ? (
              <ExplorerLink
                href={ACTIVE_NETWORK.explorerAddress(props.poolAddress)}
                label="Open pool contract in explorer"
              />
            ) : null}
          </span>
          <strong>
            {props.poolAddress ? shortHex(props.poolAddress, 8, 6) : "—"}
          </strong>
        </span>
        <span className="stat">
          <span className="stat-k">Token</span>
          <strong>{props.assetSymbol}</strong>
        </span>
        <span className="stat">
          <span className="stat-k">
            In pool <HelpTip tipKey="inPool" />
          </span>
          <strong>{props.boundCount}</strong>
        </span>
        <span className="stat">
          <span className="stat-k">
            Ready <HelpTip tipKey="readyToDeposit" />
          </span>
          <strong>{props.unboundCount}</strong>
        </span>
      </div>
    </div>
  );
}

export function ProductShell(props: ProductUiProps) {
  const nav: { id: AppPage; label: string }[] = [
    { id: "deposit", label: "Deposit" },
    { id: "withdraw", label: "Withdraw" },
    { id: "recover", label: "Recover" },
  ];
  const [depositWalletHint, setDepositWalletHint] = useState(false);

  useEffect(() => {
    if (props.account) setDepositWalletHint(false);
  }, [props.account]);

  return (
    <div className="product-root">
      {props.backupArtifacts ? (
        <RecoveryBackupModal
          artifacts={props.backupArtifacts}
          onCopy={props.onCopyRecoveryCode}
          onDownloadFile={props.onRedownloadApnote}
          onConfirmSaved={props.onConfirmRecoverySaved}
        />
      ) : null}

      <header className="site-header">
        <div className="site-header-inner">
          <div className="topbar-brand">
            <BrandMark />
            <div className="topbar-titles">
              <h1 className="brand-sm">
                <span>Anon<em>Gate</em></span> <HelpTip tipKey="brand" />
              </h1>
              <p className="tagline-sm">Absolute Privacy protocol Testnet</p>
            </div>
          </div>
          <div className="header-session">
            {props.account ? (
              <span className="wallet-chip is-on">
                {shortHex(props.account)}
              </span>
            ) : null}
            <span className="wallet-connect-row">
              {props.account ? (
                <button
                  className="btn secondary"
                  disabled={props.busy}
                  onClick={props.onDisconnect}
                >
                  Disconnect
                </button>
              ) : (
                <button className="btn" disabled={props.busy} onClick={props.onConnect}>
                  Connect<span className="wide-only"> wallet</span>
                </button>
              )}
              <HelpTip tipKey="connectWallet" label="About Connect wallet" />
            </span>
          </div>
          <div className="net-select-wrap">
            <NetworkSelect
              id="header-network"
              value={props.selectedNetwork}
              disabled={props.busy}
              onChange={props.onSelectNetwork}
            />
            <HelpTip tipKey="networkSelect" label="About network" />
          </div>
        </div>
      </header>

      <section className="stage grain">
        <div className="aurora" />
        <div className="gridlines" />
        <PrivacyField />
        <div className="stage-fade" />

        <div className="stage-inner">
          {props.page !== "lab" ? (
            <div className="stage-intro">
              <p className="kicker">Shielded protocol</p>
              <h2 className="stage-title">
                Value in. <em>Identity out.</em>
              </h2>
              <p className="stage-lead">
                Deposit into a shared Merkle pool. Withdraw from a different
                wallet. Notes never live on this origin — you hold the Recovery
                Code.
              </p>
              <ul className="stage-stats">
                <li>
                  <strong>ZK</strong>
                  <span>Groth16 withdraw</span>
                </li>
                <li>
                  <strong>0</strong>
                  <span>notes stored here</span>
                </li>
                <li>
                  <strong>You</strong>
                  <span>hold the Recovery Code</span>
                </li>
              </ul>
            </div>
          ) : null}

          <div className="stage-deck">
      <nav className="tabs product-tabs" aria-label="Primary">
        {nav.map((item) => (
          <span key={item.id} className="tab-with-help">
            <button
              type="button"
              className={`tab ${props.page === item.id ? "active" : ""}`}
              onClick={() => props.onPage(item.id)}
            >
              {item.label}
            </button>
            <HelpTip
              tipKey={
                item.id === "deposit"
                  ? "tabDeposit"
                  : item.id === "withdraw"
                    ? "tabWithdraw"
                    : "tabRecover"
              }
            />
          </span>
        ))}
      </nav>

      {props.noteEntries.length > 0 ? (
        <div className="notice compact session-leave-hint" role="status">
          <p>
            <strong>Keep your Recovery Code.</strong> This page forgets notes if
            you close or refresh it. Deposits stay in the pool — you need the
            code to use them again.
          </p>
        </div>
      ) : null}

      <div className="workspace" key={props.page}>
        {props.page !== "lab" ? <PoolBar {...props} /> : null}

        {props.page === "deposit" ? (
          <section className="section panel">
            <div className="page-head">
              <h2>
                Deposit <HelpTip tipKey="tabDeposit" />
              </h2>
              <p>
                Create a Recovery Code, then commit value on-chain. Notes are not
                stored in this browser.
              </p>
            </div>

            <div className="protocol-split">
              <div className="protocol-main">
                <div className="step-card">
                  <div className="step-card-label">
                    <span className="step-index">01</span>
                    New note <HelpTip tipKey="createRecovery" />
                  </div>
                  <div className="field">
                    <LabelWithHelp htmlFor="depAmount" tipKey="depositAmount">
                      Amount ({props.assetSymbol})
                    </LabelWithHelp>
                    <input
                      id="depAmount"
                      value={props.humanAmount}
                      onChange={(e) => props.onHumanAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.1"
                    />
                  </div>
                  <div className="actions">
                    <ActionPair>
                      <button
                        className="btn"
                        disabled={props.busy}
                        onClick={props.onCreateAndDownload}
                      >
                        Create &amp; save Recovery Code
                      </button>
                      <HelpTip tipKey="createRecovery" />
                    </ActionPair>
                  </div>
                </div>

                <div className="step-card">
                  <div className="step-card-label">
                    <span className="step-index">02</span>
                    On-chain <HelpTip tipKey="approveDeposit" />
                  </div>
                  <p className="step-copy">
                    The connected wallet pays gas and the note amount. ERC-20 pools
                    also need a token approval.
                  </p>
                  <div className="actions">
                    <ActionPair>
                      <button
                        className={`btn${
                          !props.account && props.unboundCount > 0 ? " muted" : ""
                        }`}
                        disabled={props.busy || props.unboundCount === 0}
                        onClick={() => {
                          if (!props.account) {
                            setDepositWalletHint(true);
                            return;
                          }
                          setDepositWalletHint(false);
                          props.onDeposit();
                        }}
                        title={
                          props.unboundCount === 0
                            ? "Create or restore a note first"
                            : !props.account
                              ? "Connect a wallet to pay this deposit on-chain"
                              : "Approve token, then deposit"
                        }
                      >
                        Approve + deposit
                      </button>
                      <HelpTip tipKey="approveDeposit" />
                    </ActionPair>
                    <ActionPair>
                      <button
                        className="btn secondary"
                        disabled={props.busy || !props.account}
                        onClick={props.onSync}
                      >
                        Sync pool
                      </button>
                      <HelpTip tipKey="syncPool" />
                    </ActionPair>
                  </div>
                  {depositWalletHint ? (
                    <p className="notice danger compact" role="alert">
                      Connect a wallet (top right) to submit Approve + deposit. The
                      connected account pays gas and the note amount on-chain;
                      ERC-20 pools also need a token approval from that same account.
                    </p>
                  ) : null}
                </div>
              </div>

              <aside className="protocol-side">
                <div className="notes-block">
                  <div className="group-label">
                    Session notes <HelpTip tipKey="sessionNotes" />
                  </div>
                  <NoteCards
                    notes={props.noteEntries}
                    selectedNoteIndex={props.selectedNoteIndex}
                    selectedSpendIndices={props.selectedSpendIndices}
                    assetSymbol={props.assetSymbol}
                    poolAddress={props.poolAddress}
                    decimals={props.assetDecimals}
                    mode="single"
                    onSelectNote={props.onSelectNote}
                    onToggleSpend={props.onToggleSpend}
                  />
                </div>
              </aside>
            </div>

            <RestoreNotesPanel
              idPrefix="dep"
              busy={props.busy}
              recoveryPaste={props.recoveryPaste}
              onRecoveryPaste={props.onRecoveryPaste}
              onImportRecoveryCode={props.onImportRecoveryCode}
              onImportNotes={props.onImportNotes}
              title="Already have a note?"
              subtitle="Paste a Recovery Code to bring it back. File upload is optional."
              folded
            />
          </section>
        ) : null}

        {props.page === "withdraw" ? (
          <section className="section panel">
            <div className="page-head">
              <h2>
                Withdraw <HelpTip tipKey="tabWithdraw" />
              </h2>
              <p>
                Import a note if this tab is empty, then prove and send. Prefer a
                different wallet than deposit for privacy.
              </p>
            </div>

            <div className="stack flow-stack">
              <RestoreNotesPanel
                idPrefix="wd"
                busy={props.busy}
                recoveryPaste={props.recoveryPaste}
                onRecoveryPaste={props.onRecoveryPaste}
                onImportRecoveryCode={props.onImportRecoveryCode}
                onImportNotes={props.onImportNotes}
                title="Import note to withdraw"
                subtitle="Paste a Recovery Code if this tab is empty. File upload is optional."
                folded
              />

              <div className="step-card">
                <div className="step-card-label">
                  Withdraw mode <HelpTip tipKey="withdrawModeFull" />
                </div>
                <div className="mode-row">
                  {(
                    [
                      ["full", "Full (1 note)", "withdrawModeFull"],
                      ["partial", "Partial + change", "withdrawModePartial"],
                      ["merge2", "Merge (2 notes)", "withdrawModeMerge"],
                    ] as const
                  ).map(([id, label, tip]) => (
                    <span key={id} className="mode-with-help">
                      <button
                        type="button"
                        className={`mode-btn ${
                          props.withdrawMode === id ? "active" : ""
                        }`}
                        disabled={props.busy}
                        onClick={() => props.onWithdrawMode(id)}
                      >
                        {label}
                      </button>
                      <HelpTip tipKey={tip} />
                    </span>
                  ))}
                </div>

                {props.boundCount < 1 ? (
                  <div className="notice danger">
                    Need at least one note in this pool. Import + Sync first. In
                    pool = {props.boundCount}.
                  </div>
                ) : null}
                {props.withdrawMode === "merge2" && props.boundCount < 2 ? (
                  <div className="notice danger">
                    Merge needs two notes in this pool (in pool=
                    {props.boundCount}).
                  </div>
                ) : null}

                <div className="field">
                  <LabelWithHelp htmlFor="withdrawTo" tipKey="destination">
                    Destination address
                  </LabelWithHelp>
                  <input
                    id="withdrawTo"
                    value={props.withdrawRecipient}
                    onChange={(e) => props.onWithdrawRecipient(e.target.value)}
                    placeholder="0x…"
                  />
                </div>
                {props.withdrawMode === "partial" ? (
                  <div className="field">
                    <LabelWithHelp htmlFor="partialAmt" tipKey="partialAmount">
                      Public withdraw amount ({props.assetSymbol})
                    </LabelWithHelp>
                    <input
                      id="partialAmt"
                      value={props.partialHumanAmount}
                      onChange={(e) =>
                        props.onPartialHumanAmount(e.target.value)
                      }
                      inputMode="decimal"
                      placeholder="0.25"
                    />
                  </div>
                ) : null}

                <p className="meta">
                  {props.withdrawMode === "full"
                    ? "Select one note in pool, then Prove → Silent send."
                    : props.withdrawMode === "partial"
                      ? "Prove prepares the proof. Silent send or Send via wallet spends the old note and shows a new Recovery Code for the leftover."
                      : "Check exactly two notes in pool, then Prove → Silent send."}
                </p>
                {props.privacyHints.length > 0 ? (
                  <div className="privacy-advice" role="status">
                    <p className="privacy-advice-title">Privacy check</p>
                    <ul>
                      {props.privacyHints.map((hint) => (
                        <li key={hint}>{hint}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="actions">
                  <ActionPair>
                    <button
                      className="btn secondary"
                      disabled={
                        props.busy ||
                        (props.withdrawMode === "merge2"
                          ? !props.hasTwoSpendInputs
                          : props.boundCount < 1)
                      }
                      onClick={props.onProveWithdraw}
                    >
                      1. Prove withdraw
                    </button>
                    <HelpTip tipKey="proveWithdraw" />
                  </ActionPair>
                  <ActionPair>
                    <button
                      className="btn"
                      disabled={props.busy || !props.proofReady}
                      onClick={props.onSilentSendWithdraw}
                    >
                      2. Silent send
                    </button>
                    <HelpTip tipKey="silentSend" />
                  </ActionPair>
                  <ActionPair>
                    <button
                      className="btn secondary"
                      disabled={props.busy || !props.proofReady}
                      onClick={props.onSendWithdraw}
                    >
                      Send via wallet
                    </button>
                    <HelpTip tipKey="sendViaWallet" />
                  </ActionPair>
                  <ActionPair>
                    <button
                      className="btn secondary"
                      disabled={props.busy}
                      onClick={props.onSync}
                    >
                      Sync pool
                    </button>
                    <HelpTip tipKey="syncPool" />
                  </ActionPair>
                </div>

                {props.proofReady ? (
                  <div className="notice ok">
                    Proof ready. Prefer <strong>Silent send</strong> — secrets
                    stay in this tab; only calldata goes to your local relayer.
                  </div>
                ) : null}
              </div>

              <div className="notes-block">
                <div className="group-label">
                  Session notes <HelpTip tipKey="sessionNotes" />
                </div>
                <NoteCards
                  notes={props.noteEntries}
                  selectedNoteIndex={props.selectedNoteIndex}
                  selectedSpendIndices={props.selectedSpendIndices}
                  assetSymbol={props.assetSymbol}
                  poolAddress={props.poolAddress}
                  decimals={props.assetDecimals}
                  mode={props.withdrawMode === "merge2" ? "spend" : "single"}
                  onSelectNote={props.onSelectNote}
                  onToggleSpend={props.onToggleSpend}
                />
              </div>
            </div>
          </section>
        ) : null}

        {props.page === "recover" ? (
          <section className="section panel">
            <div className="page-head">
              <h2>
                Recover <HelpTip tipKey="tabRecover" />
              </h2>
              <p>
                Bring notes back into this tab. Recovery Code is primary; file upload is optional. Legacy sealed JSON still works.
              </p>
            </div>
            <div className="stack flow-stack" style={{ maxWidth: "40rem" }}>
              <RestoreNotesPanel
                idPrefix="rec"
                busy={props.busy}
                recoveryPaste={props.recoveryPaste}
                onRecoveryPaste={props.onRecoveryPaste}
                onImportRecoveryCode={props.onImportRecoveryCode}
                onImportNotes={props.onImportNotes}
              />

              <details className="fold-panel">
                <summary
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest(".help-tip")) {
                      e.preventDefault();
                    }
                  }}
                >
                  <span className="fold-panel-text">
                    <span className="fold-panel-title">
                      Advanced: vault backup <HelpTip tipKey="apbackup" />
                    </span>
                    <span className="fold-panel-hint">
                      Encrypted multi-note file. Prefer Recovery Code for a single note.
                    </span>
                  </span>
                  <span className="fold-panel-mark" aria-hidden />
                </summary>
                <div className="fold-panel-body">
                <div className="field">
                  <LabelWithHelp htmlFor="pass" tipKey="vaultPassphrase">
                    Passphrase (vault / encrypted backups)
                  </LabelWithHelp>
                  <input
                    id="pass"
                    type="password"
                    autoComplete="off"
                    value={props.passphrase}
                    onChange={(e) => props.onPassphrase(e.target.value)}
                  />
                </div>
                <div className="actions">
                  <label className="btn secondary file">
                    Import .apbackup
                    <input
                      type="file"
                      accept=".apbackup,.json,application/json"
                      hidden
                      disabled={props.busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) props.onImportBackup(f);
                      }}
                    />
                  </label>
                  <button
                    className="btn secondary"
                    disabled={props.busy || props.noteEntries.length === 0}
                    onClick={props.onExportBackup}
                  >
                    Export vault
                  </button>
                  <button
                    className="btn secondary"
                    disabled={props.busy || props.noteEntries.length === 0}
                    onClick={props.onRedownloadNotes}
                  >
                    Show Recovery Code again
                  </button>
                </div>
                </div>
              </details>

              <div className="actions">
                <button
                  className="btn secondary"
                  disabled={props.busy || !props.account}
                  onClick={props.onSync}
                >
                  Sync &amp; scan pool
                </button>
                <ActionPair>
                  <button
                    className="btn danger"
                    disabled={props.busy}
                    onClick={props.onClearSession}
                  >
                    Clear this tab
                  </button>
                  <HelpTip tipKey="clearTab" />
                </ActionPair>
              </div>

              <div className="notes-block">
                <div className="group-label">
                  Session notes <HelpTip tipKey="sessionNotes" />
                </div>
                <NoteCards
                  notes={props.noteEntries}
                  selectedNoteIndex={props.selectedNoteIndex}
                  selectedSpendIndices={props.selectedSpendIndices}
                  assetSymbol={props.assetSymbol}
                  poolAddress={props.poolAddress}
                  decimals={props.assetDecimals}
                  mode="single"
                  onSelectNote={props.onSelectNote}
                  onToggleSpend={props.onToggleSpend}
                />
              </div>
            </div>
          </section>
        ) : null}

        {props.page === "lab" ? (
          <section className="section panel">
            <div className="page-head">
              <h2>
                Get tokens <HelpTip tipKey="getTokens" />
              </h2>
              <p>
                {props.poolOptions.find((p) => p.id === props.selectedPoolId)
                  ?.native
                  ? "ETH uses native balance — no mint. Fund your wallet, then Deposit."
                  : "Mint experimental test tokens, then Deposit. Always save your Recovery Code."}
              </p>
            </div>
            <div className="stack flow-stack">
              <div className="actions">
                <button
                  className="btn"
                  disabled={props.busy}
                  onClick={props.onSwitchSepolia}
                >
                  Switch wallet to network
                </button>
              </div>
              <div className="field">
                <LabelWithHelp htmlFor="labPool" tipKey="assetPool">
                  Asset
                </LabelWithHelp>
                <AssetPoolSelect
                  id="labPool"
                  options={props.poolOptions}
                  value={props.selectedPoolId}
                  onChange={props.onSelectPool}
                  disabled={props.busy}
                />
              </div>
              {props.poolOptions.find((p) => p.id === props.selectedPoolId)
                ?.native ? (
                <p className="meta">
                  Native ETH pool — deposit spends ETH from your wallet.
                </p>
              ) : (
                <>
                  <div className="field">
                    <LabelWithHelp htmlFor="mintHuman" tipKey="mintAmount">
                      Amount to mint
                    </LabelWithHelp>
                    <input
                      id="mintHuman"
                      value={props.mintAmountHuman}
                      onChange={(e) => props.onMintAmountHuman(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="actions">
                    <button
                      className="btn"
                      disabled={props.busy || !props.account}
                      onClick={props.onMint}
                    >
                      Mint to wallet
                    </button>
                    <button
                      className="btn secondary"
                      disabled={props.busy || !props.account}
                      onClick={props.onWatchAsset}
                    >
                      Add token to MetaMask
                    </button>
                  </div>
                </>
              )}
              <div className="actions">
                <button
                  className="btn secondary"
                  disabled={props.busy}
                  onClick={() => props.onPage("deposit")}
                >
                  Back to Deposit
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {props.latestTx ? (
          <p className="meta latest-tx">
            Last tx: {props.latestTx.label} · {props.latestTx.state} ·{" "}
            {shortHex(props.latestTx.hash, 10, 6)}
          </p>
        ) : null}
          </div>
          </div>
        </div>
      </section>

      <section className="principles">
          <div className="principles-inner">
            <p className="kicker">How the pool stays private</p>
            <h2>Three rules. No accounts. No custody.</h2>
            <div className="principles-grid">
              <article className="principle-card">
                <span className="principle-ico" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5.2" r="1.6" />
                    <circle cx="6.4" cy="18.6" r="1.4" />
                    <circle cx="17.6" cy="18.6" r="1.4" />
                    <path d="M12 6.8v4.4M12 11.2 6.4 17.2M12 11.2l5.6 6" />
                  </svg>
                </span>
                <h3>Shared Merkle pool</h3>
                <p>
                  Every deposit is a commitment in one tree. Observers see a
                  leaf, not a person. Withdrawals prove membership without
                  pointing at the deposit.
                </p>
              </article>
              <article className="principle-card">
                <span className="principle-ico" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3.4" />
                    <path d="M8.1 12.2 10.7 14.8 16.1 9.2" />
                  </svg>
                </span>
                <h3>Prove in this tab</h3>
                <p>
                  Groth16 runs locally. Silent send ships calldata to your
                  relayer — secrets never leave the browser you opened.
                </p>
              </article>
              <article className="principle-card">
                <span className="principle-ico" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5.5" y="11" width="13" height="9.5" rx="2" />
                    <path d="M8.2 11V8.2a3.8 3.8 0 0 1 7.6 0V11" />
                  </svg>
                </span>
                <h3>You hold the note</h3>
                <p>
                  This origin never stores spend notes. The Recovery Code is
                  the note. Lose it, and nobody — including us — can restore it.
                </p>
              </article>
            </div>
          </div>
        </section>

      <footer className="site-footer">
        <span className="glass-line" aria-hidden />
        <div className="site-footer-inner">
          <div className="foot-top">
            <div className="foot-brand">
              <div className="topbar-brand">
                <BrandMark />
                <p className="brand-sm">
                  <span>Anon<em>Gate</em></span>
                </p>
              </div>
              <p>
                AnonGate&apos;s Absolute Privacy protocol Testnet. Non-custodial shielded
                pool. Session-only. Recovery Code stays with you — this origin
                never stores spend notes.
              </p>
            </div>
            <div className="foot-cols">
              <div>
                <p className="foot-col-title">Protocol</p>
                <button type="button" className="foot-link" onClick={() => props.onPage("deposit")}>
                  Deposit
                </button>
                <button type="button" className="foot-link" onClick={() => props.onPage("withdraw")}>
                  Withdraw
                </button>
                <button type="button" className="foot-link" onClick={() => props.onPage("recover")}>
                  Recover
                </button>
                <button
                  type="button"
                  className="foot-link"
                  onClick={() => props.onPage(props.page === "lab" ? "deposit" : "lab")}
                >
                  {props.page === "lab" ? "Back to app" : "Get tokens"}
                </button>
              </div>
              <div>
                <p className="foot-col-title">Notes</p>
                <p className="foot-static">Recovery Code is primary</p>
                <p className="foot-static">.apnote file optional</p>
                <p className="foot-static">Prefer Silent send</p>
              </div>
              <div>
                <p className="foot-col-title">Products</p>
                <a className="foot-link" href="http://localhost:5173">
                  AnonSwap
                </a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <p>© {new Date().getFullYear()} AnonGate. All rights reserved.</p>
            <p className="foot-clean">No analytics. No cookies. No third-party scripts.</p>
          </div>
        </div>
      </footer>

      <StatusToasts
        kind={props.statusKind}
        text={props.statusText}
        nonce={props.statusNonce}
        busy={props.busy}
      />
    </div>
  );
}
