import { Assets } from 'pixi.js';
import { appendAssetRevision } from '../../game/assets/asset-revisions';
import {
  fetchAssetsManifest,
  joinAssetUrl,
  type AssetsManifest,
} from '../../game/assets/manifest';
import type { StageAdvAssetKey } from '../../game/stage/types';

/** Stage ADV가 전투 앞인지 뒤인지 구분하는 값이다. */
export type StageAdvPhase = 'start' | 'end';

/** manifest entry를 ADV 번들 등록에 필요한 형태로 좁힌 값이다. */
export type StageAdvBundleAsset = {
  alias: StageAdvAssetKey;
  src: string;
};

/** 로드한 ADV 번들과 DOM 이미지 URL 표다. */
export type LoadedStageAdvBundle = {
  bundleId: string;
  resources: Record<string, unknown>;
  urls: ReadonlyMap<StageAdvAssetKey, string>;
};

const registeredBundleIds = new Set<string>();

/**
 * 한 Stage의 현재 phase와 shared 자산만 골라 revision URL을 만든다.
 * 부팅 프리로드와 분리해 ADV에 들어갈 때만 큰 CG와 스탠딩을 받는다.
 */
export function selectStageAdvBundleAssets(
  manifest: AssetsManifest,
  stageId: string,
  phase: StageAdvPhase,
): StageAdvBundleAsset[] {
  const phasePrefix = `adv.${stageId}.${phase}.`;
  const sharedPrefix = `adv.${stageId}.shared.`;

  return manifest.textures
    .filter(
      (entry): entry is AssetsManifest['textures'][number] & { key: StageAdvAssetKey } =>
        entry.key.startsWith(phasePrefix) || entry.key.startsWith(sharedPrefix),
    )
    .map((entry) => ({
      alias: entry.key,
      src: appendAssetRevision(joinAssetUrl(manifest.assetBaseUrl, entry.path), entry.revision),
    }));
}

/** manifest에서 ADV 번들을 등록하고 모든 phase/shared 텍스처를 로드한다. */
export async function loadStageAdvBundle(
  assetBaseUrl: string,
  stageId: string,
  phase: StageAdvPhase,
): Promise<LoadedStageAdvBundle> {
  const manifest = await fetchAssetsManifest(assetBaseUrl);
  const assets = selectStageAdvBundleAssets(manifest, stageId, phase);
  if (assets.length === 0) {
    throw new Error(`No ADV assets found for ${stageId}/${phase}`);
  }

  const bundleId = buildStageAdvBundleId(stageId, phase, manifest.manifestRevision);
  if (!registeredBundleIds.has(bundleId)) {
    Assets.addBundle(bundleId, assets);
    registeredBundleIds.add(bundleId);
  }

  try {
    const resources = (await Assets.loadBundle(bundleId)) as Record<string, unknown>;
    return {
      bundleId,
      resources,
      urls: new Map(assets.map((asset) => [asset.alias, asset.src])),
    };
  } catch (error) {
    await Assets.unloadBundle(bundleId).catch(() => undefined);
    throw error;
  }
}

/** Sprite와 DOM 노드가 자산을 놓은 뒤 ADV 번들의 GPU 캐시를 해제한다. */
export async function unloadStageAdvBundle(bundleId: string): Promise<void> {
  await Assets.unloadBundle(bundleId);
}

function buildStageAdvBundleId(
  stageId: string,
  phase: StageAdvPhase,
  manifestRevision: string,
): string {
  return `stage-adv-${stageId}-${phase}-${manifestRevision}`;
}
