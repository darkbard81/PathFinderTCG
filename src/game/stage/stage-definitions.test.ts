import { describe, expect, it } from 'vitest';
import { createDefaultStageProgressState } from './progress';
import { loadStageDefinitions } from './stage-loader';
import {
  findStageDefinition,
  isStageUnlocked,
  listStageDefinitions,
  requireStageDefinition,
} from './stage-definitions';
import { resolveStageEnemyDeck } from './stage-enemy-decks';
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
  startAdv: null,
  endAdv: null,
  battleBgmId: null,
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
      startAdv: null,
      endAdv: null,
      battleBgmId: null,
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
      // 전투 곡은 스테이지 데이터가 정한다. 정렬순서 3번 곡이 첫 스테이지에 붙는다.
      battleBgmId: 'pf2etcg-intro',
      startAdv: expect.objectContaining({
        beats: expect.arrayContaining([
          expect.objectContaining({ cutsceneAssetKey: 'adv.level01.start.cutscene' }),
          expect.objectContaining({ speaker: '우쭈링' }),
          expect.objectContaining({ speaker: '주인공' }),
        ]),
      }),
      endAdv: expect.objectContaining({
        beats: expect.arrayContaining([
          expect.objectContaining({ cutsceneAssetKey: 'adv.level01.end.cutscene' }),
          expect.objectContaining({ faceAssetKey: 'adv.level01.shared.ujjuring-face-startled' }),
          expect.objectContaining({ standings: [] }),
        ]),
      }),
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
        stageBgmIds: {},
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
        stageBgmIds: {},
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
    startAdv: null,
    endAdv: null,
    battleBgmId: null,
    ...overrides,
  };
}

describe('전투 BGM', () => {
  it('스테이지가 정한 곡 id를 읽는다', () => {
    const stages = loadStageDefinitions({
      'cards/stages/stage_a.json': createStageData({ id: 'a', order: 1, battleBgmId: 'comic' }),
    });

    expect(stages[0]?.battleBgmId).toBe('comic');
  });

  it('없거나 null이면 흐르던 곡을 그대로 두라는 뜻이다', () => {
    const stages = loadStageDefinitions({
      'cards/stages/stage_a.json': createStageData({ id: 'a', order: 1, battleBgmId: null }),
      'cards/stages/stage_b.json': createStageData({ id: 'b', order: 2, battleBgmId: undefined }),
    });

    expect(stages.map((stage) => stage.battleBgmId)).toEqual([null, null]);
  });

  it('빈 문자열은 거부한다', () => {
    // 지운 것인지 오타인지 구분할 수 없다. 지울 때는 null을 쓴다.
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_a.json': createStageData({ battleBgmId: '' }),
      }),
    ).toThrow('battleBgmId must be a non-empty string or null');
  });

  it('실제 스테이지 데이터에 곡이 겹치지 않는다', () => {
    const assigned = listStageDefinitions()
      .map((stage) => stage.battleBgmId)
      .filter((trackId): trackId is string => trackId !== null);

    expect(new Set(assigned).size).toBe(assigned.length);
  });
});

