import { describe, expect, it } from 'vitest';

import {
  getAdjacentPF2eCustomClassId,
  PF2E_CUSTOM_CLASS_CATALOG,
  PF2E_CUSTOM_CLASS_IDS,
  PF2E_DEFAULT_CUSTOM_CLASS_ID,
} from './pf2eCustomClassCatalog';

describe('PF2e custom class catalog', () => {
  it('declares two unique class identifiers in display order', () => {
    expect(PF2E_CUSTOM_CLASS_IDS).toEqual(['ninePatch2', 'nineLabel']);
    expect(new Set(PF2E_CUSTOM_CLASS_CATALOG.map(({ id }) => id)).size).toBe(
      PF2E_CUSTOM_CLASS_CATALOG.length,
    );
    expect(PF2E_DEFAULT_CUSTOM_CLASS_ID).toBe('ninePatch2');
  });

  it('wraps keyboard focus in both directions', () => {
    expect(getAdjacentPF2eCustomClassId('ninePatch2', 'next')).toBe('nineLabel');
    expect(getAdjacentPF2eCustomClassId('nineLabel', 'next')).toBe('ninePatch2');
    expect(getAdjacentPF2eCustomClassId('ninePatch2', 'previous')).toBe('nineLabel');
    expect(getAdjacentPF2eCustomClassId('nineLabel', 'previous')).toBe('ninePatch2');
  });
});
