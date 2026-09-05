import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      assert: path.resolve(rootDir, "node_modules/assert/build/assert.js"),
      buffer: path.resolve(rootDir, "node_modules/buffer/index.js"),
      process: path.resolve(rootDir, "node_modules/process/browser.js"),
      util: path.resolve(rootDir, "node_modules/util/util.js"),
      stream: path.resolve(rootDir, "node_modules/stream-browserify/index.js"),
      events: path.resolve(rootDir, "node_modules/events/events.js"),
    },
  },
  server: {
    // 5180 so it can run side-by-side with the AnonSwap frontend (5173)
    port: 5180,
    // Listen on all interfaces so LAN devices can open http://<this-pc-ip>:5180/
    host: true,
  },
  optimizeDeps: {
    include: [
      "assert",
      "buffer",
      "events",
      "process",
      "stream-browserify",
      "util",
      "circomlibjs",
      "@noble/hashes",
      "@noble/ciphers",
      "snarkjs",
    ],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
      inject: [path.resolve(rootDir, "src/buffer-inject.ts")],
    },
  },
  define: {
    global: "globalThis",
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
