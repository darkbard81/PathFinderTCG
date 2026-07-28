import type { FastifyInstance } from 'fastify';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';

import { buildServer } from './app.js';
import { loadServerConfig } from './config.js';

interface ViteMiddlewareHost {
  readonly middlewares: Connect.Server;
  readonly httpServer: ViteDevServer['httpServer'] | PreviewServer['httpServer'];
  readonly config: ViteDevServer['config'];
}

export interface PathfinderApiPluginOptions {
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
  readonly logger?: boolean;
}

export function isApiRequestUrl(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }

  const queryIndex = url.indexOf('?');
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  return pathname === '/api' || pathname.startsWith('/api/');
}

function createApiMiddleware(app: FastifyInstance): Connect.NextHandleFunction {
  return (request, response, next) => {
    if (!isApiRequestUrl(request.url)) {
      next();
      return;
    }

    app.routing(request, response);
  };
}

async function mountApi(
  server: ViteMiddlewareHost,
  options: PathfinderApiPluginOptions,
): Promise<void> {
  const config = loadServerConfig(options.environment);
  const app = await buildServer({
    databasePath: config.databasePath,
    allowedOrigins: config.allowedOrigins,
    secureCookies: config.secureCookies,
    logger: options.logger ?? true,
  });
  await app.ready();

  server.middlewares.use(createApiMiddleware(app));

  let closed = false;
  const closeApi = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    void app.close().catch((error: unknown) => {
      const cause = error instanceof Error ? error : new Error(String(error));
      server.config.logger.error('내장 API 서버를 종료할 수 없습니다.', { error: cause });
    });
  };

  server.httpServer?.once('close', closeApi);
}

export function createPathfinderApiPlugin(options: PathfinderApiPluginOptions = {}): Plugin {
  return {
    name: 'pathfinder-api',
    apply: 'serve',
    async configureServer(server) {
      await mountApi(server, options);
    },
    async configurePreviewServer(server) {
      await mountApi(server, options);
    },
  };
}
