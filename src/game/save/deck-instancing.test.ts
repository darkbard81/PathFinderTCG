import darkDeckDefinitionData from '../../../cards/deck_dark.json';
import { describe, expect, it } from 'vitest';
import {
  createRuntimeDeckInstanceFromDefinitions,
  readCardDefinitionFile,
} from './deck-instancing';

describe('createRuntimeDeckInstanceFromDefinitions', () => {
  it('creates enemy runtime card instances from deck_dark.json', () => {
    const deck = createRuntimeDeckInstanceFromDefinitions({
      deckId: 'dark-test',
      cardDefinitions: readCardDefinitionFile(darkDeckDefinitionData).cards,
      owner: 'ENEMY',
      unitCount: 29,
    });

    expect(deck.id).toBe('dark-test');
    expect(deck.leader.instance.owner).toBe('ENEMY');
    expect(deck.leader.instance.zone).toBe('LEADER');
    expect(deck.leader.definition.id).toBe('leader_dark_empress');
    expect(deck.cards).toHaveLength(29);
    expect(deck.cards.every((card) => card.instance.owner === 'ENEMY')).toBe(true);
    expect(deck.cards.every((card) => card.instance.zone === 'DECK')).toBe(true);
    expect(deck.cards.every((card) => card.definition.id.startsWith('unit_dark_'))).toBe(true);
  });
});
