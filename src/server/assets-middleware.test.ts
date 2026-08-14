import type { Stats } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  buildETag,
  createAssetsMiddleware,
  getMimeType,
  isSoundAssetPath,
  matchesIfNoneMatch,
  requiresSessionForAsset,
  resolveCacheControl,
} from './assets-middleware';

function createStats(size: number, mtimeMs: number): Stats {
  return { size, mtimeMs } as Stats;
}

function createRequest(url: string): IncomingMessage {
  const request = Readable.from([]) as IncomingMessage;
  request.method = 'GET';
  request.url = url;
  request.headers = {};
  return request;
}

function createResponse(): { response: ServerResponse; text(): string } {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    end(chunk?: unknown) {
      if (chunk != null) {
        chunks.push(String(chunk));
      }
      return this;
    },
  } as unknown as ServerResponse;

  return { response, text: () => chunks.join('') };
}

describe('assets middleware 카드 자산 보호', () => {
  it.each([
    { path: 'cards/webp/a.webp', expected: true },
    { path: 'cards/arts/a.png', expected: true },
    { path: '/cards/badge/cost.webp', expected: true },
    { path: 'ui/title-screen.png', expected: false },
    { path: 'sound/bgm/intro.mp3', expected: false },
    { path: 'fonts/D2CodingBold.ttf', expected: false },
  ])('$path 는 세션 요구가 $expected 다', ({ path: assetPath, expected }) => {
    expect(requiresSessionForAsset(assetPath)).toBe(expected);
  });

  it('허가받지 못한 카드 자산 요청을 401로 끊는다', async () => {
    const handle = createAssetsMiddleware({ authorizeCardAssets: () => false });
    const { response, text } = createResponse();
    const next = vi.fn();

    // 파일이 없는 경로여도 401이다. 존재 여부를 알려 주지 않는다.
    const handled = await handle(createRequest('/tcg/cards/webp/nope.webp'), response, next);

    expect(handled).toBe(true);
    expect(response.statusCode).toBe(401);
    expect(text()).toBe('Unauthorized');
    expect(response.getHeader('cache-control')).toBe('no-store');
    expect(next).not.toHaveBeenCalled();
  });

  it('허가받으면 카드 자산 요청이 파일 조회까지 간다', async () => {
    const handle = createAssetsMiddleware({ authorizeCardAssets: () => true });
    const { response } = createResponse();
    const next = vi.fn();

    await handle(createRequest('/tcg/cards/webp/nope.webp'), response, next);

    // 없는 파일이라 다음 미들웨어로 넘어간다. 401로 끊기지 않았다는 뜻이다.
    expect(response.statusCode).not.toBe(401);
    expect(next).toHaveBeenCalled();
  });

  it('카드 밖 자산은 허가 없이도 통과한다', async () => {
    const authorizeCardAssets = vi.fn(() => false);
    const handle = createAssetsMiddleware({ authorizeCardAssets });
    const { response } = createResponse();
    const next = vi.fn();

    await handle(createRequest('/tcg/ui/nope.png'), response, next);

    expect(authorizeCardAssets).not.toHaveBeenCalled();
    expect(response.statusCode).not.toBe(401);
    expect(next).toHaveBeenCalled();
  });
});

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'public, max-age=0, must-revalidate';

describe('assets middleware Cache-Control', () => {
  it('caches for a year when the URL pins the current revision', () => {
    expect(resolveCacheControl('d85add142f48', 'd85add142f48')).toBe(IMMUTABLE);
  });

  it('revalidates when the URL carries no revision', () => {
    expect(resolveCacheControl(null, 'd85add142f48')).toBe(REVALIDATE);
  });

  it('revalidates when the pinned revision is stale', () => {
    // 낡은 목록을 든 클라이언트가 지난 그림을 캐시에 굳히지 못하게 한다.
    expect(resolveCacheControl('old', 'd85add142f48')).toBe(REVALIDATE);
  });

  it('revalidates assets that are not in the manifest', () => {
    expect(resolveCacheControl('anything', undefined)).toBe(REVALIDATE);
    expect(resolveCacheControl(null, undefined)).toBe(REVALIDATE);
  });
});

