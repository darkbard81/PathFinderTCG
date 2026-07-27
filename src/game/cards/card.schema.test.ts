import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import cardSchema from './card.schema.json';
import { flameKnight } from './example.js';

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});
const validateCard = ajv.compile(cardSchema);

const cardWithoutSkills = {
  id: 'training-unit',
  name: '훈련용 유닛',
  description: 'JSON Schema 검증에 사용하는 기본 카드다.',
  type: 'UNIT',
  cost: 1,
  dominance: 1,
  hp: 2,
  attack: 1,
};

describe('card JSON schema', () => {
  it('compiles as Draft 2020-12 and accepts the checked-in card example', () => {
    expect(validateCard(flameKnight), JSON.stringify(validateCard.errors)).toBe(true);
  });

  it('targets the card that damaged Flame Knight with its retaliation', () => {
    expect(flameKnight.reactiveSkill?.effects).toEqual([
      {
        type: 'DAMAGE',
        target: 'TRIGGER_SOURCE',
        amount: 1,
      },
    ]);
  });

  it('requires a non-empty card description', () => {
    expect(
      validateCard({
        id: 'missing-card-description',
        name: '설명 없는 카드',
        type: 'UNIT',
        cost: 1,
        dominance: 1,
        hp: 1,
        attack: 1,
      }),
    ).toBe(false);

    expect(
      validateCard({
        ...cardWithoutSkills,
        description: '',
      }),
    ).toBe(false);
  });

  it.each([
    {
      field: 'activeSkill',
      skill: {
        id: 'missing-active-description',
        type: 'ACTIVE',
        action: 'ATTACK',
        effects: [{ type: 'DAMAGE', target: 'ACTION_TARGET', amount: 1 }],
      },
    },
    {
      field: 'reactiveSkill',
      skill: {
        id: 'missing-reactive-description',
        type: 'REACTIVE',
        trigger: { type: 'DAMAGE_RECEIVED', subject: 'SELF' },
        effects: [{ type: 'HEAL', target: 'SELF', amount: 1 }],
      },
    },
    {
      field: 'passiveSkill',
      skill: {
        id: 'missing-passive-description',
        type: 'PASSIVE',
        effects: [{ type: 'MODIFY_STAT', target: 'SELF', stat: 'ATTACK', amount: 1 }],
      },
    },
  ])('requires description on $field', ({ field, skill }) => {
    expect(
      validateCard({
        ...cardWithoutSkills,
        [field]: skill,
      }),
    ).toBe(false);

    expect(validateCard.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'required',
          params: {
            missingProperty: 'description',
          },
        }),
      ]),
    );
  });

  it('accepts descriptions on all three skill kinds', () => {
    expect(
      validateCard({
        ...cardWithoutSkills,
        activeSkill: {
          id: 'described-active',
          description: '공격할 때 공격 대상에게 피해 1을 준다.',
          type: 'ACTIVE',
          action: 'ATTACK',
          effects: [{ type: 'DAMAGE', target: 'ACTION_TARGET', amount: 1 }],
        },
        reactiveSkill: {
          id: 'described-reactive',
          description: '피해를 받으면 이 카드의 피해를 1 회복한다.',
          type: 'REACTIVE',
          trigger: { type: 'DAMAGE_RECEIVED', subject: 'SELF' },
          effects: [{ type: 'HEAL', target: 'SELF', amount: 1 }],
        },
        passiveSkill: {
          id: 'described-passive',
          description: '이 카드의 공격력을 1 높인다.',
          type: 'PASSIVE',
          effects: [{ type: 'MODIFY_STAT', target: 'SELF', stat: 'ATTACK', amount: 1 }],
        },
      }),
      JSON.stringify(validateCard.errors),
    ).toBe(true);
  });

  it('applies the core stat ranges for leaders and units', () => {
    expect(
      validateCard({
        ...cardWithoutSkills,
        id: 'training-leader',
        name: '훈련용 리더',
        description: '리더 수치 범위를 검증한다.',
        type: 'LEADER',
        cost: 0,
        dominance: 2,
        hp: 20,
        attack: 2,
      }),
      JSON.stringify(validateCard.errors),
    ).toBe(true);

    expect(
      validateCard({
        ...cardWithoutSkills,
        hp: 20,
      }),
    ).toBe(false);

    expect(
      validateCard({
        ...cardWithoutSkills,
        type: 'LEADER',
        cost: 1,
        dominance: 2,
        hp: 20,
        attack: 2,
      }),
    ).toBe(false);
  });

  it('accepts every Effect variant with its required payload', () => {
    expect(
      validateCard({
        ...cardWithoutSkills,
        activeSkill: {
          id: 'all-effects',
          description: '모든 Effect variant의 JSON 구조를 검증한다.',
          type: 'ACTIVE',
          action: 'END_TURN',
          effects: [
            { type: 'DAMAGE', target: 'OPPONENT', amount: 1 },
            { type: 'HEAL', target: 'SELF', amount: 1 },
            { type: 'DRAW', target: 'OWNER', count: 1 },
            { type: 'MOVE', target: 'SELF' },
            { type: 'PLACE', target: 'TRIGGER_SUBJECT' },
            { type: 'DESTROY', target: 'ACTION_TARGET' },
            { type: 'DISCARD', target: 'OPPONENT', count: 1 },
            { type: 'MODIFY_STAT', target: 'SELF', stat: 'DOMINANCE', amount: -1 },
            { type: 'ADD_STATUS', target: 'TRIGGER_SOURCE', statusId: 'EXILED' },
            { type: 'REMOVE_STATUS', target: 'TRIGGER_SUBJECT', statusId: 'EXILED' },
          ],
        },
      }),
      JSON.stringify(validateCard.errors),
    ).toBe(true);
  });

  it('rejects fields that do not belong to an Effect variant', () => {
    expect(
      validateCard({
        ...cardWithoutSkills,
        activeSkill: {
          id: 'invalid-move',
          description: 'MOVE에는 amount 필드를 사용할 수 없다.',
          type: 'ACTIVE',
          action: 'MOVE',
          effects: [{ type: 'MOVE', target: 'SELF', amount: 1 }],
        },
      }),
    ).toBe(false);
  });
});
