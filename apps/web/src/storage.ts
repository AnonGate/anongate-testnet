import {
  decryptSpendNotes,
  encryptSpendNotes,
  sealedEnvelopeToBinary,
  sealedEnvelopeToRecoveryCode,
  binaryToSealedEnvelope,
  recoveryCodeToSealedEnvelope,
  bytesToPlainRecoveryCode,
  plainRecoveryCodeToBytes,
  isApnoteBinary,
  isPlainRecoveryCode,
  SPEND_NOTE_SEALED_FORMAT,
  redactLeafIndexFields,
  type SpendNoteSealedEnvelope,
} from "@absolute-privacy/sdk-core";

const VAULT_KEY = "absolute-privacy.web.vault.v1";
const NOTES_KEY = "absolute-privacy.web.notes.v1";
const BACKUP_MARK_KEY = "absolute-privacy.web.backupMark.v1";

export type LocalNoteRecord = {
  version: string;
  assetId: string;
  value: string;
  spendingKey: string;
  nullifierKey: string;
  blinding: string;
  commitment: string;
  leafIndex?: number | null;
  statusHint?: string;
  /** Optional EIP-55/hex of wallet that broadcast the deposit (privacy advisory). */
  depositedBy?: string | null;
  /** Pool this note was created for / deposited into (per-asset trees are separate). */
  poolAddress?: string | null;
  /** Display symbol for that pool (DAI / LUSD / WETH) — not the currently selected tab. */
  assetSymbol?: string | null;
};

/**
 * Minimum fields required to spend: secrets + commitment + value/asset encoding.
 * Everything else (leafIndex, pool, depositor, symbols) is rebuilt from chain / UI.
 */
export type MinimalExportNote = {
  version: string;
  assetId: string;
  value: string;
  spendingKey: string;
  nullifierKey: string;
  blinding: string;
  commitment: string;
};

export type NotesStore = {
  format: "absolute-privacy-notes-local";
  version: 1;
  notes: LocalNoteRecord[];
};

export type SpendNoteFile = {
  format: "absolute-privacy-spend-note";
  version: 1;
  warning: string;
  note: LocalNoteRecord;
};

export type SpendNotePackFile = {
  format: "absolute-privacy-spend-note-pack";
  version: 1;
  warning: string;
  notes: LocalNoteRecord[];
};

/** Artifacts after backup — encrypted (AP1-) or optional plaintext skip (AP1P-). */
export type SealedBackupArtifacts = {
  envelope: SpendNoteSealedEnvelope | null;
  binary: Uint8Array;
  recoveryCode: string;
  encrypted: boolean;
};

export function emptyNotesStore(): NotesStore {
  return { format: "absolute-privacy-notes-local", version: 1, notes: [] };
}

/** Delete any legacy plaintext note persistence from earlier UI versions. */
export function purgeLegacyBrowserNoteStorage(): void {
  try {
    localStorage.removeItem(NOTES_KEY);
    localStorage.removeItem(BACKUP_MARK_KEY);
    localStorage.removeItem(VAULT_KEY);
  } catch {
    // ignore quota / private-mode failures
  }
}

/**
 * Notes are never loaded from the browser. Always start empty and wipe legacy keys.
 * Session memory in React is the only in-tab working set.
 */
export function loadPlainNotes(): NotesStore {
  purgeLegacyBrowserNoteStorage();
  return emptyNotesStore();
}

/** @deprecated Notes must not be persisted in the browser. */
export function savePlainNotes(_store: NotesStore): void {
  purgeLegacyBrowserNoteStorage();
}

export function markBackupExported(): void {
  // Intentionally not persisted — encrypted backup is a downloaded file only.
}

export function clearBackupMark(): void {
  try {
    localStorage.removeItem(BACKUP_MARK_KEY);
  } catch {
    // ignore
  }
}

export function loadBackupMark(): { at: string } | null {
  return null;
}

export function loadVaultBlob(): string | null {
  return null;
}

export function saveVaultBlob(_json: string): void {
  try {
    localStorage.removeItem(VAULT_KEY);
  } catch {
    // ignore
  }
}

