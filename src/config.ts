import path from 'node:path';
import dotenv from 'dotenv';

type AppConfig = {
  server: {
    host: string;
    port: number;
    strictPort: boolean;
    allowedHosts: string[];
  };
  assets: {
    assetBaseUrl: string;
  };
};

const defaultConfig: AppConfig = {
  server: {
    host: '0.0.0.0',
    port: 3011,
    strictPort: true,
    allowedHosts: ['tcg.krdp.ddns.net'],
  },
  assets: {
    assetBaseUrl: '/tcg',
  },
};

dotenv.config({ path: path.resolve('.env') });
const env = process.env;

/**
 * 서버와 자산 경계가 공유하는 검증된 실행 설정이다.
 * 환경 변수 해석은 이 모듈에서만 수행한다.
 */
export const appConfig = {
  server: {
    host: readString(env.PATHFINDER_TCG_HOST, defaultConfig.server.host),
    port: readNumber(env.PATHFINDER_TCG_PORT, defaultConfig.server.port),
    strictPort: readBoolean(env.PATHFINDER_TCG_STRICT_PORT, defaultConfig.server.strictPort),
    allowedHosts: readList(env.PATHFINDER_TCG_ALLOWED_HOSTS, defaultConfig.server.allowedHosts),
  },
  assets: {
    assetBaseUrl: readString(env.PATHFINDER_TCG_ASSET_BASE_URL, defaultConfig.assets.assetBaseUrl),
  },
} satisfies AppConfig;

function readString(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') {
    return fallback;
  }

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return fallback;
  }
}

function readList(value: string | undefined, fallback: string[]): string[] {
  const items = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return items && items.length > 0 ? items : fallback;
}
