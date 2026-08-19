import { Assets } from 'pixi.js';
import { appendAssetRevision } from '../../game/assets/asset-revisions';
import {
  joinAssetUrl,
  loadAssetsManifest,
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

/**
 * ADV 자산 URL 표를 만들고, 실제로 Sprite가 되는 키만 텍스처로 올린다.
 * face와 스탠딩은 DOM `<img>`가 URL로 그리므로 GPU에 올리면 아무도 그리지 않는
 * 텍스처가 ADV 내내 남는다.
 */
export async function loadStageAdvBundle(
  assetBaseUrl: string,
  stageId: string,
  phase: StageAdvPhase,
  textureKeys: readonly StageAdvAssetKey[],
): Promise<LoadedStageAdvBundle> {
  const manifest = await loadAssetsManifest(assetBaseUrl);
  const assets = selectStageAdvBundleAssets(manifest, stageId, phase);
  if (assets.length === 0) {
    throw new Error(`No ADV assets found for ${stageId}/${phase}`);
  }

  const urls = new Map(assets.map((asset) => [asset.alias, asset.src]));
  const bundleId = buildStageAdvBundleId(stageId, phase, manifest.manifestRevision);

  const wantedKeys = new Set<string>(textureKeys);
  const textureAssets = assets.filter((asset) => wantedKeys.has(asset.alias));
  if (textureAssets.length === 0) {
    return { bundleId, resources: {}, urls };
  }

  if (!registeredBundleIds.has(bundleId)) {
    // 번들 전용 alias로 등록한다. shared 자산은 start와 end 양쪽에 들어가는데
    // 같은 alias를 두 번 등록하면 resolver가 자산마다 덮어쓰기 경고를 찍는다.
    Assets.addBundle(
      bundleId,
      textureAssets.map((asset) => ({
        alias: toBundleAlias(bundleId, asset.alias),
        src: asset.src,
      })),
    );
    registeredBundleIds.add(bundleId);
  }

  try {
    const loaded = (await Assets.loadBundle(bundleId)) as Record<string, unknown>;
    const resources = Object.fromEntries(
      textureAssets.map((asset) => [asset.alias, loaded[toBundleAlias(bundleId, asset.alias)]]),
    );
    return { bundleId, resources, urls };
  } catch (error) {
    await Assets.unloadBundle(bundleId).catch(() => undefined);
    throw error;
  }
}

/** Sprite와 DOM 노드가 자산을 놓은 뒤 ADV 번들의 GPU 캐시를 해제한다. */
export async function unloadStageAdvBundle(bundleId: string): Promise<void> {
  // 텍스처가 하나도 없던 ADV는 번들을 등록한 적이 없다.
  if (!registeredBundleIds.has(bundleId)) {
    return;
  }

  await Assets.unloadBundle(bundleId);
}

/** 테스트가 등록 기록을 비우고 시작할 수 있게 한다. */
export function resetStageAdvBundleRegistry(): void {
  registeredBundleIds.clear();
}

function toBundleAlias(bundleId: string, assetKey: StageAdvAssetKey): string {
  return `${bundleId}::${assetKey}`;
}

function buildStageAdvBundleId(
  stageId: string,
  phase: StageAdvPhase,
  manifestRevision: string,
): string {
  return `stage-adv-${stageId}-${phase}-${manifestRevision}`;
}
