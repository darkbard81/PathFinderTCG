import { defineConfig } from 'vitest/config';
import { appConfig } from './src/config';
import { serverPlugin } from './src/server/server-plugin';

export default defineConfig({
  plugins: [serverPlugin()],
  define: {
    // 브라우저 코드가 node 전용인 src/config.ts를 import하지 않도록 값만 주입한다.
    __ASSET_BASE_URL__: JSON.stringify(appConfig.assets.assetBaseUrl),
  },
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
