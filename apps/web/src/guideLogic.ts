export type GuideStepId =
  | "connect"
  | "network"
  | "pool"
  | "mint"
  | "create"
  | "cleanup"
  | "deposit"
  | "sync"
  | "spend"
  | "done";

export type GuideStep = {
  id: GuideStepId;
  number: number;
  title: string;
  summary: string;
  why: string;
};

type NoteLike = {
  statusHint?: string;
  leafIndex?: number | null;
};

export function formatTokenAmount(
  baseUnits: string | bigint,
  decimals: number
): string {
  const value = typeof baseUnits === "bigint" ? baseUnits : BigInt(baseUnits);
  if (decimals <= 0) return value.toString();
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = abs % scale;
  if (frac === 0n) return `${negative ? "-" : ""}${whole.toString()}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`;
}

export function shortHex(value: string, left = 6, right = 4): string {
  if (value.length <= left + right + 1) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

export function computeGuideStep(params: {
  account: string;
  chainId: number;
  hasPool: boolean;
  selectedPreset: boolean;
  mintDone: boolean;
  skippedMint: boolean;
  keepNoteBacklog?: boolean;
  notes: NoteLike[];
}): GuideStep {
  const {
    account,
    chainId,
    hasPool,
    selectedPreset,
    mintDone,
    skippedMint,
    keepNoteBacklog = false,
    notes,
  } = params;
  const unspent = notes.filter((n) => n.statusHint !== "spent");
  const unbound = unspent.filter((n) => n.leafIndex == null);
  const bound = unspent.filter((n) => n.leafIndex != null);
  const onSepolia = chainId === 11155111;
  const onLocal = chainId === 31337;

  if (!account) {
    return {
      id: "connect",
      number: 1,
      title: "Connect your wallet",
      summary: "This app never holds your keys. Your browser wallet signs every send.",
      why: "Needed so the pool can see your address for mint, approve, and deposit.",
    };
  }

  if (!onSepolia && !onLocal) {
    return {
      id: "network",
      number: 2,
      title: "Switch to Sepolia",
      summary: "This dry-run uses the public Sepolia test network (chain id 11155111).",
      why: "Mainnet is blocked until the ceremony. Local Anvil (31337) also works for developers.",
    };
  }

  if (!hasPool) {
    return {
      id: "pool",
      number: 3,
      title: "Choose a pool",
      summary: "Each asset has its own shielded pool. Pick tWETH, tDAI, or tLUSD.",
      why: "Notes created for one pool cannot be spent in another.",
    };
  }

  if (onSepolia && selectedPreset && !mintDone && !skippedMint) {
    return {
      id: "mint",
      number: 4,
      title: "Get free test tokens",
      summary: "Mint worthless Sepolia test tokens so you can deposit. No real value.",
      why: "Without tokens, approve + deposit cannot succeed.",
    };
  }

  if (unspent.length < 2) {
    return {
      id: "create",
      number: 5,
      title: "Create two notes and save the file",
      summary:
        "Notes download as spend-secret files. This protocol does not store them in the browser.",
      why: "If you lose the file, you lose the funds. Keep it offline, then deposit in this same tab or import later.",
    };
  }

  // Session leftovers from earlier clicks in this tab (or rare legacy imports).
  if (unbound.length > 2 && bound.length < 2 && !keepNoteBacklog) {
    return {
      id: "cleanup",
      number: 5,
      title: "Clear leftover undeposited notes",
      summary: `This tab still has ${unbound.length} undeposited notes. Minting tokens does not create notes.`,
      why: "You only need two fresh notes. Discard leftovers, download two new files, and continue.",
    };
  }

  if (unbound.length > 0) {
    return {
      id: "deposit",
      number: 6,
      title: "Deposit each note",
      summary: `${unbound.length} note(s) still need an on-chain deposit. Do them one at a time.`,
      why: "Deposit publishes a commitment; the note stays private, but the pool learns a leaf exists.",
    };
  }

  if (bound.length < 2) {
    return {
      id: "sync",
      number: 7,
      title: "Sync note positions",
      summary: "Bind local notes to their Merkle leaf indexes from the pool.",
      why: "Proving withdraw needs leaf positions against a retained on-chain root.",
    };
  }

  if (bound.length >= 2) {
    return {
      id: "spend",
      number: 8,
      title: "Withdraw",
      summary: "Select deposited note(s), prove locally, then send (wallet or silent relayer).",
      why: "This is the private spend path. Prefer withdrawing to a different address than you deposited from.",
    };
  }

  return {
    id: "done",
    number: 9,
    title: "You are through the basic path",
    summary: "Keep your downloaded note / backup files offline before closing this tab.",
    why: "Closing the tab clears session memory. Lost files mean lost funds.",
  };
}

export function guideProgress(step: GuideStepId): number {
  const order: GuideStepId[] = [
    "connect",
    "network",
    "pool",
    "mint",
    "create",
    "cleanup",
    "deposit",
    "sync",
    "spend",
    "done",
  ];
  const idx = order.indexOf(step);
  return Math.round(((idx + 1) / order.length) * 100);
}
