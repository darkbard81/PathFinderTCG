import { describe, expect, it } from 'vitest';
import type { BattleSession } from './battle-session';
import { BattleStore } from './battle-store';

function createSession(battleId: string): BattleSession {
  return { battleId } as unknown as BattleSession;
}

describe('BattleStore', () => {
  it('계정이 소유한 전투만 돌려준다', () => {
    const store = new BattleStore();
    const session = createSession('battle-1');
    store.add('account-a', session);

    expect(store.read('account-a', 'battle-1')).toBe(session);
    // battleId를 알아내도 남의 전투는 만질 수 없어야 한다.
    expect(store.read('account-b', 'battle-1')).toBeNull();
    expect(store.delete('account-b', 'battle-1')).toBe(false);
  });

  it('오래 손대지 않은 전투는 버린다', () => {
    let now = 0;
    const store = new BattleStore({ ttlMs: 100, now: () => now });
    store.add('account-a', createSession('battle-1'));

    now = 50;
    expect(store.read('account-a', 'battle-1')).not.toBeNull();

    // 방금 읽어 시각이 갱신됐다. 그 뒤로 다시 TTL이 지나야 사라진다.
    now = 200;
    expect(store.read('account-a', 'battle-1')).toBeNull();
    expect(store.size).toBe(0);
  });

  it('한 계정이 열어 둘 수 있는 전투 수를 넘기면 오래된 것부터 버린다', () => {
    let now = 0;
    const store = new BattleStore({ maxBattlesPerAccount: 2, now: () => now });
    for (const battleId of ['battle-1', 'battle-2', 'battle-3']) {
      now += 1;
      store.add('account-a', createSession(battleId));
    }

    expect(store.read('account-a', 'battle-1')).toBeNull();
    expect(store.read('account-a', 'battle-2')).not.toBeNull();
    expect(store.read('account-a', 'battle-3')).not.toBeNull();
  });

  it('계정마다 따로 센다', () => {
    const store = new BattleStore({ maxBattlesPerAccount: 1 });
    store.add('account-a', createSession('battle-a'));
    store.add('account-b', createSession('battle-b'));

    expect(store.read('account-a', 'battle-a')).not.toBeNull();
    expect(store.read('account-b', 'battle-b')).not.toBeNull();
  });
});
