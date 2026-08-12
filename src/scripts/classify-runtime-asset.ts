import path from 'node:path';

/** manifest에서 자산이 담기는 배열이다. */
export type RuntimeAssetKind = 'texture' | 'video' | 'audio';

const TEXTURE_EXTENSIONS = new Set(['.png', '.webp']);
const WEBM_EXTENSION = '.webm';
const MP3_EXTENSION = '.mp3';
const SOUND_PATH_PREFIX = 'sound/';
const BGM_PATH_PREFIX = 'sound/bgm/';
const ATTACK_MOTION_PATH_PREFIX = 'motion/attack/';

/**
 * assets 루트 기준 상대 경로를 manifest 배열 종류로 가른다. 대상이 아니면 null이다.
 *
 * **확장자만으로는 가를 수 없다.** 소리도 전투 모션도 `.webm`이라 확장자를 먼저 보면
 * 둘이 한 배열에 섞인다. 경로를 먼저 보고, 확장자는 그 안에서만 따진다.
 *
 * BGM은 HTMLAudioElement로 재생할 MP3만, 그 밖의 sound 채널은 버퍼로 재생할 WebM만
 * 올린다. 같은 폴더에 남은 변환본이나 `playlist.json`이 manifest에 섞이지 않게 한다.
 */
export function classifyRuntimeAsset(relativePath: string): RuntimeAssetKind | null {
  const extension = path.extname(relativePath).toLowerCase();

  if (relativePath.startsWith(BGM_PATH_PREFIX)) {
    return extension === MP3_EXTENSION ? 'audio' : null;
  }

  if (relativePath.startsWith(SOUND_PATH_PREFIX)) {
    return extension === WEBM_EXTENSION ? 'audio' : null;
  }

  if (relativePath.startsWith(ATTACK_MOTION_PATH_PREFIX) && extension === WEBM_EXTENSION) {
    return 'video';
  }

  return TEXTURE_EXTENSIONS.has(extension) ? 'texture' : null;
}
