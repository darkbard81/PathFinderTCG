import type { CardDefinition } from './card.js';
import type { CardFrameVariant, CardPresentation, CardRarity } from '../data/contracts.js';

export interface CardStatDisplay {
  readonly cost: number;
  readonly dominance: number;
  readonly attack: number;
  readonly hp: number;
}

export interface CardDisplayModel {
  readonly cardDefinitionId: string;
  readonly name: string;
  readonly rulesText: string;
  readonly rarity: CardRarity;
  readonly artAssetKey: string;
  readonly frameVariant: CardFrameVariant;
  readonly stats: CardStatDisplay;
}

export function createCardDisplayModel(
  definition: CardDefinition,
  presentation: CardPresentation,
): CardDisplayModel {
  if (presentation.cardDefinitionId !== definition.id) {
    throw new Error(
      `Card presentation ${presentation.cardDefinitionId} does not match definition ${definition.id}.`,
    );
  }

  const skillDescriptions = [
    definition.activeSkill && `ACTIVE · ${definition.activeSkill.description}`,
    definition.reactiveSkill && `REACTIVE · ${definition.reactiveSkill.description}`,
    definition.passiveSkill && `PASSIVE · ${definition.passiveSkill.description}`,
  ].filter((description): description is string => description !== undefined);

  return Object.freeze({
    cardDefinitionId: definition.id,
    name: definition.name,
    rulesText:
      skillDescriptions.length === 0 ? definition.description : skillDescriptions.join('\n'),
    rarity: presentation.rarity,
    artAssetKey: presentation.artAssetKey,
    frameVariant: presentation.frameVariant,
    stats: Object.freeze({
      cost: definition.cost,
      dominance: definition.dominance,
      attack: definition.attack,
      hp: definition.hp,
    }),
  });
}
