import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2500,
  },
  server: {
    allowedHosts: ['mcp.krdp.ddns.net'],
    host: '0.0.0.0',
    port: 3010,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3011',
      },
    },
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
