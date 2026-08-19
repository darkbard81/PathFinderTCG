import { appendAssetRevision } from '../../game/assets/asset-revisions';
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
 * 확장자는 맞지만 프리로드하지 않는 경로다.
 *
 * 카드 그림은 Pixi가 아니라 DOM `<img>`가 그린다(`card-tile.ts`, `card-detail.ts`,
 * `battlefield-view.ts`). 여기서 받아 두면 아무도 그리지 않는 텍스처 100여 장이
 * 디코드된 채로 남아 부팅에 14MB, 메모리에 그 열 배를 문다.
 * 화면이 `<img>`로 받게 두고, 두 번째부터는 revision이 박힌 URL이 캐시에서 끝낸다.
 */
const PRELOAD_EXCLUDED_PATH_PREFIXES = ['adv/', 'cards/webp/'];

/**
 * manifest에서 부팅 시 미리 받아야 하는 자산만 고른다.
 * 카드 아트는 png든 webp든 화면이 필요할 때 받으므로 여기서 제외한다.
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
    .filter((entry) => entry.path.toLowerCase().endsWith(extension) && !isExcluded(entry.path))
    .map((entry) => ({
      alias: entry.key,
      src: appendAssetRevision(joinAssetUrl(manifest.assetBaseUrl, entry.path), entry.revision),
      kind,
    }));
}

function isExcluded(assetPath: string): boolean {
  const normalizedPath = assetPath.replace(/^\/+/, '').toLowerCase();
  return PRELOAD_EXCLUDED_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
}
