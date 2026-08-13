import type {
  BattleCommand,
  BattlePublicState,
  BattleService,
  BattleUpdate,
  CreateBattleRequest,
} from '../../../game/battle/protocol';
import type { BattleRuntimeState } from '../../../game/battle/types';
import { ALL_CARD_DEFINITIONS } from '../../../game/save/auto-card-catalog';
import { createRuntimeId } from '../../../game/save/runtime-id';
import { createSaveSlotStateFromGameSession, type GameSession } from '../../../game/save/session';
import type { SaveSlotState } from '../../../game/save/types';
import { applyBattleResultToSaveSlot } from '../apply-battle-result';
import { requireStageDefinition } from '../../../game/stage/stage-definitions';
import { resolveStageEnemyDeck } from '../../../game/stage/stage-enemy-decks';
import { BattleSession } from '../battle-session';

export type LocalBattleServiceOptions = {
  /** 서버가 저장 슬롯에서 읽을 세션을 대신한다. */
  session: GameSession;
  random?: (() => number) | undefined;
  /** 테스트가 미리 세워 둔 전투 런타임이다. 넣으면 그 상태부터 시작한다. */
  runtime?: BattleRuntimeState | undefined;
  /** 결과 저장을 실패하게 만든다. 저장 실패 화면을 검증할 때 쓴다. */
  failResultSave?: string | undefined;
};

/**
 * 서버 전투 세션을 HTTP 없이 그대로 부르는 테스트용 구현이다.
 *
 * 전장 화면 테스트가 실제 전투 엔진을 상대로 돌 수 있게 한다. 화면이 보는 경계는 실서비스와 같고,
 * 사이에 있는 것이 네트워크냐 함수 호출이냐만 다르다.
 */
export class LocalBattleService implements BattleService {
  private readonly sessions = new Map<string, BattleSession>();
  /** 서버의 저장 슬롯을 대신하는 메모리 저장소다. */
  private saveSlotState: SaveSlotState;

  public constructor(private readonly options: LocalBattleServiceOptions) {
    this.saveSlotState = createSaveSlotStateFromGameSession(options.session);
  }

  /** 지금까지 반영된 저장 슬롯 상태다. 테스트가 보상 반영 결과를 확인할 때 읽는다. */
  public get storedSaveSlotState(): SaveSlotState {
    return this.saveSlotState;
  }

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
    const update = session.start();

    return Promise.resolve(
      this.persistResultIfNeeded(session) ? { ...update, state: session.state } : update,
    );
  }

  /** 서버 핸들러가 하는 결과 반영을 메모리 위에서 그대로 흉내 낸다. */
  private persistResultIfNeeded(session: BattleSession): boolean {
    const result = session.readUnsavedResult();
    if (!result) {
      return false;
    }

    if (this.options.failResultSave) {
      session.failResultSave(this.options.failResultSave);
      return true;
    }

    this.saveSlotState = applyBattleResultToSaveSlot({
      state: this.saveSlotState,
      result,
      cardDefinitions: ALL_CARD_DEFINITIONS,
    });
    session.completeResultSave(this.saveSlotState);
    return true;
  }

  public applyCommand(battleId: string, command: BattleCommand): Promise<BattleUpdate> {
    const session = this.require(battleId);
    const update = session.apply(command);

    return Promise.resolve(
      this.persistResultIfNeeded(session) ? { ...update, state: session.state } : update,
    );
  }

  public readBattle(battleId: string): Promise<BattlePublicState> {
    const session = this.require(battleId);
    this.persistResultIfNeeded(session);

    return Promise.resolve(session.state);
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
