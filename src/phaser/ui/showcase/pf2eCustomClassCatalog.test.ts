import { describe, expect, it } from 'vitest';

import {
  getAdjacentPF2eCustomClassId,
  PF2E_CUSTOM_CLASS_CATALOG,
  PF2E_CUSTOM_CLASS_IDS,
  PF2E_DEFAULT_CUSTOM_CLASS_ID,
} from './pf2eCustomClassCatalog';

describe('PF2e custom class catalog', () => {
  it('declares nine unique class identifiers in display order', () => {
    expect(PF2E_CUSTOM_CLASS_IDS).toEqual([
      'ninePatch2',
      'nineLabel',
      'panel',
      'tabPages',
      'scrollablePanel',
      'gridTable',
      'confirmDialog',
      'badgeLabel',
      'buttons',
    ]);
    expect(new Set(PF2E_CUSTOM_CLASS_CATALOG.map(({ id }) => id)).size).toBe(
      PF2E_CUSTOM_CLASS_CATALOG.length,
    );
    expect(PF2E_DEFAULT_CUSTOM_CLASS_ID).toBe('ninePatch2');
  });

  it('wraps keyboard focus in both directions', () => {
    for (const [index, classId] of PF2E_CUSTOM_CLASS_IDS.entries()) {
      const nextId = PF2E_CUSTOM_CLASS_IDS[(index + 1) % PF2E_CUSTOM_CLASS_IDS.length];
      const previousId =
        PF2E_CUSTOM_CLASS_IDS[
          (index - 1 + PF2E_CUSTOM_CLASS_IDS.length) % PF2E_CUSTOM_CLASS_IDS.length
        ];
      expect(getAdjacentPF2eCustomClassId(classId, 'next')).toBe(nextId);
      expect(getAdjacentPF2eCustomClassId(classId, 'previous')).toBe(previousId);
    }
  });
});
