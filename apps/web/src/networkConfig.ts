/**
 * Product networks for the header switcher.
 * Sepolia is live for testing. Mainnet is listed so users can see it,
 * but pools are not published there yet.
 */
export const PRODUCT_NETWORKS = [
  {
    id: "sepolia" as const,
    chainId: 11155111,
    hexChainId: "0xaa36a7",
    name: "Ethereum",
    shortLabel: "Sepolia",
    status: "Test",
    live: true,
  },
  {
    id: "mainnet" as const,
    chainId: 1,
    hexChainId: "0x1",
    name: "Ethereum",
    shortLabel: "Mainnet",
    status: "Soon",
    live: false,
  },
] as const;

export type ProductNetworkId = (typeof PRODUCT_NETWORKS)[number]["id"];

/**
 * Active product network for this build.
 * Until mainnet ceremony pools are live, Sepolia is the product network.
 */
export const ACTIVE_NETWORK = {
  kind: "sepolia" as "sepolia" | "mainnet",
  chainId: 11155111,
  displayName: "Ethereum (Sepolia)",
  hexChainId: "0xaa36a7",
  rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
  explorerTx: (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`,
  explorerAddress: (addr: string) =>
    `https://sepolia.etherscan.io/address/${addr}`,
  poolsPath: "/pools.sepolia.json",
  /** Map registry asset ids → product labels. */
  productLabels: {
    eth: { name: "Ethereum", symbol: "ETH" },
    weth: { name: "Ethereum", symbol: "ETH" },
    dai: { name: "Dai", symbol: "DAI" },
    lusd: { name: "Liquity USD", symbol: "LUSD" },
  } as Record<string, { name: string; symbol: string }>,
};

export function isActiveChainId(chainId: number | string): boolean {
  return Number(chainId) === ACTIVE_NETWORK.chainId;
}
