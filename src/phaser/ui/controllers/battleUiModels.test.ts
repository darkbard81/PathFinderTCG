import { describe, expect, it } from 'vitest';

import { TEST_CARD_CATALOG } from '../../../game/content/index.js';
import { createPhaseFiveBattleFixture } from '../../../game/simulation/battle/battleTestFixtures.js';
import {
  createBattleActionListItems,
  createBattleCardViewModel,
  formatBattleFieldPosition,
} from './battleUiModels.js';

describe('battleUiModels', () => {
  it('formats field positions for user-facing action rows', () => {
    expect(formatBattleFieldPosition('FRONT_CENTER')).toBe('전열 중앙');
    expect(formatBattleFieldPosition('BACK_RIGHT')).toBe('후열 오른쪽');
  });

  it('exposes every legal action without changing its simulation payload', () => {
    const fixture = createPhaseFiveBattleFixture();
    const state = fixture.session.getState();
    const actions = fixture.session.getLegalActions();
    const items = createBattleActionListItems(state, actions, fixture.cardDefinitions);

    expect(items).toHaveLength(actions.length);
    expect(items.map((item) => item.action)).toEqual(actions);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it('shows remaining HP and effective battle stats on a field card', () => {
    const fixture = createPhaseFiveBattleFixture();
    const state = fixture.session.getState();
    const leaderId = state.players.PLAYER.leaderCardId;
    const model = createBattleCardViewModel(
      state,
      leaderId,
      fixture.cardDefinitions,
      TEST_CARD_CATALOG.cardPresentations,
    );

    expect(model.id).toBe(leaderId);
    expect(model.isLeader).toBe(true);
    expect(model.card.stats.hp).toBeGreaterThan(0);
    expect(model.card.artAssetKey).toMatch(/^cards\.art\./);
  });
});
