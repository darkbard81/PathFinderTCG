declare const __ASSET_BASE_URL__: string;

/**
 * 빌드 시점에 주입된 자산 base URL이다.
 * 환경 변수 파싱은 node 전용인 `src/config.ts`에서만 수행하고, 브라우저에는 결과값만 전달한다.
 */
export const ASSET_BASE_URL: string = __ASSET_BASE_URL__;
