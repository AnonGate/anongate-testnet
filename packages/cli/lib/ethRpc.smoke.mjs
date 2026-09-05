/**
 * Decode-only smoke for ethRpc helpers (no live chain required).
 */
import {
  SELECTORS,
  decodeAbiWords,
  decodeBytes32Word,
  decodeUint256Word,
  padUint256,
  encodeCall,
} from "./ethRpc.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(SELECTORS.currentStateAnchor === "0xfead6007", "anchor selector");
assert(SELECTORS.commitments === "0x49ce8997", "commitments selector");
assert(SELECTORS.treeDepth === "0x16a56c41", "treeDepth selector");

const root =
  "11639619144216367502391318305046574487975380235745997214114120935742817750728";
const count = 1n;
const encoded =
  "0x" +
  BigInt(root).toString(16).padStart(64, "0") +
  count.toString(16).padStart(64, "0");
const words = decodeAbiWords(encoded);
assert(words.length === 2, "two words");
assert(decodeUint256Word(words[1]) === 1n, "count");
assert(BigInt(decodeBytes32Word(words[0])).toString() === root, "root");

const call = encodeCall("commitments(uint256)", [padUint256(3)]);
assert(call.startsWith("0x49ce8997"), "calldata selector");
assert(call.length === 2 + 8 + 64, "calldata length");

console.log(JSON.stringify({ ok: true, selectors: SELECTORS }, null, 2));
