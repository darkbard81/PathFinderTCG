import { describe, expectTypeOf, it } from 'vitest';

import type { Effect, EffectTarget } from './card.js';

describe('card declaration types', () => {
  it('exposes the event subject without adding a generic zone selector', () => {
    expectTypeOf<'TRIGGER_SUBJECT'>().toExtend<EffectTarget>();
    expectTypeOf<'ZONE_CARD'>().not.toExtend<EffectTarget>();
    expectTypeOf<{
      readonly type: 'PLACE';
      readonly target: 'TRIGGER_SUBJECT';
    }>().toExtend<Effect>();
  });
});
