import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { TEST_CARD_DESIGNS } from '../../src/game/content/testCardPool.ts';

export const CARD_PROMPT_VERSION = 'phase-4-card-art-v2';
const FRAME_PROMPT_VERSION = 'phase-4-card-frame-v1';
export const CARD_CHARACTER_CONTRACT =
  'One clearly adult elf woman with an H-Cup body, wearing Cut-Open Style fantasy clothing';
const FRAME_COLORS = {
  COMMON: '#9A7944',
  RARE: '#8CC9AA',
  EPIC: '#8A6BC1',
  LEGENDARY: '#E6C768',
};
const FRAME_CHROMA_KEYS = {
  COMMON: '#FF00FF',
  RARE: '#FF00FF',
  EPIC: '#00FF00',
  LEGENDARY: '#FF00FF',
};

function cardPrompt(design) {
  const { definition, artDirection } = design;
  return {
    assetId: definition.id,
    promptVersion: CARD_PROMPT_VERSION,
    prompt: [
      'Use case: stylized-concept',
      'Asset type: production portrait card art for a fantasy browser TCG',
      `Primary request: ${CARD_CHARACTER_CONTRACT}, representing "${definition.name}"`,
      `Scene/backdrop: ${artDirection.scene}`,
      `Subject and equipment: ${artDirection.equipment}`,
      `Pose: ${artDirection.pose}`,
      'Style/medium: polished 2.5D fantasy TCG asset illustration; painterly depth with clean readable silhouette',
      'Composition/framing: portrait 2:3; one character only; keep the face, hands, and key equipment fully inside an 8 percent safe margin',
      `Color palette: ${artDirection.palette}`,
      'Text (verbatim): none',
      'Constraints: exactly one clearly adult elf woman; no frame; no border; no text; no number; no logo; no signature; no watermark',
      'Avoid: cropped face or equipment, extra people, extra limbs or fingers, malformed hands, duplicated equipment',
    ].join('\n'),
  };
}

function framePrompt(rarity, color, chromaKey) {
  return {
    assetId: `frame-${rarity.toLowerCase()}`,
    promptVersion: FRAME_PROMPT_VERSION,
    prompt: [
      'Use case: stylized-concept',
      'Asset type: production transparent-overlay card frame for a fantasy browser TCG',
      `Primary request: one front-facing PF2e-inspired carved elven fantasy card frame for ${rarity} rarity, with ${color} as the dominant accent color`,
      'Style/medium: polished 2.5D painted game UI ornament; carved wood, leaf filigree, restrained metal inlay',
      'Composition/framing: exact portrait 2:3 rectangle; symmetrical outer frame; continuous clean silhouette; generous transparent-intended inner art window',
      `Scene/backdrop: perfectly flat solid ${chromaKey} chroma-key fill in the entire inner window and outside all four rounded frame corners`,
      'Constraints: one frame only; no card art; no character; no text; no letters; no numbers; no icon; no logo; no signature; no watermark; no shadow; no reflection',
      `Chroma constraints: ${chromaKey} must be perfectly uniform with no gradient, texture, lighting variation, or use inside the frame ornament`,
    ].join('\n'),
  };
}

export function createGenerationPromptManifest() {
  return {
    characterContract: CARD_CHARACTER_CONTRACT,
    cardPromptVersion: CARD_PROMPT_VERSION,
    framePromptVersion: FRAME_PROMPT_VERSION,
    cards: TEST_CARD_DESIGNS.map((design) => cardPrompt(design)),
    frames: Object.entries(FRAME_COLORS).map(([rarity, color]) =>
      framePrompt(rarity, color, FRAME_CHROMA_KEYS[rarity]),
    ),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  process.stdout.write(`${JSON.stringify(createGenerationPromptManifest(), null, 2)}\n`);
}
