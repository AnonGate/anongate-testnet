import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatAssetAmount } from "./userNotice";

export type PasswordMode = "export" | "import";

export type PasswordChoice =
  | { kind: "password"; password: string }
  | { kind: "skip" }
  | { kind: "cancel" };

type ConfirmSaveRequest = {
  type: "confirm-save";
  count: number;
  resolve: (ok: boolean) => void;
};

export type SessionNoteKind = "deposited" | "undeposited" | "spent";

export type SessionNoteRow = {
  index: number;
  kind: SessionNoteKind;
  amountLabel: string;
};

export function snapshotSessionNotes(
  notes: Array<{
    statusHint?: string | null;
    leafIndex?: number | null;
    value: string;
    assetSymbol?: string | null;
  }>,
  decimals: number,
  fallbackSymbol: string
): SessionNoteRow[] {
  return notes.map((n, index) => {
    const kind: SessionNoteKind =
      n.statusHint === "spent"
        ? "spent"
        : n.leafIndex != null
          ? "deposited"
          : "undeposited";
    return {
      index,
      kind,
      amountLabel: formatAssetAmount(
        n.value,
        decimals,
        n.assetSymbol || fallbackSymbol
      ),
    };
  });
}

type ConfirmLeaveRequest = {
  type: "confirm-leave";
  reason: "leave" | "clear";
  notes: SessionNoteRow[];
  resolve: (ok: boolean) => void;
};

type PasswordRequest = {
  type: "password";
  mode: PasswordMode;
  resolve: (choice: PasswordChoice) => void;
};

type ConfirmPartialChangeRequest = {
  type: "confirm-partial-change";
  phase: "prepare" | "send";
  exitLabel: string;
  remainderLabel: string;
  resolve: (ok: boolean) => void;
};

type ConfirmDepositRequest = {
  type: "confirm-deposit";
  netLabel: string;
  feeLabel: string;
  grossLabel: string;
  native: boolean;
  resolve: (ok: boolean) => void;
};

export type AppDialogRequest =
  | ConfirmSaveRequest
  | ConfirmLeaveRequest
  | PasswordRequest
  | ConfirmPartialChangeRequest
  | ConfirmDepositRequest;

export function useAppDialogs() {
  const [request, setRequest] = useState<AppDialogRequest | null>(null);

  function confirmSaveNotes(count: number): Promise<boolean> {
    return new Promise((resolve) => {
      setRequest({
        type: "confirm-save",
        count,
        resolve: (ok) => {
          setRequest(null);
          resolve(ok);
        },
      });
    });
  }

  function confirmLeavePage(
    notes: SessionNoteRow[],
    reason: "leave" | "clear" = "leave",
  ): Promise<boolean> {
    return new Promise((resolve) => {
      setRequest({
        type: "confirm-leave",
        notes,
        reason,
        resolve: (ok) => {
          setRequest(null);
          resolve(ok);
        },
      });
    });
  }

  function askPassword(mode: PasswordMode): Promise<PasswordChoice> {
    return new Promise((resolve) => {
      setRequest({
        type: "password",
        mode,
        resolve: (choice) => {
          setRequest(null);
          resolve(choice);
        },
      });
    });
  }

  function confirmPartialChange(params: {
    phase: "prepare" | "send";
    exitLabel: string;
    remainderLabel: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      setRequest({
        type: "confirm-partial-change",
        phase: params.phase,
        exitLabel: params.exitLabel,
        remainderLabel: params.remainderLabel,
        resolve: (ok) => {
          setRequest(null);
          resolve(ok);
        },
      });
    });
  }

  function confirmDeposit(params: {
    netLabel: string;
    feeLabel: string;
    grossLabel: string;
    native: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      setRequest({
        type: "confirm-deposit",
        netLabel: params.netLabel,
        feeLabel: params.feeLabel,
        grossLabel: params.grossLabel,
        native: params.native,
        resolve: (ok) => {
          setRequest(null);
          resolve(ok);
        },
      });
    });
  }

  return {
    request,
    confirmSaveNotes,
    confirmLeavePage,
    askPassword,
    confirmPartialChange,
    confirmDeposit,
  };
}

