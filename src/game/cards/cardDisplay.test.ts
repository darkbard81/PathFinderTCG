import { describe, expect, it } from 'vitest';

import { TEST_CARD_DESIGNS } from '../content/testCardPool.js';
import type { CardPresentation } from '../data/contracts.js';
import { createCardDisplayModel } from './cardDisplay.js';

describe('createCardDisplayModel', () => {
  it('projects every Phase 3 design into card UI data with all four stats', () => {
    for (const { definition, presentation } of TEST_CARD_DESIGNS) {
      const model = createCardDisplayModel(definition, presentation);

      expect(model).toMatchObject({
        cardDefinitionId: definition.id,
        name: definition.name,
        rarity: presentation.rarity,
        artAssetKey: presentation.artAssetKey,
        frameVariant: presentation.frameVariant,
        stats: {
          cost: definition.cost,
          dominance: definition.dominance,
          attack: definition.attack,
          hp: definition.hp,
        },
      });
      expect(model.rulesText.length).toBeGreaterThan(0);
    }
  });

  it('renders every public Skill description and falls back to flavor text without Skills', () => {
    const multiSkillDesign = TEST_CARD_DESIGNS.find(
      ({ definition }) =>
        definition.activeSkill !== undefined && definition.reactiveSkill !== undefined,
    );
    const noSkillDesign = TEST_CARD_DESIGNS.find(
      ({ definition }) =>
        definition.activeSkill === undefined &&
        definition.reactiveSkill === undefined &&
        definition.passiveSkill === undefined,
    );

    expect(multiSkillDesign).toBeDefined();
    expect(noSkillDesign).toBeDefined();

    const multiSkillModel = createCardDisplayModel(
      multiSkillDesign!.definition,
      multiSkillDesign!.presentation,
    );
    expect(multiSkillModel.rulesText).toContain(
      multiSkillDesign!.definition.activeSkill!.description,
    );
    expect(multiSkillModel.rulesText).toContain(
      multiSkillDesign!.definition.reactiveSkill!.description,
    );

    const noSkillModel = createCardDisplayModel(
      noSkillDesign!.definition,
      noSkillDesign!.presentation,
    );
    expect(noSkillModel.rulesText).toBe(noSkillDesign!.definition.description);
  });

  it('rejects a presentation belonging to another definition', () => {
    const design = TEST_CARD_DESIGNS[0]!;
    const mismatchedPresentation: CardPresentation = {
      ...design.presentation,
      cardDefinitionId: 'another-card',
    };

    expect(() => createCardDisplayModel(design.definition, mismatchedPresentation)).toThrow(
      'does not match',
    );
  });
});