export function clearLocalSecrets(): void {
  purgeLegacyBrowserNoteStorage();
}

export function toBytes32Hex(value: string | bigint): string {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  return `0x${hex}`;
}

export function downloadJson(filename: string, data: unknown): void {
  const safe = redactLeafIndexFields(data, false);
  const blob = new Blob([JSON.stringify(safe, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Best-effort overwrite of secret string fields on note records (GC still eventual). */
export function scrubNoteSecretsInPlace(notes: LocalNoteRecord[]): void {
  for (const n of notes) {
    if (n.spendingKey) n.spendingKey = "";
    if (n.nullifierKey) n.nullifierKey = "";
    if (n.blinding) n.blinding = "";
  }
}

export function downloadBytes(
  filename: string,
  data: Uint8Array,
  mime: string
): void {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Strip correlators before sealing. Keeps only fields needed to prove a spend.
 * Omits: leafIndex, depositedBy, poolAddress, assetSymbol, statusHint.
 */
export function toMinimalExportNotes(
  notes: LocalNoteRecord[]
): MinimalExportNote[] {
  return notes.map((n) => {
    if (
      !n.commitment ||
      !n.spendingKey ||
      !n.nullifierKey ||
      !n.blinding ||
      n.value === undefined ||
      n.value === null ||
      n.value === ""
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

function randomExportId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build Recovery Code / file bytes.
 * Pass a password to encrypt (recommended). Omit / empty to skip encryption.
 */
export async function createSealedBackupArtifacts(
  notes: LocalNoteRecord[],
  passphrase?: string | null
): Promise<SealedBackupArtifacts> {
  if (notes.length === 0) throw new Error("no notes to export");
  const minimal = toMinimalExportNotes(notes);
  if (!passphrase) {
    const pack = {
      format: "absolute-privacy-spend-note-pack",
      version: 1,
      warning:
        "UNENCRYPTED spend secrets. Anyone with this Recovery Code or file can spend.",
      notes: minimal,
    };
    const binary = new TextEncoder().encode(JSON.stringify(pack));
    const recoveryCode = bytesToPlainRecoveryCode(binary);
    return { envelope: null, binary, recoveryCode, encrypted: false };
  }
  if (passphrase.length < 8) {
    throw new Error("passphrase must be at least 8 characters");
  }
  const envelope = encryptSpendNotes({ passphrase, notes: minimal });
  const binary = sealedEnvelopeToBinary(envelope);
  const recoveryCode = sealedEnvelopeToRecoveryCode(envelope);
  return { envelope, binary, recoveryCode, encrypted: true };
}

/** Primary user download: compact binary .apnote (not JSON). */
export function downloadApnoteBinary(binary: Uint8Array, id?: string): void {
  downloadBytes(
    `note_${id ?? randomExportId()}.apnote`,
    binary,
    "application/octet-stream"
  );
}

export function downloadBackupFile(artifacts: SealedBackupArtifacts, id?: string): void {
  const stamp = id ?? randomExportId();
  if (artifacts.encrypted) {
    downloadApnoteBinary(artifacts.binary, stamp);
    return;
  }
  downloadBytes(
    `note_${stamp}.apnote.json`,
    artifacts.binary,
    "application/json"
  );
}

/**
 * Encrypt (or skip) + build Recovery Code / file bytes.
 * Does NOT auto-download — file save is optional in the UI.
 */
export async function downloadSpendNotes(
  notes: LocalNoteRecord[],
  passphrase?: string | null
): Promise<SealedBackupArtifacts | null> {
  if (notes.length === 0) return null;
  return createSealedBackupArtifacts(notes, passphrase);
}

/** @deprecated Prefer binary .apnote; kept for power-user / debug only. */
export function downloadSpendNotesJsonLegacy(
  notes: LocalNoteRecord[],
  passphrase: string
): void {
  if (notes.length === 0) return;
  const minimal = toMinimalExportNotes(notes);
  const sealed = encryptSpendNotes({ passphrase, notes: minimal });
  downloadJson(`note_${randomExportId()}.apnote.sealed.json`, sealed);
}

export function parseImportedNotes(
  raw: unknown,
  passphrase?: string
): LocalNoteRecord[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid note file");
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format === SPEND_NOTE_SEALED_FORMAT) {
    if (!passphrase) {
      throw new Error("encrypted note file requires a password");
    }
    const notes = decryptSpendNotes(obj as never, passphrase);
    return notes as LocalNoteRecord[];
  }

  // Legacy plaintext (still accepted for recovery of older downloads).
  if (obj.format === "absolute-privacy-spend-note") {
    const note = obj.note as LocalNoteRecord | undefined;
    if (!note?.commitment || !note.spendingKey) {
      throw new Error("spend-note file missing note fields");
    }
    return [note];
  }
  if (obj.format === "absolute-privacy-spend-note-pack") {
    const notes = obj.notes as LocalNoteRecord[] | undefined;
    if (!Array.isArray(notes) || notes.length === 0) {
      throw new Error("spend-note pack has no notes");
    }
    return notes;
  }
  if (obj.format === "absolute-privacy-notes-local" && Array.isArray(obj.notes)) {
    return obj.notes as LocalNoteRecord[];
  }
  if (
    typeof obj.commitment === "string" &&
    typeof obj.spendingKey === "string" &&
    typeof obj.value === "string"
  ) {
    return [obj as unknown as LocalNoteRecord];
  }
  throw new Error(
    "unrecognized file — use .apnote / Recovery Code, or legacy .apnote.sealed.json / .apnote.json"
  );
}

/** Decrypt sealed envelope (from binary, recovery code, or legacy JSON). */
export function decryptSealedEnvelope(
  envelope: SpendNoteSealedEnvelope,
  passphrase: string
): LocalNoteRecord[] {
  return decryptSpendNotes(envelope, passphrase) as LocalNoteRecord[];
}

export function parseApnoteBinary(
  binary: Uint8Array,
  passphrase: string
): LocalNoteRecord[] {
  const envelope = binaryToSealedEnvelope(binary);
  return decryptSealedEnvelope(envelope, passphrase);
}

export function parseRecoveryCode(
  code: string,
  passphrase?: string
): LocalNoteRecord[] {
  if (isPlainRecoveryCode(code)) {
    const json = new TextDecoder().decode(plainRecoveryCodeToBytes(code));
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error("unencrypted recovery code is not valid JSON");
    }
    return parseImportedNotes(raw);
  }
  if (!passphrase) {
    throw new Error("encrypted recovery code requires a password");
  }
  const envelope = recoveryCodeToSealedEnvelope(code);
  return decryptSealedEnvelope(envelope, passphrase);
}

export function recoveryCodeNeedsPassword(code: string): boolean {
  return !isPlainRecoveryCode(code);
}

/**
 * Import from uploaded file bytes: APN1 binary, or UTF-8 JSON (sealed / legacy).
 */
export async function parseImportedNoteFile(
  file: File,
  passphrase?: string
): Promise<LocalNoteRecord[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (isApnoteBinary(buf)) {
    if (!passphrase) throw new Error("encrypted .apnote requires a password");
    return parseApnoteBinary(buf, passphrase);
  }
  const text = new TextDecoder().decode(buf).trim();
  if (isPlainRecoveryCode(text)) {
    return parseRecoveryCode(text);
  }
  if (text.toUpperCase().startsWith("AP1-")) {
    if (!passphrase) throw new Error("recovery code requires a password");
    return parseRecoveryCode(text, passphrase);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("not a valid .apnote binary, recovery code, or JSON note file");
  }
  const format = (raw as { format?: string })?.format;
  if (format === SPEND_NOTE_SEALED_FORMAT && !passphrase) {
    throw new Error("encrypted note file requires a password");
  }
  return parseImportedNotes(raw, passphrase);
}

export function fileLooksEncrypted(file: File, peek?: Uint8Array): boolean {
  if (peek && isApnoteBinary(peek)) return true;
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".apnote") ||
    name.endsWith(".apnote.sealed.json") ||
    name.includes("sealed")
  );
}
