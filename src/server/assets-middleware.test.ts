import type { Stats } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildETag, getMimeType, isSoundAssetPath, matchesIfNoneMatch } from './assets-middleware';

function createStats(size: number, mtimeMs: number): Stats {
  return { size, mtimeMs } as Stats;
}

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
