export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getProvider(): EthereumProvider {
  if (!window.ethereum) {
    throw new Error("No EIP-1193 wallet found (window.ethereum)");
  }
  return window.ethereum;
}

export async function connectWallet(): Promise<string> {
  const eth = getProvider();
  // eth_requestAccounts alone reuses the already-authorized account and
  // skips the picker. wallet_requestPermissions opens account selection.
  try {
    await eth.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? Number((error as { code: unknown }).code)
        : NaN;
    if (code === 4001) throw error;
    // Wallet without EIP-2255 still answers eth_requestAccounts below.
  }
  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.[0]) throw new Error("wallet returned no accounts");
  return accounts[0];
}

/** Drop this origin's eth_accounts permission when the wallet supports it. */
export async function disconnectWallet(): Promise<void> {
  const eth = getProvider();
  try {
    await eth.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Local session still clears; next Connect uses the account picker.
  }
}

export function subscribeWalletEvents(handlers: {
  onAccounts: (accounts: string[]) => void;
  onChain: (chainIdHex: string) => void;
}): () => void {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!eth?.on) return () => {};

  const onAccounts = (...args: unknown[]) => {
    const raw = args[0];
    handlers.onAccounts(Array.isArray(raw) ? raw.map(String) : []);
  };
  const onChain = (...args: unknown[]) => {
    handlers.onChain(String(args[0] ?? ""));
  };
  const onDisconnect = () => handlers.onAccounts([]);

  eth.on("accountsChanged", onAccounts);
  eth.on("chainChanged", onChain);
  eth.on("disconnect", onDisconnect);

  return () => {
    const unbind = eth.removeListener ?? eth.off;
    if (!unbind) return;
    unbind.call(eth, "accountsChanged", onAccounts);
    unbind.call(eth, "chainChanged", onChain);
    unbind.call(eth, "disconnect", onDisconnect);
  };
}

export async function getChainIdHex(): Promise<string> {
  const eth = getProvider();
  return (await eth.request({ method: "eth_chainId" })) as string;
}

export async function switchEthereumChain(params: {
  chainIdHex: string;
  chainName: string;
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  nativeCurrency?: { name: string; symbol: string; decimals: number };
}): Promise<string> {
  const eth = getProvider();
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: params.chainIdHex }],
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? Number((error as { code: unknown }).code)
        : NaN;
    if (code !== 4902 && code !== -32603) throw error;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: params.chainIdHex,
          chainName: params.chainName,
          nativeCurrency: params.nativeCurrency ?? {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: params.rpcUrls,
          blockExplorerUrls: params.blockExplorerUrls ?? [],
        },
      ],
    });
  }
  return getChainIdHex();
}

/** Ask the injected wallet to switch to Sepolia (adds the chain if missing). */
export async function switchToSepolia(): Promise<string> {
  return switchEthereumChain({
    chainIdHex: "0xaa36a7",
    chainName: "Sepolia",
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  });
}

/** EIP-747 — suggest adding an ERC-20 to MetaMask's asset list. */
export async function watchAsset(params: {
  address: string;
  symbol: string;
  decimals: number;
}): Promise<boolean> {
  const eth = getProvider();
  const ok = await eth.request({
    method: "wallet_watchAsset",
    // MetaMask accepts an object here (not a JSON-RPC positional array).
    params: {
      type: "ERC20",
      options: {
        address: params.address,
        symbol: params.symbol,
        decimals: params.decimals,
      },
    } as never,
  });
  return Boolean(ok);
}

export async function ethCall(params: {
  to: string;
  data: string;
}): Promise<string> {
  // Public RPC for reads — Sync / Prove / Silent withdraw work without a wallet.
  const { publicEthCall } = await import("./publicRpc");
  return publicEthCall(params);
}

export async function sendTransaction(params: {
  from: string;
  to: string;
  data: string;
  value?: string;
}): Promise<string> {
  const eth = getProvider();
  return (await eth.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: params.from,
        to: params.to,
        data: params.data,
        value: params.value ?? "0x0",
      },
    ],
  })) as string;
}

export async function waitReceipt(
  txHash: string,
  timeoutMs = 120_000
): Promise<{ status: string; transactionHash: string }> {
  const { publicWaitReceipt } = await import("./publicRpc");
  return publicWaitReceipt(txHash, timeoutMs);
}

export function decodeAddressWord(dataHex: string): string {
  const h = dataHex.startsWith("0x") ? dataHex.slice(2) : dataHex;
  if (h.length < 64) throw new Error("eth_call return too short");
  return "0x" + h.slice(-40);
}

export function decodeBoolWord(dataHex: string): boolean {
  const h = dataHex.startsWith("0x") ? dataHex.slice(2) : dataHex;
  if (h.length < 64) throw new Error("bool eth_call return too short");
  const value = BigInt("0x" + h.slice(-64));
  if (value === 0n) return false;
  if (value === 1n) return true;
  throw new Error(`invalid ABI bool word: ${value}`);
}

export function decodeAnchor(dataHex: string): { root: string; count: number } {
  const h = dataHex.startsWith("0x") ? dataHex.slice(2) : dataHex;
  if (h.length < 128) throw new Error("anchor decode failed");
  const root = "0x" + h.slice(0, 64);
  const count = Number(BigInt("0x" + h.slice(64, 128)));
  return { root, count };
}

export async function getLatestBlockTimestamp(): Promise<bigint> {
  const { publicRpc } = await import("./publicRpc");
  const block = (await publicRpc("eth_getBlockByNumber", [
    "latest",
    false,
  ])) as { timestamp: string } | null;
  if (!block?.timestamp) throw new Error("eth_getBlockByNumber missing timestamp");
  return BigInt(block.timestamp);
}