describe('assets middleware ETag', () => {
  it('uses the manifest revision as a strong ETag', () => {
    expect(buildETag('d85add142f48', createStats(1024, 1_700_000_000_123))).toBe('"d85add142f48"');
  });

  it('falls back to a weak size-mtime ETag when the asset is not in the manifest', () => {
    // standing의 .webm/.mov처럼 manifest를 거치지 않는 자산이다.
    const etag = buildETag(undefined, createStats(0x1234, 0x5678));

    expect(etag).toBe('W/"1234-5678"');
  });

  it('keeps the weak ETag stable across calls but changes when the file changes', () => {
    const before = buildETag(undefined, createStats(100, 1_700_000_000_000));

    expect(buildETag(undefined, createStats(100, 1_700_000_000_000))).toBe(before);
    expect(buildETag(undefined, createStats(101, 1_700_000_000_000))).not.toBe(before);
    expect(buildETag(undefined, createStats(100, 1_700_000_000_001))).not.toBe(before);
  });

  it('drops the fractional part of mtime so the value stays a plain hex string', () => {
    expect(buildETag(undefined, createStats(16, 4095.9999))).toBe('W/"10-fff"');
  });
});

describe('assets middleware If-None-Match', () => {
  it('matches an identical strong tag', () => {
    expect(matchesIfNoneMatch('"abc"', '"abc"')).toBe(true);
    expect(matchesIfNoneMatch('"abc"', '"def"')).toBe(false);
  });

  it('treats a missing header as no match', () => {
    expect(matchesIfNoneMatch(undefined, '"abc"')).toBe(false);
    expect(matchesIfNoneMatch('', '"abc"')).toBe(false);
  });

  it('matches any tag when the header is a star', () => {
    expect(matchesIfNoneMatch('*', '"abc"')).toBe(true);
    expect(matchesIfNoneMatch(' * ', 'W/"1-2"')).toBe(true);
  });

  it('finds the tag inside a comma separated list', () => {
    expect(matchesIfNoneMatch('"aaa", "bbb", "ccc"', '"bbb"')).toBe(true);
    expect(matchesIfNoneMatch('"aaa","bbb"', '"zzz"')).toBe(false);
  });

  it('compares weakly so W/ prefixes on either side still match', () => {
    // 캐시 검증은 weak comparison이다. 브라우저가 W/를 붙여 되돌려줘도 같은 자산이다.
    expect(matchesIfNoneMatch('W/"abc"', '"abc"')).toBe(true);
    expect(matchesIfNoneMatch('"abc"', 'W/"abc"')).toBe(true);
    expect(matchesIfNoneMatch('W/"abc"', 'W/"abc"')).toBe(true);
    expect(matchesIfNoneMatch('W/"abc"', 'W/"abd"')).toBe(false);
  });
});

describe('assets middleware 소리 판별', () => {
  it('sound 아래의 자산만 소리로 본다', () => {
    expect(isSoundAssetPath('sound/bgm/intro.mp3')).toBe(true);
    expect(isSoundAssetPath('sound/voice/title-intro.webm')).toBe(true);
  });

  it('같은 webm이라도 모션은 소리가 아니다', () => {
    // 소리에 video/webm을 붙이면 Safari의 <audio>가 받기를 거부한다.
    expect(isSoundAssetPath('motion/attack/slash.webm')).toBe(false);
    expect(isSoundAssetPath('cards/standing/leader/standing.webm')).toBe(false);
    expect(isSoundAssetPath('ui/title-screen.webp')).toBe(false);
  });

  it('BGM MP3와 voice WebM에 각 오디오 MIME을 붙인다', () => {
    expect(getMimeType(path.resolve('assets/sound/bgm/intro.mp3'))).toBe('audio/mpeg');
    expect(getMimeType(path.resolve('assets/sound/voice/title-intro.webm'))).toBe('audio/webm');
    expect(getMimeType(path.resolve('assets/motion/attack/slash.webm'))).toBe('video/webm');
  });
});
