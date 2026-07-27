import { describe, expectTypeOf, it } from 'vitest';

import type {
  ActiveSkill,
  CardDefinition,
  Effect,
  EffectTarget,
  PassiveSkill,
  ReactiveSkill,
} from './card.js';

describe('card declaration types', () => {
  it('exposes the event subject without adding a generic zone selector', () => {
    expectTypeOf<'TRIGGER_SUBJECT'>().toExtend<EffectTarget>();
    expectTypeOf<'ZONE_CARD'>().not.toExtend<EffectTarget>();
    expectTypeOf<{
      readonly type: 'PLACE';
      readonly target: 'TRIGGER_SUBJECT';
    }>().toExtend<Effect>();
  });

  it('requires descriptions on cards and every skill kind', () => {
    expectTypeOf<CardDefinition>().toHaveProperty('description').toEqualTypeOf<string>();
    expectTypeOf<ActiveSkill>().toHaveProperty('description').toEqualTypeOf<string>();
    expectTypeOf<ReactiveSkill>().toHaveProperty('description').toEqualTypeOf<string>();
    expectTypeOf<PassiveSkill>().toHaveProperty('description').toEqualTypeOf<string>();
  });

  it('distinguishes leader and unit card definitions', () => {
    expectTypeOf<CardDefinition>().toHaveProperty('type').toEqualTypeOf<'LEADER' | 'UNIT'>();
  });
});
