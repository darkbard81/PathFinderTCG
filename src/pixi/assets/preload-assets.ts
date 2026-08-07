import { joinAssetUrl, type AssetsManifest } from '../../game/assets/manifest';

/** 프리로드 대상 자산의 종류다. 종류에 따라 loader에 넘길 옵션이 달라진다. */
export type PreloadAssetKind = 'texture' | 'video';

/** manifest entry를 Pixi가 로딩할 수 있는 형태로 옮긴 값이다. */
export type PreloadAsset = {
  alias: string;
  src: string;
  kind: PreloadAssetKind;
};

const PRELOAD_TEXTURE_EXTENSION = '.webp';
const PRELOAD_VIDEO_EXTENSION = '.webm';

/**
 * manifest에서 부팅 시 미리 받아야 하는 자산만 고른다.
 * 카드 아트 png는 화면에서 필요할 때 개별 로딩하므로 여기서 제외한다.
 */
export function selectPreloadAssets(manifest: AssetsManifest): PreloadAsset[] {
  return [
    ...selectEntries(manifest, manifest.textures, PRELOAD_TEXTURE_EXTENSION, 'texture'),
    ...selectEntries(manifest, manifest.videos, PRELOAD_VIDEO_EXTENSION, 'video'),
  ];
}

function selectEntries(
  manifest: AssetsManifest,
  entries: AssetsManifest['textures'],
  extension: string,
  kind: PreloadAssetKind,
): PreloadAsset[] {
  return entries
    .filter((entry) => entry.path.toLowerCase().endsWith(extension))
    .map((entry) => ({
      alias: entry.key,
      src: joinAssetUrl(manifest.assetBaseUrl, entry.path),
      kind,
    }));
}
