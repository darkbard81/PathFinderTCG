import { describe, expect, it } from 'vitest';

import type { BattleAction } from '../../../game/simulation/battle/index.js';
import {
  findDirectBattleAction,
  getDirectActiveSkillSourceIds,
  getDirectCardTargets,
} from './battlePointerActions.js';

const ACTIONS: readonly BattleAction[] = Object.freeze([
  Object.freeze({ type: 'PLACE', cardId: 'hand-card', fieldPosition: 'FRONT_LEFT' }),
  Object.freeze({ type: 'MOVE', cardId: 'field-card', fieldPosition: 'BACK_LEFT' }),
  Object.freeze({ type: 'ATTACK', cardId: 'field-card', targetCardId: 'enemy-card' }),
  Object.freeze({ type: 'ACTIVE', cardId: 'skill-source', targetCardId: 'skill-target' }),
  Object.freeze({ type: 'ACTIVE', cardId: 'immediate-skill-source' }),
  Object.freeze({ type: 'END_TURN' }),
]);

describe('battlePointerActions', () => {
  it('selects an exact direct or Active intent', () => {
    expect(
      findDirectBattleAction(ACTIONS, {
        type: 'PLACE',
        cardId: 'hand-card',
        fieldPosition: 'FRONT_LEFT',
      }),
    ).toEqual({
      type: 'PLACE',
      cardId: 'hand-card',
      fieldPosition: 'FRONT_LEFT',
    });
    expect(
      findDirectBattleAction(ACTIONS, {
        type: 'ACTIVE',
        cardId: 'skill-source',
        targetCardId: 'skill-target',
      }),
    ).toEqual({
      type: 'ACTIVE',
      cardId: 'skill-source',
      targetCardId: 'skill-target',
    });
  });

  it('collects direct field, attack, and armed Active targets for a selected card', () => {
    expect(getDirectCardTargets(ACTIONS, 'hand-card')).toEqual({
      fieldPositions: ['FRONT_LEFT'],
      targetCardIds: [],
    });
    expect(getDirectCardTargets(ACTIONS, 'field-card')).toEqual({
      fieldPositions: ['BACK_LEFT'],
      targetCardIds: ['enemy-card'],
    });
    expect(getDirectCardTargets(ACTIONS, 'skill-source', 'skill-source')).toEqual({
      fieldPositions: [],
      targetCardIds: ['skill-target'],
    });
  });

  it('lists unique Active Skill source cards exposed by legal actions', () => {
    expect(getDirectActiveSkillSourceIds(ACTIONS)).toEqual([
      'skill-source',
      'immediate-skill-source',
    ]);
  });
});
