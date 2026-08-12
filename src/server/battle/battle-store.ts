import type { BattleSession } from './battle-session';

/** 마지막 요청에서 이만큼 지난 전투는 버린다. 브라우저가 그냥 창을 닫아도 서버가 계속 들고 있지 않게 한다. */
const DEFAULT_BATTLE_TTL_MS = 6 * 60 * 60 * 1000;

/** 한 계정이 동시에 열어 둘 수 있는 전투 수다. 넘으면 가장 오래된 것부터 버린다. */
const DEFAULT_MAX_BATTLES_PER_ACCOUNT = 4;

type BattleEntry = {
  accountId: string;
  session: BattleSession;
  touchedAt: number;
};

export type BattleStoreOptions = {
  ttlMs?: number;
  maxBattlesPerAccount?: number;
  now?: () => number;
};

/**
 * 진행 중인 전투를 담아 두는 서버 메모리 저장소다.
 *
 * 전투 상태는 저장 슬롯에 남기지 않는다. 저장 스키마를 건드리지 않으려는 것이고,
 * 서버가 다시 뜨면 전투는 처음부터 다시 시작하면 된다.
 */
export class BattleStore {
  private readonly entries = new Map<string, BattleEntry>();
  private readonly ttlMs: number;
  private readonly maxBattlesPerAccount: number;
  private readonly now: () => number;

  public constructor(options: BattleStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_BATTLE_TTL_MS;
    this.maxBattlesPerAccount = options.maxBattlesPerAccount ?? DEFAULT_MAX_BATTLES_PER_ACCOUNT;
    this.now = options.now ?? Date.now;
  }

  public add(accountId: string, session: BattleSession): void {
    this.pruneExpired();
    this.entries.set(session.battleId, {
      accountId,
      session,
      touchedAt: this.now(),
    });
    this.pruneAccountOverflow(accountId);
  }

  /**
   * 계정이 소유한 전투만 돌려준다.
   * 다른 계정의 battleId를 알아내도 남의 전투를 만지지 못하게 하는 지점이다.
   */
  public read(accountId: string, battleId: string): BattleSession | null {
    this.pruneExpired();
    const entry = this.entries.get(battleId);
    if (!entry || entry.accountId !== accountId) {
      return null;
    }

    entry.touchedAt = this.now();
    return entry.session;
  }

  public delete(accountId: string, battleId: string): boolean {
    const entry = this.entries.get(battleId);
    if (!entry || entry.accountId !== accountId) {
      return false;
    }

    return this.entries.delete(battleId);
  }

  public get size(): number {
    return this.entries.size;
  }

  private pruneExpired(): void {
    const deadline = this.now() - this.ttlMs;
    for (const [battleId, entry] of this.entries) {
      if (entry.touchedAt < deadline) {
        this.entries.delete(battleId);
      }
    }
  }

  private pruneAccountOverflow(accountId: string): void {
    const owned = [...this.entries.entries()]
      .filter(([, entry]) => entry.accountId === accountId)
      .sort(([, left], [, right]) => left.touchedAt - right.touchedAt);

    for (const [battleId] of owned.slice(
      0,
      Math.max(0, owned.length - this.maxBattlesPerAccount),
    )) {
      this.entries.delete(battleId);
    }
  }
}
