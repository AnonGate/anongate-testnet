import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SealedBackupArtifacts } from "./storage";

type Props = {
  artifacts: SealedBackupArtifacts;
  onCopy: () => Promise<boolean>;
  onDownloadFile: () => void;
  onConfirmSaved: () => void;
};

/**
 * Recovery Code dialog — same visual language as the product guide cards.
 * Real code is not in the DOM until Reveal. Continue requires a local copy
 * (clipboard or file download).
 */
export function RecoveryBackupModal(props: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        setRevealed(false);
        window.getSelection()?.removeAllRanges();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Always open from the top of the viewport (not mid-page / scrolled down).
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const canFinish = copied || downloaded;
  const maskedCode = maskRecoveryCode(props.artifacts.recoveryCode);
  const fileLabel = props.artifacts.encrypted ? ".apnote file" : "note file";

  function setCodeVisible(next: boolean) {
    setRevealed(next);
    if (!next) {
      window.getSelection()?.removeAllRanges();
    }
  }

  async function handleCopy() {
    setCopyBusy(true);
    try {
      const ok = await props.onCopy();
      if (ok) setCopied(true);
    } finally {
      setCopyBusy(false);
    }
  }

  const modal = (
    <div
      className="recovery-modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-modal-title"
    >
      <div className="recovery-modal-backdrop" />
      <div className="recovery-modal-card guide-card">
        <p className="guide-kicker">Secure backup · not stored in browser</p>
        <div className="section-head">
          <h2 id="recovery-modal-title">Save your Recovery Code</h2>
          <p>
            {props.artifacts.encrypted ? (
              <>
                Treat this like a wallet seed phrase. Restore needs this Recovery
                Code <strong>and</strong> your password. Keep a local copy before
                you leave this screen — clipboard or backup file.
              </>
            ) : (
              <>
                Treat this like a wallet seed phrase. This backup is{" "}
                <strong>not password-protected</strong>; anyone with the code can
                spend. Keep a local copy before you leave this screen — clipboard
                or backup file.
              </>
            )}
          </p>
        </div>

        <div className="notice danger" role="alert">
          <strong>Protect this code</strong>
          <ul className="recovery-warn-list">
            <li>Never share it in chat, email, or screenshots.</li>
            <li>
              {props.artifacts.encrypted
                ? "Store it offline (paper / password manager) with your password."
                : "Store it offline (paper / password manager). Skipping a password means the code alone is enough to spend."}
            </li>
            <li>This site does not keep a copy after you leave.</li>
          </ul>
        </div>

        <div className="field recovery-code-field">
          <div className="recovery-code-toolbar">
            <label htmlFor="recoveryOutModal">Recovery Code</label>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setCodeVisible(!revealed)}
            >
              {revealed ? "Hide" : "Reveal code"}
            </button>
          </div>
          {revealed ? (
            <textarea
              id="recoveryOutModal"
              className="recovery-code-text is-revealed"
              readOnly
              rows={5}
              value={props.artifacts.recoveryCode}
              spellCheck={false}
              autoComplete="off"
              onFocus={(e) => {
                e.currentTarget.select();
              }}
            />
          ) : (
            <div
              id="recoveryOutModal"
              className="recovery-code-text is-blurred"
              aria-hidden="true"
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
            >
              {maskedCode}
            </div>
          )}
          <p className={`meta ${revealed ? "recovery-hint-ok" : ""}`}>
            {revealed
              ? "Visible now. Copy it, then store offline. It hides if you switch tabs."
              : "Hidden for safety — reveal when your screen is private, then copy."}
          </p>
        </div>

        <div className="actions recovery-modal-actions">
          <button
            type="button"
            className="btn"
            disabled={copyBusy || !revealed}
            onClick={() => void handleCopy()}
          >
            {copied ? "Copied — copy again" : "Copy Recovery Code"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              props.onDownloadFile();
              setDownloaded(true);
            }}
          >
            {downloaded ? "Downloaded — save again" : `Download ${fileLabel}`}
          </button>
        </div>

        {copied ? (
          <div className="notice ok compact">
            Recovery Code is on the clipboard. Store it offline, then clear the
            clipboard when you are done.
          </div>
        ) : null}

        {downloaded ? (
          <div className="notice ok compact">
            Backup file downloaded. This tab does not keep a copy — store the file
            offline.
          </div>
        ) : null}

        <div className="guide-actions">
          <button
            type="button"
            className="btn"
            disabled={!canFinish}
            onClick={props.onConfirmSaved}
          >
            Backup saved — continue
          </button>
          {!canFinish ? (
            <p className="meta" style={{ marginTop: "0.65rem" }}>
              Continue unlocks after the Recovery Code is copied, or the backup
              file is downloaded. This app does not store notes in the browser.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/**
 * Short visual stand-in only — must not grow with full code length
 * (that made the hidden state taller than the revealed textarea).
 */
function maskRecoveryCode(_code: string): string {
  const line = "••••••••••••••••••••••••••••••••••••••••••••";
  return `${line}\n${line}\n${line}\n${line}`;
}
