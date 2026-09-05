import assert from "node:assert/strict";
import {
  DEPOSIT_FEE_PPM,
  FEE_PPM_DENOMINATOR,
  depositGrossFromNet,
  depositNetFromGross,
  feeFromPpm,
} from "../dist/index.js";

const cases = [
  [0n, 0n, 0n],
  [1n, 0n, 1n],
  [1n, 110n, 1n],
  [1n, 800n, 1n],
  [9_992n, 800n, 9_999n],
  [9_993n, 800n, 10_001n],
  [1_000_000n, 800n, 1_000_800n],
  [1n, 999_999n, 1n],
  [2n, 999_999n, 1_000_001n],
];

for (const [net, ppm, expectedGross] of cases) {
  const gross = depositGrossFromNet(net, ppm);
  assert.equal(gross, expectedGross, `gross for net=${net}, ppm=${ppm}`);
  assert.equal(depositNetFromGross(gross, ppm), net);
  if (gross > 0n) {
    assert.notEqual(
      depositNetFromGross(gross - 1n, ppm),
      net,
      "gross must be minimal"
    );
  }
}

const oneEth = 10n ** 18n;
const grossOne = depositGrossFromNet(oneEth, DEPOSIT_FEE_PPM);
assert.equal(depositNetFromGross(grossOne, DEPOSIT_FEE_PPM), oneEth);
assert.equal(feeFromPpm(grossOne, DEPOSIT_FEE_PPM), grossOne - oneEth);
assert.equal(FEE_PPM_DENOMINATOR, 1_000_000n);

for (const invalid of [-1n, 1_000_000n, 1_000_001n]) {
  assert.throws(() => depositGrossFromNet(1n, invalid), /ppm/);
  assert.throws(() => depositNetFromGross(1n, invalid), /ppm/);
}
assert.throws(() => depositGrossFromNet(-1n, 110n), /non-negative/);
assert.throws(() => depositNetFromGross(-1n, 110n), /non-negative/);
assert.throws(() => depositGrossFromNet(1, 110n), /bigint/);
assert.throws(() => depositGrossFromNet(1n, 110), /bigint/);
assert.throws(() => depositNetFromGross(1n << 256n, 110n), /uint256/);
assert.throws(() => depositGrossFromNet((1n << 256n) - 1n, 999_999n), /uint256/);

console.log("deposit amount tests passed");
