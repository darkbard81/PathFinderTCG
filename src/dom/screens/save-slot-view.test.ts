import { describe, expect, it } from 'vitest';
import type { SaveSlotSummary } from '../../game/save/types';
import { formatSaveSlotDate, formatSaveSlotSubtitle } from './save-slot-view';

const occupiedSlot: SaveSlotSummary = {
  slotId: 1,
  saveName: 'Slot 1',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deckCardCount: 29,
  leaderName: '미네르바',
  isEmpty: false,
};

describe('formatSaveSlotSubtitle', () => {
  it('returns create copy for empty slots', () => {
    expect(
      formatSaveSlotSubtitle({
        slotId: 2,
        saveName: null,
        updatedAt: null,
        deckCardCount: null,
        leaderName: null,
        isEmpty: true,
      }),
    ).toBe('Create New Save');
  });

  it('joins available summary fields for occupied slots', () => {
    const subtitle = formatSaveSlotSubtitle(occupiedSlot);

    expect(subtitle).toContain('29 cards');
    expect(subtitle).toContain('Leader: 미네르바');
    expect(subtitle).toContain('Updated');
  });

  it('falls back when no detail fields exist', () => {
    expect(
      formatSaveSlotSubtitle({
        slotId: 3,
        saveName: 'Legacy',
        updatedAt: null,
        deckCardCount: null,
        leaderName: null,
        isEmpty: false,
      }),
    ).toBe('Ready to load');
  });
});

describe('formatSaveSlotDate', () => {
  it('returns the original string when the value is not a date', () => {
    expect(formatSaveSlotDate('not-a-date')).toBe('not-a-date');
  });

  it('formats a valid ISO timestamp with the Korean locale', () => {
    const formatted = formatSaveSlotDate('2024-01-01T00:00:00.000Z');

    expect(formatted).not.toBe('2024-01-01T00:00:00.000Z');
    expect(formatted.length).toBeGreaterThan(0);
  });
});
