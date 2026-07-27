import { buildServer } from './app.js';
import { loadServerConfig } from './config.js';

async function start(): Promise<void> {
  const config = loadServerConfig();
  const app = await buildServer({
    databasePath: config.databasePath,
    allowedOrigins: config.allowedOrigins,
    secureCookies: config.secureCookies,
    logger: true,
  });

  const close = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'Shutting down API server');
    await app.close();
  };

  process.once('SIGINT', () => {
    void close('SIGINT');
  });
  process.once('SIGTERM', () => {
    void close('SIGTERM');
  });

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

void start().catch((error: unknown) => {
  console.error('API 서버를 시작할 수 없습니다.', error);
  process.exitCode = 1;
});
