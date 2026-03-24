import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, '../dist/web'),
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5173
  },
  resolve: {
    alias: {
      // Replace Node.js built-in with a browser-compatible shim for the
      // subset of `node:crypto` used by domain/parsers (randomUUID, createHash).
      'node:crypto': path.resolve(__dirname, 'node-crypto-shim.ts')
    }
  }
});
