import { createHash } from 'node:crypto';

import {
  CARD_CHARACTER_CONTRACT,
  CARD_PROMPT_VERSION,
  createGenerationPromptManifest,
} from './print-generation-prompts.js';

const EXPECTED_CARD_COUNT = 32;
const EXPECTED_MANIFEST_SHA256 = '4fd65567930c1d531080d7f25a16ef4c3c14da38aedfd30afce6c622d4108e1c';

const manifest = createGenerationPromptManifest();
const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestSha256 = createHash('sha256').update(serializedManifest).digest('hex');

if (manifest.cardPromptVersion !== CARD_PROMPT_VERSION) {
  throw new Error(`Unexpected card prompt version: ${manifest.cardPromptVersion}`);
}
if (manifest.characterContract !== CARD_CHARACTER_CONTRACT) {
  throw new Error('The frozen card character contract changed.');
}
if (manifest.cards.length !== EXPECTED_CARD_COUNT) {
  throw new Error(
    `Expected ${EXPECTED_CARD_COUNT} card prompts, received ${manifest.cards.length}.`,
  );
}
if (manifestSha256 !== EXPECTED_MANIFEST_SHA256) {
  throw new Error(
    `The frozen Phase 4 prompt manifest changed: expected ${EXPECTED_MANIFEST_SHA256}, received ${manifestSha256}.`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: 'PASS',
      cardPromptVersion: CARD_PROMPT_VERSION,
      cardCount: manifest.cards.length,
      manifestSha256,
    },
    null,
    2,
  )}\n`,
);
