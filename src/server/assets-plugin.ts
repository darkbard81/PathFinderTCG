import type { Plugin, ViteDevServer } from 'vite';
import { createAssetsMiddleware } from './assets-middleware';

/**
 * dev 서버와 preview 서버에 로컬 자산 라우트를 등록한다.
 * 인증, 저장 슬롯, 카드 텍스트 API는 서버 이식 단계에서 같은 방식으로 추가한다.
 */
export function assetsPlugin(): Plugin {
  return {
    name: 'pathfinder-tcg-assets',
    configureServer(server: ViteDevServer) {
      registerAssetsMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      registerAssetsMiddleware(server.middlewares);
    },
  };
}

function registerAssetsMiddleware(middlewares: ViteDevServer['middlewares']): void {
  const handleAssets = createAssetsMiddleware();

  middlewares.use((request, response, next) => {
    void (async () => {
      const handled = await handleAssets(request, response, next);
      if (!handled) {
        next();
      }
    })();
  });
}
