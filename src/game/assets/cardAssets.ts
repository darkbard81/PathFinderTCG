import type { CardFrameVariant, CardRarity } from '../data/contracts.js';
import { TEST_CARD_DESIGNS } from '../content/testCardPool.js';

export interface CardArtAssetDefinition {
  readonly cardDefinitionId: string;
  readonly key: string;
  readonly path: string;
}

export const CARD_FRAME_VARIANTS = [
  'COMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
] as const satisfies readonly CardRarity[];

export const CARD_FRAME_ASSET_KEYS = Object.freeze({
  COMMON: 'cards.frame.common',
  RARE: 'cards.frame.rare',
  EPIC: 'cards.frame.epic',
  LEGENDARY: 'cards.frame.legendary',
} as const satisfies Readonly<Record<CardFrameVariant, string>>);
export type CardFrameAssetKey = (typeof CARD_FRAME_ASSET_KEYS)[keyof typeof CARD_FRAME_ASSET_KEYS];

export const CARD_FRAME_ASSET_PATHS = Object.freeze({
  COMMON: '/assets/ui/cards/frame-common.webp',
  RARE: '/assets/ui/cards/frame-rare.webp',
  EPIC: '/assets/ui/cards/frame-epic.webp',
  LEGENDARY: '/assets/ui/cards/frame-legendary.webp',
} as const satisfies Readonly<Record<CardFrameVariant, string>>);

export const CARD_ART_ASSET_DEFINITIONS: readonly CardArtAssetDefinition[] = Object.freeze(
  TEST_CARD_DESIGNS.map(({ definition, presentation }) =>
    Object.freeze({
      cardDefinitionId: definition.id,
      key: presentation.artAssetKey,
      path: `/assets/cards/art/${definition.id}.webp`,
    }),
  ),
);

export function getCardFrameAssetKey(variant: CardFrameVariant): string {
  return CARD_FRAME_ASSET_KEYS[variant];
}