export function AppDialogHost(props: { request: AppDialogRequest | null }) {
  const req = props.request;
  if (!req) return null;
  if (req.type === "confirm-save") {
    return <ConfirmSaveDialog count={req.count} onClose={req.resolve} />;
  }
  if (req.type === "confirm-leave") {
    return (
      <ConfirmLeaveDialog
        notes={req.notes}
        reason={req.reason}
        onClose={req.resolve}
      />
    );
  }
  if (req.type === "confirm-partial-change") {
    return (
      <ConfirmPartialChangeDialog
        phase={req.phase}
        exitLabel={req.exitLabel}
        remainderLabel={req.remainderLabel}
        onClose={req.resolve}
      />
    );
  }
  if (req.type === "confirm-deposit") {
    return (
      <ConfirmDepositDialog
        netLabel={req.netLabel}
        feeLabel={req.feeLabel}
        grossLabel={req.grossLabel}
        native={req.native}
        onClose={req.resolve}
      />
    );
  }
  return <PasswordDialog mode={req.mode} onClose={req.resolve} />;
}

function DialogShell(props: {
  titleId: string;
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="recovery-modal-root app-dialog-root" role="dialog" aria-modal="true" aria-labelledby={props.titleId}>
      <div className="recovery-modal-backdrop" />
      <div className="recovery-modal-card guide-card app-dialog-card">
        <p className="guide-kicker">{props.kicker}</p>
        <div className="section-head">
          <h2 id={props.titleId}>{props.title}</h2>
        </div>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}

function ConfirmDepositDialog(props: {
  netLabel: string;
  feeLabel: string;
  grossLabel: string;
  native: boolean;
  onClose: (ok: boolean) => void;
}) {
  const titleId = useId();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <DialogShell
      titleId={titleId}
      kicker="Approve + deposit"
      title="This funds the note on-chain"
    >
      <p className="app-dialog-lead">
        Your wallet is about to commit value to this note’s commitment. The pool
        only sees the commitment and the gross amount — not the Recovery Code.
        After this confirms, that code is the only way to spend.
      </p>
      <ul className="recovery-warn-list app-dialog-list">
        <li>
          Shielded in the note (net): <strong>{props.netLabel}</strong>
        </li>
        <li>
          Protocol deposit fee: <strong>0.011%</strong> →{" "}
          <strong>{props.feeLabel}</strong> to the fee address
        </li>
        <li>
          Wallet pays: <strong>{props.grossLabel}</strong>
          {props.native
            ? " in the deposit transaction, plus network gas."
            : " after token approval, plus network gas on both transactions."}
        </li>
        <li>
          If you did not save the Recovery Code (and its password, if you set one),
          this origin cannot restore the note. The deposit still lands; the funds
          become unspendable.
        </li>
      </ul>
      <label className="recovery-check app-dialog-check">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <span>
          I have the Recovery Code (and the password, if I set one). I understand
          that losing it means losing this deposit.
        </span>
      </label>
      <div className="app-dialog-actions">
        <button type="button" className="btn secondary" onClick={() => props.onClose(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          disabled={!saved}
          onClick={() => props.onClose(true)}
        >
          Continue to deposit
        </button>
      </div>
    </DialogShell>
  );
}

function ConfirmSaveDialog(props: { count: number; onClose: (ok: boolean) => void }) {
  const titleId = useId();
  const n = props.count === 1 ? "this note" : `these ${props.count} notes`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <DialogShell titleId={titleId} kicker="Recovery Code" title="Keep this backup yourself">
      <p className="app-dialog-lead">
        This protocol will not store {n} in this browser. Next you can encrypt the Recovery
        Code with a password (recommended), or skip — then we show the code. Treat it like a
        seed phrase.
      </p>
      <ul className="recovery-warn-list app-dialog-list">
        <li>Copy the code and keep it offline. If you set a password, keep that too.</li>
        <li>Skip the password and anyone with the code can spend. With a password they need both.</li>
        <li>If you lose the code (and the password, if you set one), the funds cannot be recovered.</li>
        <li>Downloading a file is optional.</li>
      </ul>
      <div className="app-dialog-actions">
        <button type="button" className="btn secondary" onClick={() => props.onClose(false)}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={() => props.onClose(true)}>
          Continue
        </button>
      </div>
    </DialogShell>
  );
}

function ConfirmPartialChangeDialog(props: {
  phase: "prepare" | "send";
  exitLabel: string;
  remainderLabel: string;
  onClose: (ok: boolean) => void;
}) {
  const titleId = useId();
  const preparing = props.phase === "prepare";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <DialogShell
      titleId={titleId}
      kicker="Partial + change"
      title={
        preparing
          ? "Proof only — nothing is sent yet"
          : "This send spends the old note"
      }
    >
      {preparing ? (
        <>
          <p className="app-dialog-lead">
            Prove withdraw only builds a local proof. Your original note stays
            unspent. The withdraw happens on the next click:{" "}
            <strong>Silent send</strong> or <strong>Send via wallet</strong>.
          </p>
          <ul className="recovery-warn-list app-dialog-list">
            <li>
              When you send, <strong>{props.exitLabel}</strong> leaves the pool to
              your destination. Protocol fee comes out of that public amount.
            </li>
            <li>
              The leftover, <strong>{props.remainderLabel}</strong>, stays shielded
              as a new note. You will copy a new Recovery Code at send time — not
              now.
            </li>
            <li>
              After that send, the original Recovery Code cannot spend the leftover.
              Cancel here if you are not ready to continue to send afterwards.
            </li>
          </ul>
        </>
      ) : (
        <>
          <p className="app-dialog-lead">
            This is the withdraw. After it confirms, the note you selected is spent
            and cannot be used again. Next you copy a new Recovery Code for the
            leftover — then Silent send or the wallet broadcast continues.
          </p>
          <ul className="recovery-warn-list app-dialog-list">
            <li>
              Public payout: <strong>{props.exitLabel}</strong> to your destination
              (fee taken from this amount).
            </li>
            <li>
              Leftover: <strong>{props.remainderLabel}</strong> stays in the pool as
              a new note. Required: copy the new Recovery Code (and its password, if
              you set one). The original Recovery Code cannot restore this remainder.
            </li>
            <li>
              Optional extra: a .apnote file with the same new code. It is not a
              second note, and it does not replace copying the code.
            </li>
          </ul>
        </>
      )}
      <div className="app-dialog-actions">
        <button type="button" className="btn secondary" onClick={() => props.onClose(false)}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={() => props.onClose(true)}>
          {preparing ? "Continue to prove" : "Continue to save, then send"}
        </button>
      </div>
    </DialogShell>
  );
}

