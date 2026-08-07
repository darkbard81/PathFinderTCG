import { defineConfig } from 'vitest/config';
import { appConfig } from './src/config';

export default defineConfig({
  server: {
    allowedHosts: appConfig.server.allowedHosts,
    host: appConfig.server.host,
    port: appConfig.server.port,
    strictPort: appConfig.server.strictPort,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pixi.js')) {
            return 'pixi.js';
          }

          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
