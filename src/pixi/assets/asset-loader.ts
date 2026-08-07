import { Assets, type UnresolvedAsset } from 'pixi.js';
import { fetchAssetsManifest } from '../../game/assets/manifest';
import { selectPreloadAssets, type PreloadAsset } from './preload-assets';

/** 화면 전환 시 `Assets.unloadBundle`로 해제할 수 있도록 프리로드 자산에 붙이는 번들 이름이다. */
export const PRELOAD_BUNDLE_ID = 'manifest-preload';

/** 프리로드 완료 후의 집계 결과다. */
export type PreloadResult = {
  totalCount: number;
  loadedCount: number;
  failedCount: number;
  failedAliases: string[];
};

/** 로딩 화면이 진행 상황을 표시하기 위해 구독하는 콜백이다. */
export type PreloadCallbacks = {
  onStatus?: (message: string) => void;
  onProgress?: (ratio: number) => void;
};

/**
 * 비디오는 로딩만 하고 재생하지 않는다.
 * Pixi 기본값은 `autoPlay: true`라 그대로 두면 프리로드 직후 모든 모션이 동시에 재생된다.
 */
const VIDEO_SOURCE_OPTIONS = { autoPlay: false, muted: true };

/**
 * 한 번에 요청할 비디오 수다.
 * `Assets.load`는 넘긴 목록 전체를 `Promise.all`로 띄운다. 텍스처는 브라우저의 연결 풀이
 * 알아서 줄을 세우지만, `<video>`는 동시 미디어 엘리먼트 상한이 따로 있어 초과분이 데이터를
 * 받지 못하면 `canplay`가 오지 않는다. 비디오에만 상한을 둔다.
 */
const VIDEO_PRELOAD_CONCURRENCY = 8;

/**
 * `assets.json`을 읽어 부팅에 필요한 자산을 모두 받는다.
 * 개별 자산 실패는 전체를 중단시키지 않고 집계해 돌려준다.
 */
export async function preloadManifestAssets(
  assetBaseUrl: string,
  callbacks: PreloadCallbacks = {},
): Promise<PreloadResult> {
  callbacks.onStatus?.('Requesting assets.json');
  const manifest = await fetchAssetsManifest(assetBaseUrl);
  const assets = selectPreloadAssets(manifest);

  if (assets.length === 0) {
    callbacks.onStatus?.('No preload assets found');
    callbacks.onProgress?.(1);
    return { totalCount: 0, loadedCount: 0, failedCount: 0, failedAliases: [] };
  }

  callbacks.onStatus?.(`Preloading ${assets.length} assets`);

  const unresolved = assets.map(toUnresolvedAsset);
  const aliasBySrc = new Map(assets.map((asset) => [asset.src, asset.alias]));
  const failedAliases = new Set<string>();

  Assets.addBundle(PRELOAD_BUNDLE_ID, unresolved);

  const onError = (_error: Error, url: string | { src?: string }): void => {
    const src = resolveErrorSource(url);
    const alias = (src && aliasBySrc.get(src)) ?? src ?? 'unknown asset';
    failedAliases.add(alias);
    callbacks.onStatus?.(`Skipping failed asset: ${alias}`);
  };

  const textures = assets.filter((asset) => asset.kind === 'texture').map(toUnresolvedAsset);
  const videos = assets.filter((asset) => asset.kind === 'video').map(toUnresolvedAsset);
  const total = assets.length;
  let completed = 0;

  const runBatch = async (batch: UnresolvedAsset[]): Promise<void> => {
    await Assets.load(batch, {
      strategy: 'skip',
      onProgress: (ratio) => callbacks.onProgress?.((completed + ratio * batch.length) / total),
      onError,
    });
    completed += batch.length;
    callbacks.onProgress?.(completed / total);
  };

  if (textures.length > 0) {
    await runBatch(textures);
  }

  for (const batch of toBatches(videos, VIDEO_PRELOAD_CONCURRENCY)) {
    await runBatch(batch);
  }

  return {
    totalCount: assets.length,
    loadedCount: assets.length - failedAliases.size,
    failedCount: failedAliases.size,
    failedAliases: [...failedAliases],
  };
}

/** 로딩 결과를 사람이 읽을 한 줄로 만든다. 로딩 화면과 다음 화면이 같은 문구를 쓴다. */
export function formatPreloadSummary(result: PreloadResult): string {
  if (result.totalCount === 0) {
    return 'No preload assets found';
  }

  return `Loaded ${result.loadedCount} / ${result.totalCount} assets, ${result.failedCount} failed`;
}

function toUnresolvedAsset(asset: PreloadAsset): UnresolvedAsset {
  if (asset.kind === 'video') {
    return { alias: asset.alias, src: asset.src, data: VIDEO_SOURCE_OPTIONS };
  }

  return { alias: asset.alias, src: asset.src };
}

/** 동시 요청 수를 제한하기 위해 자산 목록을 고정 크기 묶음으로 나눈다. */
function toBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

/** `onError`의 url은 문자열이거나 resolve된 asset이므로 두 경우를 모두 다룬다. */
function resolveErrorSource(url: string | { src?: string }): string | undefined {
  if (typeof url === 'string') {
    return url;
  }

  return typeof url.src === 'string' ? url.src : undefined;
}
