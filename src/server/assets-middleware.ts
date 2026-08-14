import type { Stats } from 'node:fs';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appConfig } from '../config';
import { ASSET_REVISION_QUERY_KEY } from '../game/assets/asset-revisions';
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
        sendManifest(request, response, await readAssetsManifest());
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
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        next();
        return true;
      }

      const revision = await findRevision(filePath);
      const etag = buildETag(revision, stats);

      response.setHeader('Content-Type', getMimeType(filePath));
      response.setHeader(
        'Cache-Control',
        resolveCacheControl(url.searchParams.get(ASSET_REVISION_QUERY_KEY), revision),
      );
      response.setHeader('ETag', etag);
      // 비디오 요소는 Range로 받아 간다. 206을 돌려주지 않으면 탐색이 막힌다.
      response.setHeader('Accept-Ranges', 'bytes');

      // 같은 자산이면 본문을 읽지도 않고 끝낸다.
      // Range보다 먼저 본다. 조건부 요청이 Range에 우선한다(RFC 9110 13.1.2).
      if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
        response.statusCode = 304;
        response.end();
        return true;
      }

      const file = await fs.readFile(filePath);
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

/**
 * manifest revision을 경로로 찾는 표다. `assets.json`의 mtime이 그대로면 다시 읽지 않는다.
 * 자산을 다시 구우면 `npm run assets:build`가 mtime을 바꾸므로 다음 요청에서 새로 읽는다.
 */
let revisionCache: { mtimeMs: number; byPath: Map<string, string> } | null = null;

/**
 * 자산 경로에 해당하는 manifest revision을 찾는다.
 * manifest가 없거나 깨져도 자산 서빙은 계속해야 하므로 실패는 "없음"으로 다룬다.
 */
async function findRevision(filePath: string): Promise<string | undefined> {
  try {
    const { mtimeMs } = await fs.stat(assetsManifestPath);

    if (revisionCache?.mtimeMs !== mtimeMs) {
      const manifest = await readAssetsManifest();
      revisionCache = {
        mtimeMs,
        byPath: new Map(
          [...manifest.textures, ...manifest.videos, ...manifest.audio].map((entry) => [
            entry.path,
            entry.revision,
          ]),
        ),
      };
    }

    return revisionCache.byPath.get(toManifestPath(filePath));
  } catch {
    return undefined;
  }
}

/** manifest가 쓰는 assets 루트 기준 슬래시 경로로 바꾼다. */
function toManifestPath(filePath: string): string {
  return path.relative(assetsRoot, filePath).split(path.sep).join('/');
}

/**
 * 이 응답을 얼마나 캐시해도 되는지 정한다.
 *
 * URL에 지금 revision이 박혀 있으면 그 URL은 다른 내용을 가리킬 수 없다. 자산을 다시
 * 구우면 revision이 바뀌어 URL 자체가 달라지기 때문이다. 그때만 오래 캐시하게 둔다.
 * 카드 그림은 화면을 옮길 때마다 `<img>`가 다시 붙어서, 재검증만 남겨 두면 캐시에
 * 있어도 조건부 요청 왕복을 매번 치른다.
 *
 * 값이 없거나 어긋나면 오늘처럼 매번 물어보게 둔다. 손으로 친 주소나 낡은 목록을 든
 * 클라이언트가 오래된 그림을 캐시에 굳히지 못하게 하는 쪽이 중요하다.
 */
export function resolveCacheControl(
  requestedRevision: string | null,
  revision: string | undefined,
): string {
  if (revision && requestedRevision === revision) {
    return 'public, max-age=31536000, immutable';
  }

  // max-age=0라 브라우저는 매번 물으러 온다. 그 물음에 ETag로 304를 준다.
  return 'public, max-age=0, must-revalidate';
}

/**
 * 조건부 요청에 쓸 ETag를 만든다.
 *
 * manifest에 있는 자산은 revision을 그대로 강한 ETag로 쓴다. 파일 내용의 sha256이라
 * 내용이 같으면 값이 같다는 ETag의 정의를 이미 만족한다.
 *
 * manifest에 없는 자산도 있다. standing의 .webm/.mov처럼 런타임이 manifest를 거치지
 * 않고 직접 경로로 받아 가는 것들이다. 이쪽까지 내용을 해시하면 304를 주려고 매 요청
 * 5MB를 읽어야 하므로, 크기와 mtime으로 약한 ETag를 만든다.
 */
export function buildETag(revision: string | undefined, stats: Stats): string {
  if (revision) {
    return `"${revision}"`;
  }

  return `W/"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
}

/**
 * `If-None-Match`가 지금 ETag와 맞는지 본다.
 * 값은 콤마로 여러 개가 올 수 있고, 캐시 검증은 weak comparison이라 `W/`는 떼고 비교한다.
 */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) {
    return false;
  }

  if (header.trim() === '*') {
    return true;
  }

  const target = stripWeakPrefix(etag);

  return header.split(',').some((candidate) => stripWeakPrefix(candidate.trim()) === target);
}

function stripWeakPrefix(etag: string): string {
  return etag.startsWith('W/') ? etag.slice(2) : etag;
}

function isAssetRoute(pathname: string, assetBaseUrl: string): boolean {
  return pathname === assetBaseUrl || pathname.startsWith(`${assetBaseUrl}/`);
}

function isWithinDirectory(targetPath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, targetPath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

/**
 * `.webm`이 모션 비디오와 소리 양쪽에 쓰여 확장자만으로는 가를 수 없다.
 * `classifyRuntimeAsset`이 manifest를 만들 때 쓰는 것과 같은 경로 규칙을 쓴다.
 */
export function isSoundAssetPath(manifestPath: string): boolean {
  return manifestPath.startsWith('sound/');
}

/**
 * 확장자와 경로로 Content-Type을 정한다.
 *
 * 소리만 든 webm에 `video/webm`을 붙이면 안 된다. Chrome은 내용을 보고 알아서 틀지만
 * Safari는 선언한 형식을 믿어서 `<audio>`가 받기를 거부한다.
 */
export function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.webm':
      return isSoundAssetPath(toManifestPath(filePath)) ? 'audio/webm' : 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
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

/**
 * 자산 목록을 내려보낸다. 캐시는 하되 쓰기 전에 반드시 물어보게 한다.
 *
 * 헤더가 없으면 브라우저가 휴리스틱으로 캐시해, 자산을 새로 구워도 낡은 목록을 들고 있는다.
 * 목록이 낡으면 그 안의 revision도 낡고, 개별 자산의 ETag는 서버가 자기 manifest로
 * 계산하므로 클라이언트가 아는 자산 집합과 서버가 주는 것이 어긋난다.
 *
 * `manifestRevision`은 목록 내용에서 뽑은 해시라 그대로 ETag가 된다.
 * 손으로 쓴 옛 목록처럼 값이 없으면 재검증만 걸고 본문을 그대로 보낸다.
 */
function sendManifest(
  request: IncomingMessage,
  response: ServerResponse,
  manifest: AssetsManifest,
): void {
  response.setHeader('Cache-Control', 'no-cache');

  if (!manifest.manifestRevision) {
    sendJson(response, manifest);
    return;
  }

  const etag = `"${manifest.manifestRevision}"`;
  response.setHeader('ETag', etag);

  if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
    response.statusCode = 304;
    response.end();
    return;
  }

  sendJson(response, manifest);
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
