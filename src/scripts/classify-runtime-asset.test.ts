import { describe, expect, it } from 'vitest';
import { classifyRuntimeAsset } from './classify-runtime-asset';

describe('classifyRuntimeAsset', () => {
  it('BGM MP3와 버퍼용 sound WebM은 audio로, 모션 WebM은 video로 가른다', () => {
    expect(classifyRuntimeAsset('sound/bgm/intro.mp3')).toBe('audio');
    expect(classifyRuntimeAsset('sound/voice/title-intro.webm')).toBe('audio');
    expect(classifyRuntimeAsset('sound/sfx/hit.webm')).toBe('audio');
    expect(classifyRuntimeAsset('motion/attack/slash.webm')).toBe('video');
  });

  it('텍스처는 확장자로 고른다', () => {
    expect(classifyRuntimeAsset('ui/title-screen.webp')).toBe('texture');
    expect(classifyRuntimeAsset('cards/arts/card.png')).toBe('texture');
    expect(classifyRuntimeAsset('UI/TITLE.WEBP')).toBe('texture');
  });

  it('sound 아래에서도 채널의 재생 방식과 다른 확장자는 대상이 아니다', () => {
    // playlist.json이 텍스처로 새거나 소리로 잡히면 안 된다.
    expect(classifyRuntimeAsset('sound/bgm/playlist.json')).toBeNull();
    expect(classifyRuntimeAsset('sound/voice/playlist.json')).toBeNull();
    expect(classifyRuntimeAsset('sound/bgm/cover.webp')).toBeNull();
    expect(classifyRuntimeAsset('sound/bgm/intro.webm')).toBeNull();
    expect(classifyRuntimeAsset('sound/voice/title-intro.mp3')).toBeNull();
  });

  it('motion/attack 밖의 webm과 모르는 확장자는 대상이 아니다', () => {
    expect(classifyRuntimeAsset('cards/standing/leader/standing.webm')).toBeNull();
    expect(classifyRuntimeAsset('cards/standing/leader/standing.mov')).toBeNull();
    expect(classifyRuntimeAsset('motion/idle/breathe.webm')).toBeNull();
    expect(classifyRuntimeAsset('ui/notes.txt')).toBeNull();
  });
});
