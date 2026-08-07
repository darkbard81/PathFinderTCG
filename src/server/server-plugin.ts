import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { appConfig } from '../config';
import { createCardTextApiHandler } from '../tools/card-text/server/api';
import { createAssetsMiddleware } from './assets-middleware';
import { createAuthApiHandler } from './auth-api';
import { AuthService } from './auth-service';
import { createSaveSlotsApiHandler, migrateLegacySaveSlots } from './save-slots-api';

type HttpServerLike = { once(event: 'close', listener: () => void): unknown } | null;

/**
 * dev 서버와 preview 서버에 자산, 인증, 저장 슬롯, 카드 텍스트 도구 라우트를 등록한다.
 * 게임 클라이언트와 도구가 기대하는 서버 경계 전체를 한 곳에서 조립한다.
 */
export function serverPlugin(): Plugin {
  return {
    name: 'pathfinder-tcg-server',
    configureServer(server: ViteDevServer) {
      registerMiddlewares(server.middlewares, server.httpServer);
    },
    configurePreviewServer(server) {
      registerMiddlewares(server.middlewares, server.httpServer);
    },
  };
}

function registerMiddlewares(
  middlewares: ViteDevServer['middlewares'],
  httpServer: HttpServerLike,
): void {
  const { dataRoot } = appConfig.storage;
  const handleAssets = createAssetsMiddleware();
  const authService = new AuthService({
    dataRoot,
    migrateFirstAccount: async (targetSaveSlotsRoot) =>
      migrateLegacySaveSlots({
        legacySaveSlotsRoot: path.join(dataRoot, 'save-slots'),
        targetSaveSlotsRoot,
      }),
  });

  httpServer?.once('close', () => authService.dispose());

  const handleAuthApi = createAuthApiHandler(authService);
  const handleSaveSlotsApi = createSaveSlotsApiHandler({ authService, dataRoot });
  const handleCardTextApi = createCardTextApiHandler();

  middlewares.use((request, response, next) => {
    void (async () => {
      if (await handleAssets(request, response, next)) {
        return;
      }

      if (await handleAuthApi(request, response)) {
        return;
      }

      if (await handleSaveSlotsApi(request, response, next)) {
        return;
      }

      await handleCardTextApi(request, response, next);
    })().catch((error) => {
      next(error as Error);
    });
  });
}
