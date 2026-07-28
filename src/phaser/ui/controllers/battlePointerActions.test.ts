import { describe, expect, it } from 'vitest';

import type { BattleAction } from '../../../game/simulation/battle/index.js';
import {
  findDirectBattleAction,
  getDirectActiveSkillSourceIds,
  getDirectCardTargets,
} from './battlePointerActions.js';

const ACTIONS: readonly BattleAction[] = Object.freeze([
  Object.freeze({ type: 'DRAW' }),
  Object.freeze({ type: 'DRAW', activeSkillSourceCardId: 'skill-source' }),
  Object.freeze({ type: 'PLACE', cardId: 'hand-card', fieldPosition: 'FRONT_LEFT' }),
  Object.freeze({
    type: 'PLACE',
    cardId: 'hand-card',
    fieldPosition: 'FRONT_LEFT',
    activeSkillSourceCardId: 'skill-source',
  }),
  Object.freeze({ type: 'MOVE', cardId: 'field-card', fieldPosition: 'BACK_LEFT' }),
  Object.freeze({ type: 'ATTACK', cardId: 'field-card', targetCardId: 'enemy-card' }),
  Object.freeze({ type: 'DISCARD', cardId: 'hand-card' }),
  Object.freeze({ type: 'END_TURN' }),
]);

describe('battlePointerActions', () => {
  it('selects the base action unless an Active Skill source is armed', () => {
    expect(findDirectBattleAction(ACTIONS, { type: 'DRAW' })).toEqual({ type: 'DRAW' });
    expect(findDirectBattleAction(ACTIONS, { type: 'DRAW' }, 'skill-source')).toEqual({
      type: 'DRAW',
      activeSkillSourceCardId: 'skill-source',
    });
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
  });

  it('collects direct field, attack, and discard targets for a selected card', () => {
    expect(getDirectCardTargets(ACTIONS, 'hand-card')).toEqual({
      fieldPositions: ['FRONT_LEFT'],
      targetCardIds: [],
      canDiscard: true,
    });
    expect(getDirectCardTargets(ACTIONS, 'field-card')).toEqual({
      fieldPositions: ['BACK_LEFT'],
      targetCardIds: ['enemy-card'],
      canDiscard: false,
    });
  });

  it('lists unique Active Skill source cards exposed by legal actions', () => {
    expect(getDirectActiveSkillSourceIds(ACTIONS)).toEqual(['skill-source']);
  });
});
