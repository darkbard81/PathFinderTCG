/**
 * `assets.json`의 최소 manifest entry 구조를 표현한다.
 */
export type AssetManifestEntry = {
  key: string;
  path: string;
  revision: string;
};

/**
 * `assets.json`의 최소 manifest 구조를 표현한다.
 * 씬에서는 이 manifest를 읽어 webp 텍스처와 webm 모션을 로딩한다.
 *
 * `audio`는 `sound/` 아래의 소리다. 확장자가 `videos`와 같은 `.webm`이라 종류를
 * 확장자로 가를 수 없어 배열을 따로 둔다. 프리로드 대상이 아니다. BGM은 흘려 받고
 * SFX는 재생기가 필요할 때 디코드한다.
 */
export type AssetsManifest = {
  assetBaseUrl: string;
  textures: AssetManifestEntry[];
  videos: AssetManifestEntry[];
  audio: AssetManifestEntry[];
  manifestRevision: string;
  schemaVersion: number;
  revisionAlgorithm: string;
};

type AssetsManifestResponse = Omit<AssetsManifest, 'videos' | 'audio'> & {
  videos?: AssetManifestEntry[];
  audio?: AssetManifestEntry[];
};

/**
 * 서버가 제공하는 `assets.json`을 읽어 런타임 자산 manifest로 해석한다.
 * 응답 실패는 로딩 씬에서 처리하고, 여기서는 Scene이 바로 사용할 수 있는 manifest로 정규화한다.
 */
export async function fetchAssetsManifest(assetBaseUrl: string): Promise<AssetsManifest> {
  const response = await fetch(joinAssetUrl(assetBaseUrl, 'assets.json'));
  if (!response.ok) {
    throw new Error(`Failed to load assets.json: ${response.status} ${response.statusText}`);
  }

  return normalizeAssetsManifest((await response.json()) as AssetsManifestResponse);
}

const manifestCache = new Map<string, Promise<AssetsManifest>>();

/**
 * 같은 base URL의 `assets.json`을 세션 동안 한 번만 받는다.
 * manifest는 `no-cache`라 화면을 옮길 때마다 왕복이 붙고, 그 한 번의 실패가
 * 자산이 이미 캐시에 있는 화면까지 에러로 만든다.
 *
 * 세션 중 자산을 다시 빌드하면 굳은 revision을 계속 쓴다. 새로 고치면 풀린다.
 * 매번 새 manifest가 필요한 자리에서는 `fetchAssetsManifest`를 그대로 쓴다.
 */
export function loadAssetsManifest(assetBaseUrl: string): Promise<AssetsManifest> {
  const cached = manifestCache.get(assetBaseUrl);
  if (cached) {
    return cached;
  }

  const pending = fetchAssetsManifest(assetBaseUrl);
  manifestCache.set(assetBaseUrl, pending);
  // 실패는 굳히지 않는다. 굳히면 재시도 버튼이 같은 실패만 되풀이한다.
  void pending.catch(() => {
    if (manifestCache.get(assetBaseUrl) === pending) {
      manifestCache.delete(assetBaseUrl);
    }
  });
  return pending;
}

/** 테스트가 세션 캐시를 비우고 시작할 수 있게 한다. */
export function resetAssetsManifestCache(): void {
  manifestCache.clear();
}

/**
 * 구버전 `assets.json`처럼 videos나 audio 필드가 없는 manifest를 현재 런타임 구조로 맞춘다.
 */
export function normalizeAssetsManifest(manifest: AssetsManifestResponse): AssetsManifest {
  return {
    ...manifest,
    videos: Array.isArray(manifest.videos) ? manifest.videos : [],
    audio: Array.isArray(manifest.audio) ? manifest.audio : [],
  };
}

/**
 * `/tcg` 하위 경로와 개별 자산 경로를 안전하게 합친다.
 * 이미 절대 경로처럼 들어온 조각은 앞쪽 슬래시만 정리한다.
 */
export function joinAssetUrl(assetBaseUrl: string, assetPath: string): string {
  const normalizedBase = normalizeAssetBaseUrl(assetBaseUrl);
  const normalizedPath = assetPath.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedPath}`;
}

/**
 * 자산 base URL이 요청 경로와 비교 가능한 형태가 되도록 정규화한다.
 * 루트 경로는 `/`로 유지하고, 그 외 경로는 앞뒤 중복 슬래시를 정리한다.
 */
export function normalizeAssetBaseUrl(assetBaseUrl: string): string {
  if (!assetBaseUrl.startsWith('/')) {
    return `/${assetBaseUrl.replace(/^\/+/, '')}`.replace(/\/+$/, '');
  }

  return assetBaseUrl.replace(/\/+$/, '') || '/';
}