function leaveRisk(notes: SessionNoteRow[]): "funds" | "keys" | "history" {
  if (notes.some((n) => n.kind === "deposited")) return "funds";
  if (notes.some((n) => n.kind === "undeposited")) return "keys";
  return "history";
}

function joinAmounts(notes: SessionNoteRow[]): string {
  const labels = notes.map((n) => n.amountLabel);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function one(notes: SessionNoteRow[]): boolean {
  return notes.length === 1;
}

function nowStatus(kind: SessionNoteKind): string {
  if (kind === "deposited") return "in the pool";
  if (kind === "undeposited") return "not deposited";
  return "spent";
}

function afterClear(kind: SessionNoteKind): string {
  if (kind === "deposited") {
    return "Still in the pool. This tab will not show it. Spend it later with your Recovery Code.";
  }
  if (kind === "undeposited") {
    return "Gone from this tab. It never went into the pool, so no money is waiting there.";
  }
  return "Gone from this tab. You already withdrew it.";
}

function ConfirmLeaveDialog(props: {
  notes: SessionNoteRow[];
  reason: "leave" | "clear";
  onClose: (ok: boolean) => void;
}) {
  const titleId = useId();
  const [saved, setSaved] = useState(false);
  const leaving = props.reason === "leave";
  const notes = props.notes;
  const risk = leaveRisk(notes);
  const funds = risk === "funds";
  const needsAck = risk !== "history";
  const deposited = notes.filter((n) => n.kind === "deposited");
  const undeposited = notes.filter((n) => n.kind === "undeposited");
  const spent = notes.filter((n) => n.kind === "spent");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props]);

  const kicker =
    risk === "funds"
      ? "Keep your Recovery Code"
      : risk === "keys"
        ? "This tab only"
        : "Already withdrawn";

  const title = leaving ? "Leave this page?" : "Clear this tab?";

  const wipe = leaving
    ? "If you leave or refresh, this list disappears."
    : "This list disappears from the screen.";

  let lead = wipe + " ";
  if (risk === "funds") {
    lead += `${joinAmounts(deposited)} ${one(deposited) ? "stays" : "stay"} in the pool. You get ${one(deposited) ? "it" : "them"} back only with the Recovery Code you saved.`;
  } else if (risk === "keys") {
    lead += `${joinAmounts(undeposited)} never went into the pool.`;
    if (spent.length > 0) {
      lead += ` ${joinAmounts(spent)} ${one(spent) ? "was" : "were"} already withdrawn.`;
    }
    lead += leaving ? " Leaving does not move money." : " Clearing does not move money.";
  } else {
    lead += `${joinAmounts(spent)} ${one(spent) ? "was" : "were"} already withdrawn. Nothing in the pool is waiting on this list.`;
  }

  const ack =
    risk === "funds"
      ? `I have the Recovery Code (and its password, if I set one) for ${joinAmounts(deposited)}.`
      : `I know ${joinAmounts(undeposited)} will disappear from this tab. Nothing in the pool depends on ${one(undeposited) ? "it" : "them"}.`;

  return (
    <DialogShell titleId={titleId} kicker={kicker} title={title}>
      <p className="app-dialog-lead">{lead}</p>
      <div className="clear-preview">
        <div className="clear-preview-head">
          <span>On this tab now</span>
          <span>After you {leaving ? "leave" : "clear"}</span>
        </div>
        {notes.map((n) => (
          <div key={`${n.kind}-${n.index}`} className="clear-preview-row">
            <div className="clear-preview-now">
              <strong>{n.amountLabel}</strong>
              <span>
                #{n.index} · {nowStatus(n.kind)}
              </span>
            </div>
            <p className="clear-preview-after">{afterClear(n.kind)}</p>
          </div>
        ))}
      </div>
      {needsAck ? (
        <label className="recovery-check app-dialog-check">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          <span>{ack}</span>
        </label>
      ) : null}
      <div className="app-dialog-actions">
        <button type="button" className="btn secondary" onClick={() => props.onClose(false)}>
          Stay here
        </button>
        <button
          type="button"
          className={funds ? "btn danger" : "btn"}
          disabled={needsAck && !saved}
          onClick={() => props.onClose(true)}
        >
          {leaving ? "Leave this page" : "Clear this tab"}
        </button>
      </div>
    </DialogShell>
  );
}

