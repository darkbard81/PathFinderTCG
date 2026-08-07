import type { Container, Ticker } from 'pixi.js';
import type { ViewportLayout } from '../app/viewport';

/**
 * SceneRouter가 관리하는 화면의 명시적 lifecycle 계약이다.
 */
export interface Scene {
  readonly view: Container;

  /** 화면이 루트에 연결된 뒤 필요한 비동기 초기화를 수행한다. */
  enter?(): void | Promise<void>;

  /** 화면이 루트에서 제거되기 전에 보유한 외부 자원을 정리한다. */
  exit?(): void | Promise<void>;

  /** 라우터가 전달한 논리 영역을 기준으로 화면을 다시 배치한다. */
  resize(layout: ViewportLayout): void;

  /** 화면이 활성화된 동안 프레임 단위 표현 상태를 갱신한다. */
  update?(ticker: Ticker): void;
}
