import { describe, expect, it } from 'vitest';

import { ASSET_KEYS, assetManifest } from '../../../game/assets/manifest';
import {
  PF2E_ELF_THEME,
  PF2E_NINE_LABEL_VARIANTS,
  PF2E_NINE_PATCH_VISUAL_STATES,
} from './pf2eElfTheme';

describe('PF2E_ELF_THEME', () => {
  it('maps every nine-patch variant to a stable manifest asset', () => {
    expect(PF2E_ELF_THEME.ninePatch.panel.key).toBe(ASSET_KEYS.pf2eElfPanel);
    expect(PF2E_ELF_THEME.ninePatch.control.key).toBe(ASSET_KEYS.pf2eElfControl);
    expect(PF2E_ELF_THEME.ninePatch.tab.key).toBe(ASSET_KEYS.pf2eElfTab);

    expect(assetManifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfPanel, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfControl, type: 'image' }),
        expect.objectContaining({ key: ASSET_KEYS.pf2eElfTab, type: 'image' }),
      ]),
    );
  });

  it('declares the normalized nine-patch slices', () => {
    expect(PF2E_ELF_THEME.ninePatch.panel.columns).toEqual([104, undefined, 104]);
    expect(PF2E_ELF_THEME.ninePatch.panel.rows).toEqual([104, undefined, 104]);
    expect(PF2E_ELF_THEME.ninePatch.control.columns).toEqual([56, undefined, 56]);
    expect(PF2E_ELF_THEME.ninePatch.control.rows).toEqual([32, undefined, 32]);
    expect(PF2E_ELF_THEME.ninePatch.tab.columns).toEqual([56, undefined, 56]);
    expect(PF2E_ELF_THEME.ninePatch.tab.rows).toEqual([32, undefined, 32]);
  });

  it('scales edge cells and repeats the seamless internal cell', () => {
    expect(PF2E_ELF_THEME.ninePatchStretchMode).toEqual({
      edge: 'scale',
      internal: 'repeat',
    });
  });

  it('defines every interactive visual state and label variant', () => {
    expect(Object.keys(PF2E_ELF_THEME.visualStates)).toEqual([...PF2E_NINE_PATCH_VISUAL_STATES]);
    expect(Object.keys(PF2E_ELF_THEME.label)).toEqual([...PF2E_NINE_LABEL_VARIANTS]);
  });

  it('defines a positive content area inside every minimum label height', () => {
    for (const style of Object.values(PF2E_ELF_THEME.label)) {
      expect(style.minHeight).toBeGreaterThan(style.paddingY * 2);
    }
  });
});
