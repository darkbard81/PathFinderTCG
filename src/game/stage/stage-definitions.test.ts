import { describe, expect, it } from 'vitest';
import { createDefaultStageProgressState } from './progress';
import { loadStageDefinitions } from './stage-loader';
import {
  findStageDefinition,
  isStageUnlocked,
  listStageDefinitions,
  requireStageDefinition,
  resolveStageEnemyDeck,
} from './stage-definitions';
import type { StageDefinition } from './types';

const TEST_STAGE_DATA = {
  id: 'test-stage-dark',
  order: 1,
  name: 'Test Stage',
  description: '기본 전투 흐름과 리더 격파 승리 조건을 검증하는 테스트 Stage입니다.',
  enemyDeckId: 'deck-enemy-dark-test',
  enemyDeckPath: 'cards/deck_dark.json',
  victoryCondition: { type: 'DEFEAT_ENEMY_LEADER' },
  defeatConditions: [{ type: 'PLAYER_LEADER_DEFEATED' }],
  rewards: {
    description: '승리 시 적 배하 카드 일부를 보상 후보로 사용할 수 있습니다.',
    enemyCardDrop: {
      source: 'ENEMY_DROP',
      chancePercent: 20,
      maxCards: 1,
      excludeLeader: true,
    },
  },
  unlock: { type: 'ALWAYS' },
} satisfies StageDefinition;

