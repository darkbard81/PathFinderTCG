import { resolve } from 'node:path';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3011;
const DEFAULT_DATABASE_PATH = 'data/pathfinder-tcg.sqlite';
const DEFAULT_DEVELOPMENT_ORIGINS = Object.freeze([
  'http://127.0.0.1:3010',
  'http://localhost:3010',
  'http://mcp.krdp.ddns.net:3010',
]);

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
  readonly allowedOrigins: readonly string[];
  readonly secureCookies: boolean;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT는 1~65535 범위의 정수여야 합니다.');
  }

  return port;
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  if (value === undefined) {
    return DEFAULT_DEVELOPMENT_ORIGINS;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('ALLOWED_ORIGINS에는 하나 이상의 Origin이 필요합니다.');
  }

  origins.forEach((origin) => {
    let parsedOrigin: URL;

    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(`유효하지 않은 ALLOWED_ORIGINS 항목입니다: ${origin}`);
    }

    if (parsedOrigin.origin !== origin || !['http:', 'https:'].includes(parsedOrigin.protocol)) {
      throw new Error(`ALLOWED_ORIGINS는 경로 없는 HTTP(S) Origin이어야 합니다: ${origin}`);
    }
  });

  return Object.freeze([...new Set(origins)]);
}

export function loadServerConfig(
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): ServerConfig {
  const production = environment.NODE_ENV === 'production';
  const configuredHost = environment.HOST?.trim();
  const configuredPort = environment.PORT?.trim();
  const configuredOrigins = environment.ALLOWED_ORIGINS;

  if (production && (configuredHost === undefined || configuredHost.length === 0)) {
    throw new Error('production에서는 HOST를 명시해야 합니다.');
  }

  if (production && (configuredPort === undefined || configuredPort.length === 0)) {
    throw new Error('production에서는 PORT를 명시해야 합니다.');
  }

  if (production && configuredOrigins === undefined) {
    throw new Error('production에서는 ALLOWED_ORIGINS를 명시해야 합니다.');
  }

  const databasePath = environment.DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;

  return Object.freeze({
    host: configuredHost || DEFAULT_HOST,
    port: parsePort(configuredPort, DEFAULT_PORT),
    databasePath: resolve(databasePath),
    allowedOrigins: parseAllowedOrigins(configuredOrigins),
    secureCookies: production,
  });
}
