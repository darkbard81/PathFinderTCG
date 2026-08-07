import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 카드 정의의 출처 검증에 사용하는 PF2E 몬스터 원본 항목이다. */
export type MonsterCoreEntry = {
  _id: string;
  details: {
    level: { value: number };
    safeNotes: string;
  };
};

const MONSTER_CORE_PATH = resolve('assets/pf2e/monster_core/pf2e_monster_core.json');

/**
 * PF2E 원본 데이터가 로컬 자산 트리에 존재하는지 나타낸다.
 * 이 자산은 git 추적 대상이 아니므로 출처 검증 테스트는 이 값으로 건너뛴다.
 */
export const hasMonsterCoreData = existsSync(MONSTER_CORE_PATH);

/**
 * PF2E 몬스터 원본 데이터를 읽는다.
 * 정적 import는 자산이 없는 환경에서 모듈 로드를 실패시키므로 호출 시점에 읽는다.
 */
export function loadMonsterCoreData(): MonsterCoreEntry[] {
  if (!hasMonsterCoreData) {
    return [];
  }

  return JSON.parse(readFileSync(MONSTER_CORE_PATH, 'utf8')) as MonsterCoreEntry[];
}