function PasswordDialog(props: {
  mode: PasswordMode;
  onClose: (choice: PasswordChoice) => void;
}) {
  const titleId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"form" | "skip-warn">("form");
  const exportMode = props.mode === "export";

  useEffect(() => {
    if (step === "form") firstRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (step === "skip-warn") {
        setStep("form");
        return;
      }
      props.onClose({ kind: "cancel" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props, step]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (exportMode && password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    props.onClose({ kind: "password", password });
  }

  if (exportMode && step === "skip-warn") {
    return (
      <DialogShell titleId={titleId} kicker="Your choice" title="Skip the password?">
        <div className="notice danger" role="alert">
          <strong>Unencrypted Recovery Code</strong>
          <ul className="recovery-warn-list">
            <li>Anyone who sees this code can spend the funds — no password needed.</li>
            <li>Do not put it in chat, email, cloud notes, or screenshots.</li>
            <li>Keep it as private as a seed phrase. You are responsible for that.</li>
          </ul>
        </div>
        <p className="app-dialog-lead" style={{ marginTop: "0.9rem" }}>
          A password is still the safer default. You can save a new encrypted copy later from
          this tab if you change your mind.
        </p>
        <div className="app-dialog-actions">
          <button type="button" className="btn secondary" onClick={() => setStep("form")}>
            Go back
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => props.onClose({ kind: "skip" })}
          >
            I understand — skip
          </button>
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell
      titleId={titleId}
      kicker="Encryption"
      title={exportMode ? "Choose a password" : "Enter your password"}
    >
      <p className="app-dialog-lead">
        {exportMode
          ? "Recommended: encrypt your Recovery Code. You can skip, but then anyone with the code can spend."
          : "This backup is encrypted. Enter the password you chose when you saved it."}
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ap-dialog-pass">Password</label>
          <input
            ref={firstRef}
            id="ap-dialog-pass"
            type="password"
            autoComplete={exportMode ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            minLength={exportMode ? 8 : undefined}
          />
        </div>
        {exportMode ? (
          <div className="field">
            <label htmlFor="ap-dialog-pass2">Confirm password</label>
            <input
              id="ap-dialog-pass2"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError("");
              }}
            />
          </div>
        ) : null}
        {error ? (
          <p className="notice danger compact" role="alert">
            {error}
          </p>
        ) : null}
        <div className="app-dialog-actions">
          {exportMode ? (
            <button type="button" className="btn ghost" onClick={() => setStep("skip-warn")}>
              Skip password
            </button>
          ) : null}
          <div className="app-dialog-actions-end">
            <button
              type="button"
              className="btn secondary"
              onClick={() => props.onClose({ kind: "cancel" })}
            >
              Cancel
            </button>
            <button type="submit" className="btn">
              {exportMode ? "Continue" : "Unlock"}
            </button>
          </div>
        </div>
      </form>
    </DialogShell>
  );
}
