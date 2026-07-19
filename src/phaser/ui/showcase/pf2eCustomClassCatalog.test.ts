import { describe, expect, it } from 'vitest';

import {
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

  it('keeps behavior configuration out of themed component adapters', () => {
    const behaviorKeys = [
      'onActivate?',
      'onButtonClick?',
      'onPageChange?',
      'onScroll?',
      'onSelectionChange?',
      'onConfirm?',
      'onCancel?',
      'initialSelectedId?',
    ];
    const configKeys = PF2E_CUSTOM_CLASS_CATALOG.flatMap(({ configKeys: keys }) => keys);
    expect(configKeys).not.toEqual(expect.arrayContaining(behaviorKeys));
  });
});
