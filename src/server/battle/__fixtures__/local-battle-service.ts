import type {
  BattleCommand,
  BattlePublicState,
  BattleService,
  BattleUpdate,
  CreateBattleRequest,
} from '../../../game/battle/protocol';
import type { BattleRuntimeState } from '../../../game/battle/types';
import { createRuntimeId } from '../../../game/save/runtime-id';
import type { GameSession } from '../../../game/save/session';
import {
  requireStageDefinition,
  resolveStageEnemyDeck,
} from '../../../game/stage/stage-definitions';
import { BattleSession } from '../battle-session';

export type LocalBattleServiceOptions = {
  /** 서버가 저장 슬롯에서 읽을 세션을 대신한다. */
  session: GameSession;
  random?: (() => number) | undefined;
  /** 테스트가 미리 세워 둔 전투 런타임이다. 넣으면 그 상태부터 시작한다. */
  runtime?: BattleRuntimeState | undefined;
};

/**
 * 서버 전투 세션을 HTTP 없이 그대로 부르는 테스트용 구현이다.
 *
 * 전장 화면 테스트가 실제 전투 엔진을 상대로 돌 수 있게 한다. 화면이 보는 경계는 실서비스와 같고,
 * 사이에 있는 것이 네트워크냐 함수 호출이냐만 다르다.
 */
export class LocalBattleService implements BattleService {
  private readonly sessions = new Map<string, BattleSession>();

  public constructor(private readonly options: LocalBattleServiceOptions) {}

  public createBattle(request: CreateBattleRequest): Promise<BattleUpdate> {
    const stageDefinition = requireStageDefinition(request.stageId);
    const session = new BattleSession({
      battleId: createRuntimeId(),
      session: this.options.session,
      stageDefinition,
      enemyDeck: resolveStageEnemyDeck(stageDefinition),
      random: this.options.random,
      runtime: this.options.runtime,
    });
    this.sessions.set(session.battleId, session);

    return Promise.resolve(session.start());
  }

  public applyCommand(battleId: string, command: BattleCommand): Promise<BattleUpdate> {
    return Promise.resolve(this.require(battleId).apply(command));
  }

  public readBattle(battleId: string): Promise<BattlePublicState> {
    return Promise.resolve(this.require(battleId).state);
  }

  public endBattle(battleId: string): Promise<void> {
    this.sessions.delete(battleId);
    return Promise.resolve();
  }

  private require(battleId: string): BattleSession {
    const session = this.sessions.get(battleId);
    if (!session) {
      throw new Error(`Unknown battleId: ${battleId}`);
    }

    return session;
  }
}