describe('Stage ADV', () => {
  const validAdv = {
    beats: [
      {
        speaker: '우쭈링',
        text: '앉아. 덱 들어.',
        faceAssetKey: 'adv.level01.shared.ujjuring-face-taunt',
        cutsceneAssetKey: 'adv.level01.start.cutscene',
        standings: [{ assetKey: 'adv.level01.shared.ujjuring-standing', position: 'center' }],
      },
    ],
  };

  it('정상 Start와 End 정의를 읽는다', () => {
    const [stage] = loadStageDefinitions({
      'cards/stages/stage_adv.json': createStageData({ startAdv: validAdv, endAdv: validAdv }),
    });

    expect(stage?.startAdv).toEqual(validAdv);
    expect(stage?.endAdv).toEqual(validAdv);
  });

  it('누락하거나 null이면 ADV가 없는 것으로 맞춘다', () => {
    const stages = loadStageDefinitions({
      'cards/stages/stage_missing.json': createStageData({
        id: 'missing',
        order: 1,
        startAdv: undefined,
        endAdv: undefined,
      }),
      'cards/stages/stage_null.json': createStageData({
        id: 'null',
        order: 2,
        startAdv: null,
        endAdv: null,
      }),
    });

    expect(stages.map((stage) => [stage.startAdv, stage.endAdv])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('adv.* 밖의 자산 키를 거부한다', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_bad_adv.json': createStageData({
          startAdv: {
            beats: [{ ...validAdv.beats[0], cutsceneAssetKey: 'ui.title-screen' }],
          },
        }),
      }),
    ).toThrow('cutsceneAssetKey must be an adv.* asset key');
  });

  it('빈 자산 키와 잘못된 스탠딩 위치를 거부한다', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_empty_key.json': createStageData({
          startAdv: { beats: [{ ...validAdv.beats[0], cutsceneAssetKey: '' }] },
        }),
      }),
    ).toThrow('cutsceneAssetKey must be an adv.* asset key');

    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_bad_position.json': createStageData({
          startAdv: {
            beats: [
              {
                ...validAdv.beats[0],
                standings: [{ ...validAdv.beats[0]!.standings[0], position: 'front' }],
              },
            ],
          },
        }),
      }),
    ).toThrow('position is not supported: front');
  });

  it('빈 대사 목록과 빈 본문을 거부한다', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_empty_beats.json': createStageData({
          startAdv: { ...validAdv, beats: [] },
        }),
      }),
    ).toThrow('beats must contain at least one beat');

    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_empty_text.json': createStageData({
          startAdv: {
            ...validAdv,
            beats: [{ ...validAdv.beats[0], text: '' }],
          },
        }),
      }),
    ).toThrow('beats[0].text must be a non-empty string');
  });

  it('한 beat 안의 중복 스탠딩 위치를 거부한다', () => {
    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_duplicate_position.json': createStageData({
          startAdv: {
            beats: [
              {
                ...validAdv.beats[0],
                standings: [
                  validAdv.beats[0]!.standings[0],
                  { assetKey: 'adv.level01.shared.companion-standing', position: 'center' },
                ],
              },
            ],
          },
        }),
      }),
    ).toThrow('beats[0].standings has duplicate position: center');
  });

  it('첫 beat 뒤에는 visual 변경분을 생략하거나 새 상태로 바꿀 수 있다', () => {
    const changedAdv = {
      beats: [
        validAdv.beats[0],
        {
          speaker: null,
          text: '같은 화면을 유지한다.',
          faceAssetKey: null,
        },
        {
          speaker: null,
          text: '장면이 바뀐다.',
          faceAssetKey: null,
          cutsceneAssetKey: 'adv.level01.start.cutscene-next',
          standings: [],
        },
      ],
    };

    const [stage] = loadStageDefinitions({
      'cards/stages/stage_adv_changes.json': createStageData({ startAdv: changedAdv }),
    });

    expect(stage?.startAdv).toEqual(changedAdv);
    expect(stage?.startAdv?.beats[1]).not.toHaveProperty('cutsceneAssetKey');
    expect(stage?.startAdv?.beats[1]).not.toHaveProperty('standings');
    expect(stage?.startAdv?.beats[2]).toMatchObject({
      cutsceneAssetKey: 'adv.level01.start.cutscene-next',
      standings: [],
    });
  });

  it('첫 beat에 초기 컷씬이 없으면 거부한다', () => {
    const firstBeat = validAdv.beats[0]!;
    const firstBeatWithoutCutscene = {
      speaker: firstBeat.speaker,
      text: firstBeat.text,
      faceAssetKey: firstBeat.faceAssetKey,
      standings: firstBeat.standings,
    };

    expect(() =>
      loadStageDefinitions({
        'cards/stages/stage_missing_initial_cutscene.json': createStageData({
          startAdv: { beats: [firstBeatWithoutCutscene] },
        }),
      }),
    ).toThrow('beats[0].cutsceneAssetKey must be an adv.* asset key');
  });
});
