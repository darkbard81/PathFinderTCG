import { describe, expect, it } from 'vitest';
import { classifyRuntimeAsset } from './classify-runtime-asset';

describe('classifyRuntimeAsset', () => {
  it('같은 webm이라도 sound는 audio로, motion/attack은 video로 가른다', () => {
    expect(classifyRuntimeAsset('sound/bgm/intro.webm')).toBe('audio');
    expect(classifyRuntimeAsset('sound/voice/title-intro.webm')).toBe('audio');
    expect(classifyRuntimeAsset('motion/attack/slash.webm')).toBe('video');
  });

  it('텍스처는 확장자로 고른다', () => {
    expect(classifyRuntimeAsset('ui/title-screen.webp')).toBe('texture');
    expect(classifyRuntimeAsset('cards/arts/card.png')).toBe('texture');
    expect(classifyRuntimeAsset('UI/TITLE.WEBP')).toBe('texture');
  });

  it('sound 아래에서 webm이 아닌 것은 대상이 아니다', () => {
    // playlist.json이 텍스처로 새거나 소리로 잡히면 안 된다.
    expect(classifyRuntimeAsset('sound/bgm/playlist.json')).toBeNull();
    expect(classifyRuntimeAsset('sound/voice/playlist.json')).toBeNull();
    expect(classifyRuntimeAsset('sound/bgm/cover.webp')).toBeNull();
    expect(classifyRuntimeAsset('sound/bgm/intro.mp3')).toBeNull();
  });

  it('motion/attack 밖의 webm과 모르는 확장자는 대상이 아니다', () => {
    expect(classifyRuntimeAsset('cards/standing/leader/standing.webm')).toBeNull();
    expect(classifyRuntimeAsset('cards/standing/leader/standing.mov')).toBeNull();
    expect(classifyRuntimeAsset('motion/idle/breathe.webm')).toBeNull();
    expect(classifyRuntimeAsset('ui/notes.txt')).toBeNull();
  });
});
