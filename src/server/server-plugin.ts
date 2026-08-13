import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { appConfig } from '../config';
import { CARD_TEXT_TOOL_ACCOUNT_ID } from '../tools/card-text/access';
import { createCardTextApiHandler } from '../tools/card-text/server/api';
import { createAssetsMiddleware } from './assets-middleware';
import { authenticateHttpRequest, createAuthApiHandler } from './auth-api';
import { AuthService } from './auth-service';
import { createBattleApiHandler } from './battle-api';
import { createSaveSlotsApiHandler, migrateLegacySaveSlots } from './save-slots-api';

type HttpServerLike = {
  once(event: 'close', listener: () => void): unknown;
  address(): { port: number } | string | null;
} | null;

/**
 * dev 서버와 preview 서버에 자산, 인증, 저장 슬롯 라우트를 등록한다.
 * 게임 클라이언트가 기대하는 서버 경계 전체를 한 곳에서 조립한다.
 */
export function serverPlugin(): Plugin {
  return {
    name: 'pathfinder-tcg-server',
    configureServer(server: ViteDevServer) {
      // 카드 텍스트 도구는 작업 트리(cards/, assets/)를 직접 고친다. dev에서만 연다.
      registerMiddlewares(server.middlewares, server.httpServer, { enableCardTextTool: true });
    },
    configurePreviewServer(server) {
      registerMiddlewares(server.middlewares, server.httpServer, { enableCardTextTool: false });
    },
  };
}

function registerMiddlewares(
  middlewares: ViteDevServer['middlewares'],
  httpServer: HttpServerLike,
  options: { enableCardTextTool: boolean },
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
  // 전투 판정은 이 핸들러 뒤에서만 돈다. 브라우저 번들에는 전투 엔진이 들어가지 않는다.
  const handleBattleApi = createBattleApiHandler({ authService, dataRoot });
  const handleCardTextApi = options.enableCardTextTool
    ? createCardTextApiHandler({
        authorize: (request, response) => authorizeCardTextTool(authService, request, response),
        resolveCaptureOrigin: () => resolveCaptureOrigin(httpServer),
      })
    : null;

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

      if (await handleBattleApi(request, response)) {
        return;
      }

      if (handleCardTextApi) {
        await handleCardTextApi(request, response, next);
        return;
      }

      next();
    })().catch((error) => {
      next(error as Error);
    });
  });
}

/**
 * 카드 텍스트 도구 API를 로그인한 도구 담당 계정으로 제한한다.
 * 이 API는 저장소의 카드 메타와 자산 파일을 덮어쓰므로 메뉴 노출과 같은 계정 조건을 서버에서도 강제한다.
 */
function authorizeCardTextTool(
  authService: AuthService,
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  // 실패 시 401 응답은 authenticateHttpRequest가 이미 마감한다.
  const account = authenticateHttpRequest(authService, request, response);
  if (!account) {
    return false;
  }

  if (account.loginId !== CARD_TEXT_TOOL_ACCOUNT_ID) {
    response.statusCode = 403;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end('Forbidden');
    return false;
  }

  return true;
}

/**
 * 캡처 브라우저가 접속할 origin을 실제 리스닝 포트에서 만든다.
 * 설정값을 그대로 믿으면 포트가 달라졌을 때 캡처가 엉뚱한 곳을 친다.
 */
function resolveCaptureOrigin(httpServer: HttpServerLike): string {
  const address = httpServer?.address();
  const port =
    typeof address === 'object' && address !== null ? address.port : appConfig.server.port;

  return `http://${appConfig.capture.host}:${port}`;
}
