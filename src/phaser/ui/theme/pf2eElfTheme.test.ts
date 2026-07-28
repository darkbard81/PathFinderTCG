import { describe, expect, it } from 'vitest';

import { CARD_FRAME_ASSET_KEYS } from '../../../game/assets/cardAssets';
import { ASSET_KEYS, assetManifest } from '../../../game/assets/manifest';
import {
  PF2E_BADGE_TYPES,
  PF2E_ELF_THEME,
  PF2E_LABEL_VARIANTS,
  PF2E_VISUAL_STATES,
} from './pf2eElfTheme';

describe('PF2E_ELF_THEME', () => {
  it('defines every basic UI surface without image asset slices', () => {
    expect(Object.keys(PF2E_ELF_THEME.surfaces)).toEqual([
      'panel',
      'control',
      'tab',
      'scrollTrack',
      'scrollThumb',
      'gridCell',
      'dialog',
      'button',
    ]);
    for (const style of Object.values(PF2E_ELF_THEME.surfaces)) {
      expect(style.radius).toBeGreaterThan(0);
      expect(style.strokeWidth).toBeGreaterThan(0);
      expect(style.fillAlpha).toBeGreaterThan(0);
    }
    expect(
      assetManifest.some((entry) => entry.type === 'image' && entry.path.includes('ninepatch')),
    ).toBe(false);
  });

  it('keeps the scrollbar at the compact themed width', () => {
    expect(PF2E_ELF_THEME.sizes.scrollbar).toBe(24);
  });

  it('defines every interactive visual state and label variant', () => {
    expect(Object.keys(PF2E_ELF_THEME.visualStates)).toEqual([...PF2E_VISUAL_STATES]);
    expect(Object.keys(PF2E_ELF_THEME.label)).toEqual([...PF2E_LABEL_VARIANTS]);
  });

  it('maps every badge type to a stable manifest asset', () => {
    expect(Object.keys(PF2E_ELF_THEME.components.badgeLabel.variants)).toEqual([
      ...PF2E_BADGE_TYPES,
    ]);
    expect(PF2E_ELF_THEME.components.badgeLabel.variants).toMatchObject({
      default: { key: ASSET_KEYS.pf2eElfBadge },
      cost: { key: ASSET_KEYS.pf2eElfBadgeCost },
      dominance: { key: ASSET_KEYS.pf2eElfBadge },
      attack: { key: ASSET_KEYS.pf2eElfBadgeAttack },
      health: { key: ASSET_KEYS.pf2eElfBadgeHealth },
      defense: { key: ASSET_KEYS.pf2eElfBadgeDefense },
    });
  });

  it('maps every card rarity to its transparent frame overlay asset', () => {
    expect(PF2E_ELF_THEME.components.card.frameVariants).toEqual({
      COMMON: { key: CARD_FRAME_ASSET_KEYS.COMMON },
      RARE: { key: CARD_FRAME_ASSET_KEYS.RARE },
      EPIC: { key: CARD_FRAME_ASSET_KEYS.EPIC },
      LEGENDARY: { key: CARD_FRAME_ASSET_KEYS.LEGENDARY },
    });
    expect(PF2E_ELF_THEME.components.card.frameDisplayScale).toBeGreaterThan(1);
    expect(PF2E_ELF_THEME.components.card.frameDisplayScale).toBeLessThan(1.1);
  });

  it('defines a positive content area inside every minimum label height', () => {
    for (const style of Object.values(PF2E_ELF_THEME.label)) {
      expect(style.minHeight).toBeGreaterThan(style.paddingY * 2);
    }
  });
});
