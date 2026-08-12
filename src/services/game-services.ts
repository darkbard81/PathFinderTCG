import { AuthSessionController } from '../game/auth/client';
import { BattleClient } from '../game/battle/client-api';
import { SaveSlotsClient } from '../game/save/client-api';

/** 화면이 사용하는 브라우저 서비스 묶음이다. 전역 레지스트리 대신 명시적으로 주입한다. */
export type GameServices = {
  auth: AuthSessionController;
  saveSlots: SaveSlotsClient;
  /** 전투 판정은 서버에만 있다. 전장 화면은 이 경계로만 전투를 진행한다. */
  battle: BattleClient;
};

export type GameServicesHandle = GameServices & {
  destroy(): void;
};

export type CreateGameServicesOptions = {
  /** 세션이 만료되면 호출된다. 진행 중인 화면을 접고 타이틀로 돌아가기 위한 신호다. */
  onSessionExpired: (message: string) => void;
};

/**
 * 인증과 저장 슬롯 클라이언트를 만든다.
 * 저장 슬롯 요청은 인증 컨트롤러의 fetch를 거쳐 세션 만료를 한 곳에서 처리한다.
 */
export function createGameServices(options: CreateGameServicesOptions): GameServicesHandle {
  const auth = new AuthSessionController({
    onExpired: (message) => options.onSessionExpired(message),
  });

  return {
    auth,
    saveSlots: new SaveSlotsClient(auth.request.bind(auth)),
    battle: new BattleClient(auth.request.bind(auth)),
    destroy: () => auth.destroy(),
  };
}
