import { describe, expect, it } from 'vitest';
import { createDefaultResourceState, normalizeResourceState } from './resource-state';

describe('resource state', () => {
  it('starts every resource at zero', () => {
    expect(createDefaultResourceState()).toEqual({ gold: 0, manaStone: 0, summonTicket: 0 });
  });

  it('hands out a fresh object so callers cannot share a balance', () => {
    const first = createDefaultResourceState();
    first.gold = 100;

    expect(createDefaultResourceState().gold).toBe(0);
  });

  it('defaults the whole state when schemaVersion 5 and below omit the field', () => {
    expect(normalizeResourceState(undefined)).toEqual({
      gold: 0,
      manaStone: 0,
      summonTicket: 0,
    });
  });

  it('keeps balances that are already valid', () => {
    expect(normalizeResourceState({ gold: 125_680, manaStone: 8_420, summonTicket: 12 })).toEqual({
      gold: 125_680,
      manaStone: 8_420,
      summonTicket: 12,
    });
  });

  it('fills in a missing resource so adding a fourth one later cannot block old saves', () => {
    expect(normalizeResourceState({ gold: 500 })).toEqual({
      gold: 500,
      manaStone: 0,
      summonTicket: 0,
    });
  });

  it('drops unknown fields instead of carrying them into the save', () => {
    expect(normalizeResourceState({ gold: 1, crystals: 999 })).toEqual({
      gold: 1,
      manaStone: 0,
      summonTicket: 0,
    });
  });

  it('rejects a balance that is not a count', () => {
    // 잘못 읽은 잔액을 0으로 눌러 담으면 가진 것을 말없이 빼앗는 셈이라 막는다.
    expect(() => normalizeResourceState({ gold: -1 })).toThrow(/gold/);
    expect(() => normalizeResourceState({ manaStone: 1.5 })).toThrow(/manaStone/);
    expect(() => normalizeResourceState({ summonTicket: Number.NaN })).toThrow(/summonTicket/);
    expect(() => normalizeResourceState({ gold: Number.POSITIVE_INFINITY })).toThrow(/gold/);
    expect(() => normalizeResourceState({ gold: '100' })).toThrow(/gold/);
    expect(() => normalizeResourceState({ gold: null })).toThrow(/gold/);
  });

  it('rejects a balance too large to count exactly', () => {
    expect(() => normalizeResourceState({ gold: Number.MAX_SAFE_INTEGER + 2 })).toThrow(/gold/);
  });

  it('rejects a non-object state', () => {
    expect(() => normalizeResourceState(42)).toThrow(/resource state/);
    expect(() => normalizeResourceState('gold')).toThrow(/resource state/);
  });
});
