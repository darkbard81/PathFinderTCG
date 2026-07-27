import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import sharp from 'sharp';

import { TEST_CARD_DESIGNS } from '../../src/game/content/testCardPool.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE_ROOT = path.join(PROJECT_ROOT, 'assets-source/cards');
const SOURCE_ART_ROOT = path.join(SOURCE_ROOT, 'art');
const SOURCE_FRAME_ROOT = path.join(SOURCE_ROOT, 'frames');
const RUNTIME_ART_ROOT = path.join(PROJECT_ROOT, 'public/assets/cards/art');
const RUNTIME_FRAME_ROOT = path.join(PROJECT_ROOT, 'public/assets/ui/cards');

const SOURCE_WIDTH = 1024;
const SOURCE_HEIGHT = 1536;
const RUNTIME_WIDTH = 768;
const RUNTIME_HEIGHT = 1152;
const ART_WEBP_QUALITY = 88;
const MAX_ART_BYTES = 1_500_000;
const MAX_FRAME_BYTES = 2_000_000;
const FRAME_VARIANTS = ['common', 'rare', 'epic', 'legendary'];

function readKind() {
  const kindArgument = process.argv.find((argument) => argument.startsWith('--kind='));
  const kind = kindArgument?.slice('--kind='.length) ?? 'all';
  if (!['all', 'art', 'frames'].includes(kind)) {
    throw new Error(`Unsupported --kind value: ${kind}`);
  }
  return kind;
}

async function inspectSource(sourcePath, { requireAlpha, requireOpaque }) {
  const image = sharp(sourcePath, { failOn: 'error' });
  const metadata = await image.metadata();
  if (
    metadata.format !== 'png' ||
    metadata.width !== SOURCE_WIDTH ||
    metadata.height !== SOURCE_HEIGHT
  ) {
    throw new Error(
      `${sourcePath} must be a ${SOURCE_WIDTH}x${SOURCE_HEIGHT} PNG; received ` +
        `${metadata.format ?? 'unknown'} ${metadata.width ?? '?'}x${metadata.height ?? '?'}.`,
    );
  }
  if (requireAlpha && !metadata.hasAlpha) {
    throw new Error(`${sourcePath} must contain an alpha channel.`);
  }
  if (requireOpaque && metadata.hasAlpha) {
    const stats = await image.stats();
    const alpha = stats.channels[3];
    if (!alpha || alpha.min !== 255) {
      throw new Error(`${sourcePath} card art must be fully opaque.`);
    }
  }
}

async function replaceAtomically(temporaryPath, targetPath) {
  try {
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function assertRuntimeAsset(targetPath, { requireAlpha, maxBytes }) {
  const metadata = await sharp(targetPath, { failOn: 'error' }).metadata();
  if (
    metadata.format !== 'webp' ||
    metadata.width !== RUNTIME_WIDTH ||
    metadata.height !== RUNTIME_HEIGHT
  ) {
    throw new Error(`${targetPath} must decode as ${RUNTIME_WIDTH}x${RUNTIME_HEIGHT} WebP.`);
  }
  if (metadata.hasAlpha !== requireAlpha) {
    throw new Error(
      `${targetPath} alpha mismatch: expected ${String(requireAlpha)}, received ${String(metadata.hasAlpha)}.`,
    );
  }
  const fileStats = await stat(targetPath);
  if (fileStats.size > maxBytes) {
    throw new Error(`${targetPath} is ${fileStats.size} bytes; limit is ${maxBytes} bytes.`);
  }
  return fileStats.size;
}

async function buildCardArt(cardDefinitionId) {
  const sourcePath = path.join(SOURCE_ART_ROOT, `${cardDefinitionId}.png`);
  const targetPath = path.join(RUNTIME_ART_ROOT, `${cardDefinitionId}.webp`);
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  await inspectSource(sourcePath, { requireAlpha: false, requireOpaque: true });
  await sharp(sourcePath, { failOn: 'error' })
    .removeAlpha()
    .resize(RUNTIME_WIDTH, RUNTIME_HEIGHT, {
      fit: 'cover',
      position: 'attention',
    })
    .webp({
      quality: ART_WEBP_QUALITY,
      smartSubsample: true,
    })
    .toFile(temporaryPath);
  await replaceAtomically(temporaryPath, targetPath);
  const bytes = await assertRuntimeAsset(targetPath, {
    requireAlpha: false,
    maxBytes: MAX_ART_BYTES,
  });
  return { assetId: cardDefinitionId, sourcePath, targetPath, bytes };
}

async function buildCardFrame(variant) {
  const sourcePath = path.join(SOURCE_FRAME_ROOT, `frame-${variant}.png`);
  const targetPath = path.join(RUNTIME_FRAME_ROOT, `frame-${variant}.webp`);
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  await inspectSource(sourcePath, { requireAlpha: true, requireOpaque: false });
  await sharp(sourcePath, { failOn: 'error' })
    .resize(RUNTIME_WIDTH, RUNTIME_HEIGHT, {
      fit: 'fill',
    })
    .webp({
      lossless: true,
      alphaQuality: 100,
    })
    .toFile(temporaryPath);
  await replaceAtomically(temporaryPath, targetPath);
  const bytes = await assertRuntimeAsset(targetPath, {
    requireAlpha: true,
    maxBytes: MAX_FRAME_BYTES,
  });
  return { assetId: `frame-${variant}`, sourcePath, targetPath, bytes };
}

async function main() {
  const kind = readKind();
  const results = [];
  await mkdir(RUNTIME_ART_ROOT, { recursive: true });
  await mkdir(RUNTIME_FRAME_ROOT, { recursive: true });

  if (kind === 'all' || kind === 'art') {
    for (const { definition } of TEST_CARD_DESIGNS) {
      results.push(await buildCardArt(definition.id));
    }
  }
  if (kind === 'all' || kind === 'frames') {
    for (const variant of FRAME_VARIANTS) {
      results.push(await buildCardFrame(variant));
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        tool: `sharp@${sharp.versions.sharp}`,
        artWebpQuality: ART_WEBP_QUALITY,
        runtimeSize: `${RUNTIME_WIDTH}x${RUNTIME_HEIGHT}`,
        maxArtBytes: MAX_ART_BYTES,
        maxFrameBytes: MAX_FRAME_BYTES,
        results,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
