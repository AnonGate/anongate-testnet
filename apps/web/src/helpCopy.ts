/**
 * Short in-app explanations for product controls (hover / tap the ! mark).
 */
export const HELP = {
  brand:
    "AnonGate’s Absolute Privacy protocol Testnet is a non-custodial shielded pool. The app never keeps your note secrets in the browser after you leave — only you hold the Recovery Code (and password, if you set one).",
  connectWallet:
    "Connects MetaMask (or a compatible wallet) so you can approve tokens, deposit, and optionally send withdraws. Connecting does not give the app custody of your notes. Disconnect drops this site’s wallet permission so the next Connect can pick a different account.",
  networkSelect:
    "Sepolia is the live test network (default). Ethereum mainnet is listed for later — pools are not published there yet.",
  assetPool:
    "Which shielded pool to use (ETH, tDAI, or tLUSD on Sepolia). Notes belong to one pool — switch asset only when you intend to use that pool’s notes.",
  poolAddress:
    "On-chain contract address of the selected pool. You can verify it against the published Sepolia registry.",
  inPool:
    "How many notes in this browser session are already deposited and bound to the current pool (ready to withdraw).",
  readyToDeposit:
    "Notes created or restored here that are not yet deposited into the selected pool.",
  tabDeposit:
    "Create a Recovery Code, then deposit value into the shielded pool. Your wallet pays; the pool only sees a commitment, not your note secrets.",
  tabWithdraw:
    "Spend a deposited note to a public address. Prefer a different wallet than the one you used to deposit for better privacy.",
  tabRecover:
    "Restore notes into this tab from Recovery Code (primary), optional .apnote file, or vault backup.",
  depositAmount:
    "How much of the selected asset this new note will hold (before deposit fee). You will need your Recovery Code later to spend it (plus the password if you chose one).",
  createRecovery:
    "Creates a note and shows a Recovery Code (like a seed phrase). A password is recommended to encrypt it; you can skip after a warning. Copy the code offline before depositing.",
  approveDeposit:
    "Confirms the deposit into this note, shows the 0.011% protocol fee, then runs approve (ERC-20) and the on-chain deposit. Keep the Recovery Code first — this origin cannot restore a lost note.",
  syncPool:
    "Reads the pool’s Merkle tree from the chain and binds your local notes so withdraw proofs use a fresh root.",
  recoveryCode:
    "Primary backup: a long AP1-… (encrypted) or AP1P-… (skipped password) code. Never share it in chat or screenshots. If you skipped a password, the code alone can spend.",
  optionalApnote:
    "Optional file with the same payload as the Recovery Code — useful if you prefer a file over pasting text. Encrypted backups use .apnote; skipped-password backups use JSON.",
  sessionNotes:
    "Notes loaded only in this tab’s memory. Closing the tab clears them unless you saved a Recovery Code / file.",
  withdrawModeFull:
    "Withdraw the full value of one deposited note to a destination address (minus withdraw fee).",
  withdrawModePartial:
    "Withdraw part of one note publicly. Prove only prepares the proof. Silent send or Send via wallet spends the original note and gives you a new Recovery Code for the leftover.",
  withdrawModeMerge:
    "Combine exactly two deposited notes into one withdraw (useful to consolidate). Check two notes in the list.",
  destination:
    "Public address that receives the withdrawn funds. Using a fresh wallet (not the depositor) improves unlinkability.",
  partialAmount:
    "How much leaves the pool publicly. Must be less than the note’s value so change can remain private.",
  proveWithdraw:
    "Builds a zero-knowledge proof locally in this tab. Nothing is broadcast until Silent send or Send via wallet. On Partial + change, the new Recovery Code is saved at send time — not during Prove.",
  silentSend:
    "Preferred path: only calldata is sent to your local relayer — note secrets stay in the tab. The note pays 0.04% plus a gas tip to the protocol fee address. Requires the relayer running locally.",
  sendViaWallet:
    "Broadcasts the withdraw from your connected wallet instead of the silent relayer. Still needs a valid proof first.",
  vaultPassphrase:
    "Password for .apbackup vault files (wallet-style encrypted backup of multiple notes). Separate from the spend-note Recovery Code password if you chose different ones.",
  apbackup:
    "Encrypted multi-note vault file. Import needs the vault passphrase. Prefer Recovery Code for single-note restore.",
  clearTab:
    "Empties this tab. Spent notes are already withdrawn. Notes you never deposited are not in the pool. Only money still in the pool needs a Recovery Code.",
  getTokens:
    "Sepolia helpers: switch network, mint experimental tDAI/tLUSD, or fund native ETH. Not for Mainnet.",
  mintAmount:
    "How many experimental test tokens to mint to your wallet (permissionless on Sepolia test tokens).",
} as const;

export type HelpKey = keyof typeof HELP;
