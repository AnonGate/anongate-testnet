import assert from "node:assert/strict";
import test from "node:test";

import {
  loadSepoliaRegistry,
  resolveSepoliaAsset,
} from "../lib/sepoliaRegistry.mjs";

test("checked-in Sepolia registry resolves every supported symbolic asset", () => {
  const { registry } = loadSepoliaRegistry();
  assert.equal(registry.chainId, 11155111);
  assert.equal(registry.shared.treeDepth, 20);
  assert.equal(registry.status, "deployed-depth20-ceremony-phase2-v1");
  assert.equal(registry.shared.provingKeys, "ceremony-finals");
  for (const id of ["eth", "dai", "lusd"]) {
    const item = resolveSepoliaAsset(id);
    assert.equal(item.id, id);
    assert.match(item.pool, /^0x[0-9a-fA-F]{40}$/);
    assert.match(item.token, /^0x[0-9a-fA-F]{40}$/);
    assert.ok(item.source);
  }
  assert.equal(resolveSepoliaAsset("eth").pool.toLowerCase(), registry.pools.eth.pool.toLowerCase());
});

test("symbolic asset resolution fails closed", () => {
  assert.throws(() => resolveSepoliaAsset("usdc"), /unknown Sepolia asset/);
  assert.throws(() => resolveSepoliaAsset("weth"), /native ETH pool is --asset eth/);
});
