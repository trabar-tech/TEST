import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Bind 0.0.0.0 and allow any Host so the sandbox preview proxy
// (https://{port}-{sandboxId}.e2b.app) can serve the app inside an iframe.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@systems': resolve(__dirname, 'src/systems'),
      '@render': resolve(__dirname, 'src/render'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },
  build: { target: 'es2022', sourcemap: true },
});
