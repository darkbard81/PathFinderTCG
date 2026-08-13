import { describe, expect, it } from 'vitest';
import { listStageDefinitions } from '../game/stage/stage-definitions';
import { resolveStageEnemyDeck } from '../game/stage/stage-enemy-decks';
import { readServerCardDefinitions } from './card-definition-catalog';
import { StageCatalog } from './stage-catalog';

/**
 * 서버는 Stage와 카드 정의를 디스크에서 직접 읽는다. Stage 목록은 브라우저 번들과 같고,
 * 적 덱은 테스트용 번들 카탈로그와 같아야 한다. 갈라지면 화면과 서버가 다른 판을 본다.
 */
describe('StageCatalog', () => {
  const catalog = new StageCatalog();

  it('브라우저 카탈로그와 같은 Stage 목록을 만든다', () => {
    expect(catalog.listStages()).toEqual(listStageDefinitions());
  });

  it('번들 적 덱 카탈로그와 같은 적 덱을 찾는다', () => {
    for (const stage of listStageDefinitions()) {
      expect(catalog.resolveEnemyDeck(stage)).toEqual(resolveStageEnemyDeck(stage));
    }
  });

  it('없는 Stage는 전투 시작을 막을 수 있게 예외를 던진다', () => {
    expect(() => catalog.requireStage('unknown-stage')).toThrow(/Unknown stageId/);
  });
});

describe('readServerCardDefinitions', () => {
  it('브라우저가 자동 등록한 카드 정의와 같은 결과를 만든다', async () => {
    const { ALL_CARD_DEFINITIONS } = await import('../game/save/auto-card-catalog');

    expect(readServerCardDefinitions()).toEqual(ALL_CARD_DEFINITIONS);
  });
});
