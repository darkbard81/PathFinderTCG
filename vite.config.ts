import { defineConfig } from 'vitest/config';
import { appConfig } from './src/config';
import { serverPlugin } from './src/server/server-plugin';

/**
 * dev와 preview가 같은 주소로 받는다.
 *
 * 앞단 역프록시는 포트 하나만 바라보므로, 실행 방식을 바꿔도 그 설정이 그대로 통해야 한다.
 * 둘을 따로 적으면 한쪽만 고쳐 놓고 왜 안 되는지 찾게 된다.
 */
const serverOptions = {
  allowedHosts: appConfig.server.allowedHosts,
  host: appConfig.server.host,
  port: appConfig.server.port,
  strictPort: appConfig.server.strictPort,
};

export default defineConfig({
  plugins: [serverPlugin()],
  define: {
    // 브라우저 코드가 node 전용인 src/config.ts를 import하지 않도록 값만 주입한다.
    __ASSET_BASE_URL__: JSON.stringify(appConfig.assets.assetBaseUrl),
  },
  server: serverOptions,
  preview: serverOptions,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        main: 'index.html',
        cardTextTool: 'tools/card-text/index.html',
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
