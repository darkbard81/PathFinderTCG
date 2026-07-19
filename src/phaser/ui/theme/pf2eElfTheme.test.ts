import { describe, expect, it } from 'vitest';

import { ASSET_KEYS, assetManifest } from '../../../game/assets/manifest';
import {
  PF2E_BADGE_TYPES,
  PF2E_ELF_THEME,
  PF2E_NINE_LABEL_VARIANTS,
  PF2E_NINE_PATCH_VISUAL_STATES,
} from './pf2eElfTheme';

describe('PF2E_ELF_THEME', () => {
  it('maps every nine-patch variant to a stable manifest asset', () => {
    expect(PF2E_ELF_THEME.ninePatch).toMatchObject({
      panel: { key: ASSET_KEYS.pf2eElfPanel },
      control: { key: ASSET_KEYS.pf2eElfControl },
      tab: { key: ASSET_KEYS.pf2eElfTab },
      scrollTrack: { key: ASSET_KEYS.pf2eElfScrollTrack },
      scrollThumb: { key: ASSET_KEYS.pf2eElfScrollThumb },
      gridCell: { key: ASSET_KEYS.pf2eElfGridCell },
      dialog: { key: ASSET_KEYS.pf2eElfDialog },
      button: { key: ASSET_KEYS.pf2eElfButton },
    });

    expect(assetManifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfPanel, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfControl, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfTab, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfScrollTrack, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfScrollThumb, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfGridCell, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfDialog, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfBadge, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfBadgeCost, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfBadgeAttack, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfBadgeHealth, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfBadgeDefense, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfButton, type: 'image' }),
      ]),
    );
  });

  it('declares the normalized nine-patch slices', () => {
    expect(PF2E_ELF_THEME.ninePatch).toMatchObject({
      panel: { columns: [104, undefined, 104], rows: [104, undefined, 104] },
      control: { columns: [56, undefined, 56], rows: [32, undefined, 32] },
      tab: { columns: [56, undefined, 56], rows: [32, undefined, 32] },
      scrollTrack: { columns: [14, undefined, 14], rows: [92, undefined, 92] },
      scrollThumb: { columns: [20, undefined, 20], rows: [56, undefined, 56] },
      gridCell: { columns: [84, undefined, 84], rows: [48, undefined, 48] },
      dialog: { columns: [96, undefined, 96], rows: [96, undefined, 96] },
      button: { columns: [84, undefined, 84], rows: [44, undefined, 44] },
    });
  });

  it('scales edge cells and repeats the seamless internal cell', () => {
    expect(PF2E_ELF_THEME.ninePatchStretchMode).toEqual({
      edge: 'scale',
      internal: 'repeat',
    });
    expect(PF2E_ELF_THEME.ninePatch.scrollThumb.stretchMode).toEqual({
      edge: 'scale',
      internal: 'scale',
    });
  });

  it('keeps the scrollbar at the compact themed width', () => {
    expect(PF2E_ELF_THEME.sizes.scrollbar).toBe(24);
  });

  it('defines every interactive visual state and label variant', () => {
    expect(Object.keys(PF2E_ELF_THEME.visualStates)).toEqual([...PF2E_NINE_PATCH_VISUAL_STATES]);
    expect(Object.keys(PF2E_ELF_THEME.label)).toEqual([...PF2E_NINE_LABEL_VARIANTS]);
  });

  it('maps every badge type to a stable manifest asset', () => {
    expect(Object.keys(PF2E_ELF_THEME.components.badgeLabel.variants)).toEqual([
      ...PF2E_BADGE_TYPES,
    ]);
    expect(PF2E_ELF_THEME.components.badgeLabel.variants).toMatchObject({
      default: { key: ASSET_KEYS.pf2eElfBadge },
      cost: { key: ASSET_KEYS.pf2eElfBadgeCost },
      attack: { key: ASSET_KEYS.pf2eElfBadgeAttack },
      health: { key: ASSET_KEYS.pf2eElfBadgeHealth },
      defense: { key: ASSET_KEYS.pf2eElfBadgeDefense },
    });
  });

  it('defines a positive content area inside every minimum label height', () => {
    for (const style of Object.values(PF2E_ELF_THEME.label)) {
      expect(style.minHeight).toBeGreaterThan(style.paddingY * 2);
    }
  });
});
