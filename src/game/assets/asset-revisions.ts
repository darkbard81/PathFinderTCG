import { joinAssetUrl, type AssetsManifest } from './manifest';

/** 자산 URL에 붙이는 revision 질의 키다. 서버도 같은 키를 읽는다. */
export const ASSET_REVISION_QUERY_KEY = 'v';

/**
 * 자산 경로별 revision이다. 부팅에서 manifest를 읽을 때 한 번 채우고 이후에는 읽기만 한다.
 *
 * 화면이 만드는 자산 URL은 manifest를 거치지 않는다. 카드 그림은 카드 id에서 바로
 * 경로를 짓는다(`card-tile.ts`). 그 자리마다 manifest를 들려 보내는 대신 여기서 찾게 한다.
 */
let revisionByPath: ReadonlyMap<string, string> = new Map();

/** manifest를 읽은 곳에서 한 번 호출한다. 두 번 불러도 같은 표로 덮어쓰기만 한다. */
export function rememberAssetRevisions(manifest: AssetsManifest): void {
  revisionByPath = new Map(
    [...manifest.textures, ...manifest.videos, ...manifest.audio].map((entry) => [
      normalizeAssetPath(entry.path),
      entry.revision,
    ]),
  );
}

/** 테스트가 상태를 되돌릴 때 쓴다. 런타임에서는 부를 일이 없다. */
export function forgetAssetRevisions(): void {
  revisionByPath = new Map();
}

export function findAssetRevision(assetPath: string): string | undefined {
  return revisionByPath.get(normalizeAssetPath(assetPath));
}

/**
 * 자산 URL에 내용 해시를 박는다.
 *
 * 이 질의가 붙은 요청에만 서버가 `immutable`을 준다. 값이 없으면 붙이지 않고,
 * 서버는 오늘처럼 매번 재검증한다. 자산을 다시 구우면 revision이 바뀌어 URL 자체가
 * 달라지므로, 낡은 그림이 캐시에 굳어 남는 길이 없다.
 */
export function appendAssetRevision(url: string, revision: string | undefined): string {
  if (!revision) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${ASSET_REVISION_QUERY_KEY}=${encodeURIComponent(revision)}`;
}

/** manifest에 있는 자산이면 revision까지 붙은 URL을, 없으면 경로만 합친 URL을 만든다. */
export function resolveAssetUrl(assetBaseUrl: string, assetPath: string): string {
  return appendAssetRevision(
    joinAssetUrl(assetBaseUrl, assetPath),
    findAssetRevision(assetPath),
  );
}

function normalizeAssetPath(assetPath: string): string {
  return assetPath.replace(/^\/+/, '');
}