describe('stage definitions', () => {
  it('lists the test stage as data-driven stage content', () => {
    const stages = listStageDefinitions();
    const testStage = stages.find((stage) => stage.id === 'test-stage-dark');

    expect(testStage).toMatchObject({
      id: 'test-stage-dark',
      order: 1,
      name: 'Test Stage',
      enemyDeckId: 'deck-enemy-dark-test',
      enemyDeckPath: 'cards/deck_dark.json',
      victoryCondition: { type: 'DEFEAT_ENEMY_LEADER' },
      defeatConditions: [{ type: 'PLAYER_LEADER_DEFEATED' }],
      rewards: {
        enemyCardDrop: {
          source: 'ENEMY_DROP',
          chancePercent: 20,
          maxCards: 1,
          excludeLeader: true,
        },
      },
      unlock: { type: 'ALWAYS' },
    });
  });

  it('keeps the test stage unlocked by default', () => {
    const stage = requireStageDefinition('test-stage-dark');

    expect(isStageUnlocked(stage, createDefaultStageProgressState())).toBe(true);
  });

  it('resolves the stage enemy deck from the automatically registered deck map', () => {
    const stage = requireStageDefinition('test-stage-dark');
    const enemyDeck = resolveStageEnemyDeck(stage);

    expect(enemyDeck.deckId).toBe('deck-enemy-dark-test');
    expect(enemyDeck.deckPath).toBe('cards/deck_dark.json');
    expect(
      enemyDeck.cardDefinitionFile.cards.some((card) => card.id === 'leader_dark_empress'),
    ).toBe(true);
  });

  it('resolves the Level 01 stage with its PF2E enemy deck', () => {
    const stage = requireStageDefinition('level01');
    const enemyDeck = resolveStageEnemyDeck(stage);

    expect(stage).toMatchObject({
      name: 'Level 01',
      unlock: { type: 'ALWAYS' },
    });
    expect(enemyDeck.deckId).toBe('deck-enemy-level01');
    expect(enemyDeck.deckPath).toBe('cards/deck_level01.json');
    expect(enemyDeck.cardDefinitionFile.cards.some((card) => card.id === 'oaxKg1yQDmK2PWXG')).toBe(
      true,
    );
  });

  it('resolves Level 02 and unlocks it only after Level 01 is cleared', () => {
    const stage = requireStageDefinition('level02');
    const enemyDeck = resolveStageEnemyDeck(stage);

    expect(stage).toMatchObject({
      name: 'Level 02',
      unlock: { type: 'STAGE_CLEARED', stageId: 'level01' },
    });
    expect(enemyDeck.deckId).toBe('deck-enemy-level02');
    expect(enemyDeck.deckPath).toBe('cards/deck_level02.json');
    expect(enemyDeck.cardDefinitionFile.cards.some((card) => card.id === 'PLZk6zY5iwccPTPS')).toBe(
      true,
    );
    expect(isStageUnlocked(stage, createDefaultStageProgressState())).toBe(false);
    expect(
      isStageUnlocked(stage, {
        clearedStageIds: ['level01'],
        lastSelectedStageId: 'level01',
      }),
    ).toBe(true);
  });

  it.each([
    ['03', '02'],
    ['04', '03'],
    ['05', '04'],
    ['06', '05'],
    ['07', '06'],
  ])('resolves Level %s and unlocks it only after Level %s is cleared', (level, previous) => {
    const stage = requireStageDefinition(`level${level}`);
    const enemyDeck = resolveStageEnemyDeck(stage);

    expect(stage).toMatchObject({
      name: `Level ${level}`,
      unlock: { type: 'STAGE_CLEARED', stageId: `level${previous}` },
    });
    expect(enemyDeck.deckId).toBe(`deck-enemy-level${level}`);
    expect(enemyDeck.deckPath).toBe(`cards/deck_level${level}.json`);
    expect(enemyDeck.cardDefinitionFile.cards).toHaveLength(11);
    expect(isStageUnlocked(stage, createDefaultStageProgressState())).toBe(false);
    expect(
      isStageUnlocked(stage, {
        clearedStageIds: [`level${previous}`],
        lastSelectedStageId: `level${previous}`,
      }),
    ).toBe(true);
  });

  it('returns null for unknown stage ids', () => {
    expect(findStageDefinition('missing-stage')).toBeNull();
  });

  it('sorts loaded JSON stages by order', () => {
    const stages = loadStageDefinitions({
      'cards/stages/stage_second.json': createStageData({ id: 'second-stage', order: 2 }),
      'cards/stages/stage_first.json': createStageData({ id: 'first-stage', order: 1 }),
    });

    expect(stages.map((stage) => stage.id)).toEqual(['first-stage', 'second-stage']);
  });

  it('throws when a required stage field is missing', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_missing_name.json': createStageData({ name: undefined }),
      }),
    ).toThrow('cards/stages/stage_missing_name.json.name must be a non-empty string');
  });

  it('throws when stage ids are duplicated', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_first.json': createStageData({ id: 'duplicated-stage', order: 1 }),
        'cards/stages/stage_second.json': createStageData({ id: 'duplicated-stage', order: 2 }),
      }),
    ).toThrow('Duplicate stage id: duplicated-stage');
  });

  it('throws when stage orders are duplicated', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_first.json': createStageData({ id: 'first-stage', order: 1 }),
        'cards/stages/stage_second.json': createStageData({ id: 'second-stage', order: 1 }),
      }),
    ).toThrow('Duplicate stage order: 1');
  });

  it('accepts future deck JSON paths that follow the deck naming convention', () => {
    const [stage] = loadStageDefinitions({
      'cards/stages/stage_future.json': createStageData({
        enemyDeckPath: 'cards/deck_future.json',
      }),
    });

    expect(stage?.enemyDeckPath).toBe('cards/deck_future.json');
  });

  it('throws when a stage references a path outside the deck naming convention', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_bad_deck.json': createStageData({
          enemyDeckPath: 'assets/deck_missing.json',
        }),
      }),
    ).toThrow(
      'cards/stages/stage_bad_deck.json.enemyDeckPath is not supported: assets/deck_missing.json',
    );
  });

  it('throws when a valid deck path has no matching deck JSON file', () => {
    expect(() =>
      resolveStageEnemyDeck({
        ...TEST_STAGE_DATA,
        id: 'missing-deck-stage',
        enemyDeckPath: 'cards/deck_missing.json',
      }),
    ).toThrow(
      'Stage missing-deck-stage references an unknown enemy deck path: cards/deck_missing.json',
    );
  });

  it('throws when a stage reward uses an unsupported source', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_bad_reward.json': createStageData({
          rewards: {
            description: TEST_STAGE_DATA.rewards.description,
            enemyCardDrop: {
              source: 'CHEST',
              chancePercent: 20,
              maxCards: 1,
              excludeLeader: true,
            },
          },
        }),
      }),
    ).toThrow(
      'cards/stages/stage_bad_reward.json.rewards.enemyCardDrop.source is not supported: CHEST',
    );
  });
});

function createStageData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...TEST_STAGE_DATA,
    victoryCondition: { type: 'DEFEAT_ENEMY_LEADER' },
    defeatConditions: [{ type: 'PLAYER_LEADER_DEFEATED' }],
    rewards: {
      description: TEST_STAGE_DATA.rewards.description,
      enemyCardDrop: {
        source: 'ENEMY_DROP',
        chancePercent: 20,
        maxCards: 1,
        excludeLeader: true,
      },
    },
    unlock: { type: 'ALWAYS' },
    ...overrides,
  };
}
