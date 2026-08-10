import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appConfig } from '../config';
import { normalizeAssetBaseUrl, type AssetsManifest } from '../game/assets/manifest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const assetsRoot = path.join(projectRoot, 'assets');
const assetsManifestPath = path.join(assetsRoot, 'assets.json');

export type AssetsMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<boolean>;

/**
 * 자산 base URL 아래의 정적 자산과 `assets.json`을 처리하는 미들웨어를 만든다.
 * 경로 계산은 repo root 기준이므로 `assets/`가 `src/` 아래로 끌려가지 않는다.
 */
export function createAssetsMiddleware(): AssetsMiddleware {
  return async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const assetBaseUrl = normalizeAssetBaseUrl(appConfig.assets.assetBaseUrl);

    if (!isAssetRoute(url.pathname, assetBaseUrl)) {
      return false;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.end('Method Not Allowed');
      return true;
    }

    const requestedPath = decodeURIComponent(
      url.pathname.slice(assetBaseUrl.length).replace(/^\/+/, ''),
    );
    if (!requestedPath || requestedPath === 'assets.json') {
      try {
        const manifest = await readAssetsManifest();
        sendJson(response, manifest);
      } catch {
        response.statusCode = 404;
        response.end('Not found');
      }
      return true;
    }

    const filePath = path.resolve(assetsRoot, requestedPath);
    if (!isWithinDirectory(filePath, assetsRoot)) {
      response.statusCode = 403;
      response.end('Forbidden');
      return true;
    }

    try {
      const file = await fs.readFile(filePath);
      response.setHeader('Content-Type', getMimeType(filePath));
      response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      // 비디오 요소는 Range로 받아 간다. 206을 돌려주지 않으면 탐색이 막힌다.
      response.setHeader('Accept-Ranges', 'bytes');

      const range = parseByteRange(request.headers.range, file.length);
      if (range) {
        response.statusCode = 206;
        response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.length}`);
        response.end(
          request.method === 'HEAD' ? undefined : file.subarray(range.start, range.end + 1),
        );
        return true;
      }

      response.statusCode = 200;
      response.end(request.method === 'HEAD' ? undefined : file);
      return true;
    } catch {
      next();
      return true;
    }
  };
}

/**
 * `Range: bytes=시작-끝` 한 구간만 해석한다.
 * 여러 구간을 요구하는 요청은 처리하지 않고 전체를 그대로 돌려준다.
 */
function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
  const end = rawStart && rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;

  return start >= 0 && start <= end && end < size ? { start, end } : null;
}

async function readAssetsManifest(): Promise<AssetsManifest> {
  return JSON.parse(await fs.readFile(assetsManifestPath, 'utf8')) as AssetsManifest;
}

function isAssetRoute(pathname: string, assetBaseUrl: string): boolean {
  return pathname === assetBaseUrl || pathname.startsWith(`${assetBaseUrl}/`);
}

function isWithinDirectory(targetPath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, targetPath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
