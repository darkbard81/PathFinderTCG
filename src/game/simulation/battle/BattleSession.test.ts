import { describe, expect, it } from 'vitest';

import { BattleSession, createBattleState, resolveBattleAction } from './BattleSession.js';
import { createPhaseFiveBattleFixture } from './battleTestFixtures.js';

describe('Phase 5 BattleSession setup and state contract', () => {
  it('creates serializable independent battle state and preserves both source decks', () => {
    const fixture = createPhaseFiveBattleFixture();
    const playerDeckSnapshot = JSON.stringify(fixture.playerDeck);
    const enemyDeckSnapshot = JSON.stringify(fixture.enemyDeck);
    const state = fixture.session.getState();

    expect(state.schemaVersion).toBe(2);
    expect(state.firstPlayerId).toBe('PLAYER');
    expect(state.activePlayerId).toBe('PLAYER');
    expect(state.turnNumber).toBe(1);
    expect(state.players.PLAYER.handIds).toHaveLength(6);
    expect(state.players.ENEMY.handIds).toHaveLength(5);
    expect(state.players.PLAYER.drawPileIds).toHaveLength(23);
    expect(state.players.ENEMY.drawPileIds).toHaveLength(24);
    expect(state.players.PLAYER.field.BACK_CENTER).toBe(state.players.PLAYER.leaderCardId);
    expect(state.players.ENEMY.field.BACK_CENTER).toBe(state.players.ENEMY.leaderCardId);
    expect(state.cards).toHaveLength(60);
    expect(JSON.stringify(state)).not.toMatch(/Phaser|rexUI|Sprite|HTMLElement/);
    expect(JSON.stringify(fixture.playerDeck)).toBe(playerDeckSnapshot);
    expect(JSON.stringify(fixture.enemyDeck)).toBe(enemyDeckSnapshot);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.cards)).toBe(true);
    expect(Object.isFrozen(state.players.PLAYER.field)).toBe(true);
  });

  it('reproduces setup with the same seed and changes the post-mulligan Deck order with another seed', () => {
    const fixture = createPhaseFiveBattleFixture();
    const first = createBattleState(fixture.setup);
    const repeated = createBattleState(fixture.setup);
    const differentSeed = createBattleState({
      ...fixture.setup,
      seed: fixture.setup.seed + 1,
    });

    expect(repeated).toEqual(first);
    expect(differentSeed.players.PLAYER.handIds.slice(0, 5)).toEqual(
      first.players.PLAYER.handIds.slice(0, 5),
    );
    expect(differentSeed.players.PLAYER.handIds).not.toEqual(first.players.PLAYER.handIds);
    expect(differentSeed.players.PLAYER.drawPileIds).not.toEqual(first.players.PLAYER.drawPileIds);
  });

  it('excludes selected opening cards, draws replacements first, and then reshuffles the exclusions', () => {
    const fixture = createPhaseFiveBattleFixture();
    const initialHandIds = fixture.playerDeck.drawPileIds.slice(0, 5);
    const exchangedIds = initialHandIds.slice(0, 2);
    const state = createBattleState({
      ...fixture.setup,
      playerMulliganCardIds: exchangedIds,
    });

    expect(state.players.PLAYER.handIds).toHaveLength(6);
    expect(
      exchangedIds.every((cardId) => !state.players.PLAYER.handIds.slice(0, 5).includes(cardId)),
    ).toBe(true);
    expect(exchangedIds.every((cardId) => state.players.PLAYER.drawPileIds.includes(cardId))).toBe(
      true,
    );
    expect(state.players.PLAYER.handIds.slice(3, 5)).toEqual(
      fixture.playerDeck.drawPileIds.slice(5, 7),
    );
  });

  it('draws one card automatically at the start of every turn', () => {
    const fixture = createPhaseFiveBattleFixture();
    const before = fixture.session.getState();
    const resolution = fixture.session.resolveAction({ type: 'END_TURN' });
    const after = resolution.finalState;

    expect(before.players.PLAYER.handIds).toHaveLength(6);
    expect(after.activePlayerId).toBe('ENEMY');
    expect(after.turnNumber).toBe(2);
    expect(after.players.PLAYER.handIds).toHaveLength(6);
    expect(after.players.ENEMY.handIds).toHaveLength(6);
    expect(after.players.ENEMY.drawPileIds).toHaveLength(23);
  });

  it('returns ordered atomic snapshots whose last state is the session state', () => {
    const fixture = createPhaseFiveBattleFixture();
    const before = fixture.session.getState();
    const resolution = resolveBattleAction(before, fixture.cardDefinitions, { type: 'END_TURN' });

    expect(resolution.beforeState).toEqual(before);
    expect(resolution.steps.length).toBeGreaterThanOrEqual(4);
    expect(resolution.steps[0]?.effectId).toBe('action:start');
    expect(resolution.steps[0]?.beforeState).toEqual(before);
    for (let index = 1; index < resolution.steps.length; index += 1) {
      expect(resolution.steps[index]?.beforeState).toEqual(resolution.steps[index - 1]?.afterState);
    }
    expect(resolution.steps.at(-1)?.afterState).toEqual(resolution.finalState);
    expect(resolution.steps.flatMap((step) => step.events).map((event) => event.type)).toEqual(
      expect.arrayContaining(['ACTION_STARTED', 'TURN_ENDED', 'TURN_STARTED', 'DRAW']),
    );

    const restored = BattleSession.fromState(resolution.finalState, fixture.cardDefinitions);
    expect(restored.getState()).toEqual(resolution.finalState);
    expect(JSON.stringify(restored.getState())).toBe(JSON.stringify(resolution.finalState));
  });
});
