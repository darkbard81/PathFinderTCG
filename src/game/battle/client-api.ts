import type { ApiFetch } from '../auth/client';
import type {
  BattleCommand,
  BattlePublicState,
  BattleService,
  BattleUpdate,
  CreateBattleRequest,
} from './protocol';

/**
 * 전투 서버 경계를 부르는 브라우저 클라이언트다.
 *
 * 화면은 전투 엔진 대신 이것만 쓴다. 보내는 것은 행동 의도뿐이고,
 * 상태는 언제나 서버가 돌려준 것을 그대로 쓴다.
 */
export class BattleClient implements BattleService {
  public constructor(private readonly request: ApiFetch) {}

  public async createBattle(request: CreateBattleRequest): Promise<BattleUpdate> {
    const response = await this.request('/api/battles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    return readUpdate(await readBody(response));
  }

  public async applyCommand(battleId: string, command: BattleCommand): Promise<BattleUpdate> {
    const response = await this.request(`/api/battles/${battleId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: command }),
    });

    return readUpdate(await readBody(response));
  }

  public async readBattle(battleId: string): Promise<BattlePublicState> {
    const response = await this.request(`/api/battles/${battleId}`);
    const body = await readBody(response);
    if (!isRecord(body) || !isPublicState(body.state)) {
      throw new Error('Invalid battle state response');
    }

    return body.state;
  }

  /** 전투를 접는다. 화면을 떠날 때 부르며, 실패해도 화면 전환을 막지 않는다. */
  public async endBattle(battleId: string): Promise<void> {
    await this.request(`/api/battles/${battleId}`, { method: 'DELETE' });
  }
}

async function readBody(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as unknown;
}

async function readErrorMessage(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed) && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {
    // JSON이 아니면 본문을 그대로 쓴다.
  }

  return raw.length > 0 ? raw : `${response.status} ${response.statusText}`;
}

function readUpdate(body: unknown): BattleUpdate {
  if (
    !isRecord(body) ||
    !Array.isArray(body.events) ||
    !Array.isArray(body.effects) ||
    !isRecord(body.cardNames) ||
    !isPublicState(body.state)
  ) {
    throw new Error('Invalid battle update response');
  }

  return body as unknown as BattleUpdate;
}

/**
 * 그리기 전에 최소한의 모양만 확인한다.
 * 서버가 유일한 판정자라 값 자체를 다시 검사할 이유는 없고, 화면이 터지지 않을 만큼만 본다.
 */
function isPublicState(value: unknown): value is BattlePublicState {
  return (
    isRecord(value) &&
    typeof value.battleId === 'string' &&
    typeof value.turnNumber === 'number' &&
    (value.currentSide === 'player' || value.currentSide === 'enemy') &&
    typeof value.phase === 'string' &&
    Array.isArray(value.slots) &&
    Array.isArray(value.hand) &&
    isRecord(value.player) &&
    isRecord(value.enemy) &&
    typeof value.automationPending === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
