import { Buffer } from "buffer";

const globalScope = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  process?: { env: Record<string, string | undefined>; browser?: boolean };
  global?: typeof globalThis;
};

globalScope.Buffer = Buffer;
globalScope.process ??= { env: {}, browser: true };
globalScope.global = globalThis;
