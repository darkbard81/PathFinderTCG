import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { TEST_CARD_DESIGNS } from '../../src/game/content/testCardPool.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const LOG_PATH = path.join(PROJECT_ROOT, 'public/plan/Phase_4_generation_log.json');
const FRAME_ASSET_IDS = ['frame-common', 'frame-rare', 'frame-epic', 'frame-legendary'];
const CARD_PROMPT_VERSION = 'phase-4-card-art-v2';
const FRAME_PROMPT_VERSION = 'phase-4-card-frame-v1';
const EXPECTED_ASSET_IDS = [
  ...TEST_CARD_DESIGNS.map(({ definition }) => definition.id),
  ...FRAME_ASSET_IDS,
];
const DEFAULT_MAXIMUM_ATTEMPTS = 3;
const APPROVED_ATTEMPT_OVERRIDE = Object.freeze({
  assetId: 'allied-grove-renewer',
  maximumAttempts: 4,
  approvedBy: 'user',
  approvedAt: '2026-07-27',
  approvalText: 'allied-grove-renewer 동일 고정 프롬프트 4차 1회 승인',
  promptVersion: CARD_PROMPT_VERSION,
  promptMutationAllowed: false,
});
const FINAL_STATUSES = new Set(['SUCCESS', 'RETRY', 'BLOCKED']);
const REQUIRED_STRING_FIELDS = ['assetId', 'executedAt', 'tool', 'promptVersion', 'finalStatus'];

function requireObject(value, message) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

function validateAttemptOverrides(rawOverrides) {
  if (!Array.isArray(rawOverrides) || rawOverrides.length !== 1) {
    throw new Error('attemptOverrides must contain exactly the approved fourth-attempt record.');
  }
  const override = requireObject(rawOverrides[0], 'attemptOverrides[0] must be an object.');
  for (const [field, expectedValue] of Object.entries(APPROVED_ATTEMPT_OVERRIDE)) {
    if (override[field] !== expectedValue) {
      throw new Error(`attemptOverrides[0].${field} must be ${JSON.stringify(expectedValue)}.`);
    }
  }
  return new Map([[override.assetId, override.maximumAttempts]]);
}

function validateEntryShape(rawEntry, index, maximumAttempts) {
  const entry = requireObject(rawEntry, `entries[${index}] must be an object.`);
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) {
      throw new Error(`entries[${index}].${field} must be a non-empty string.`);
    }
  }
  if (!Number.isInteger(entry.attempt) || entry.attempt < 1 || entry.attempt > maximumAttempts) {
    throw new Error(
      `entries[${index}].attempt must be an integer from 1 through ${maximumAttempts}.`,
    );
  }
  if (!FINAL_STATUSES.has(entry.finalStatus)) {
    throw new Error(`entries[${index}].finalStatus is unsupported: ${entry.finalStatus}`);
  }
  if (
    entry.resultPath !== null &&
    (typeof entry.resultPath !== 'string' || entry.resultPath.length === 0)
  ) {
    throw new Error(`entries[${index}].resultPath must be null or a non-empty string.`);
  }
  if (entry.finalStatus === 'SUCCESS' && entry.resultPath === null) {
    throw new Error(`entries[${index}] SUCCESS must record a result path.`);
  }
  if (
    entry.toolErrorOrFailedCriterion !== null &&
    (typeof entry.toolErrorOrFailedCriterion !== 'string' ||
      entry.toolErrorOrFailedCriterion.length === 0)
  ) {
    throw new Error(
      `entries[${index}].toolErrorOrFailedCriterion must be null or a non-empty string.`,
    );
  }
  if (
    (entry.finalStatus === 'RETRY' || entry.finalStatus === 'BLOCKED') &&
    entry.toolErrorOrFailedCriterion === null
  ) {
    throw new Error(
      `entries[${index}] ${entry.finalStatus} must record the failed criterion or tool error.`,
    );
  }
  return entry;
}

async function validateResultPath(resultPath) {
  const absolutePath = path.resolve(PROJECT_ROOT, resultPath);
  const relativePath = path.relative(PROJECT_ROOT, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Generation result path escapes the project: ${resultPath}`);
  }
  await access(absolutePath);
}

async function main() {
  const requireComplete = process.argv.includes('--require-complete');
  const parsed = JSON.parse(await readFile(LOG_PATH, 'utf8'));
  const log = requireObject(parsed, 'Generation log root must be an object.');
  if (log.schemaVersion !== 1) {
    throw new Error(`Unsupported generation-log schema version: ${String(log.schemaVersion)}`);
  }
  if (!Array.isArray(log.entries)) {
    throw new Error('Generation log entries must be an array.');
  }
  const attemptLimits = validateAttemptOverrides(log.attemptOverrides);

  const expectedIds = new Set(EXPECTED_ASSET_IDS);
  const entriesByAsset = new Map(EXPECTED_ASSET_IDS.map((assetId) => [assetId, []]));
  for (const [index, rawEntry] of log.entries.entries()) {
    const candidate = requireObject(rawEntry, `entries[${index}] must be an object.`);
    const maximumAttempts = attemptLimits.get(candidate.assetId) ?? DEFAULT_MAXIMUM_ATTEMPTS;
    const entry = validateEntryShape(candidate, index, maximumAttempts);
    if (!expectedIds.has(entry.assetId)) {
      throw new Error(`Generation log contains unknown asset ID: ${entry.assetId}`);
    }
    const expectedPromptVersion = FRAME_ASSET_IDS.includes(entry.assetId)
      ? FRAME_PROMPT_VERSION
      : CARD_PROMPT_VERSION;
    if (entry.promptVersion !== expectedPromptVersion) {
      throw new Error(
        `${entry.assetId} uses prompt version ${entry.promptVersion}; expected ${expectedPromptVersion}.`,
      );
    }
    if (!entry.tool.startsWith('built-in $imagegen')) {
      throw new Error(`${entry.assetId} uses an unapproved generation tool: ${entry.tool}`);
    }
    entriesByAsset.get(entry.assetId).push(entry);
    if (entry.resultPath !== null) {
      await validateResultPath(entry.resultPath);
    }
  }

  const successfulAssetIds = [];
  const blockedAssetIds = [];
  const pendingAssetIds = [];
  for (const [assetId, entries] of entriesByAsset) {
    if (entries.length === 0) {
      pendingAssetIds.push(assetId);
      continue;
    }
    const maximumAttempts = attemptLimits.get(assetId) ?? DEFAULT_MAXIMUM_ATTEMPTS;
    if (entries.length > maximumAttempts) {
      throw new Error(
        `${assetId} has ${entries.length} attempts; the maximum is ${maximumAttempts}.`,
      );
    }
    for (const [index, entry] of entries.entries()) {
      const expectedAttempt = index + 1;
      if (entry.attempt !== expectedAttempt) {
        throw new Error(
          `${assetId} attempt order is invalid: expected ${expectedAttempt}, received ${entry.attempt}.`,
        );
      }
      const isLast = index === entries.length - 1;
      const isExplicitlyReopenedBlock =
        entry.finalStatus === 'BLOCKED' &&
        entry.attempt === DEFAULT_MAXIMUM_ATTEMPTS &&
        maximumAttempts > DEFAULT_MAXIMUM_ATTEMPTS;
      if (!isLast && entry.finalStatus !== 'RETRY' && !isExplicitlyReopenedBlock) {
        throw new Error(
          `${assetId} attempt ${entry.attempt} must be RETRY or an explicitly reopened BLOCKED attempt before another attempt.`,
        );
      }
      if (!isLast && entry.finalStatus === 'SUCCESS') {
        throw new Error(`${assetId} has an attempt after its first SUCCESS.`);
      }
    }

    const lastEntry = entries.at(-1);
    if (lastEntry.finalStatus === 'SUCCESS') {
      successfulAssetIds.push(assetId);
    } else if (lastEntry.finalStatus === 'BLOCKED') {
      if (lastEntry.attempt !== maximumAttempts) {
        throw new Error(`${assetId} can be BLOCKED only after attempt ${maximumAttempts}.`);
      }
      blockedAssetIds.push(assetId);
    } else {
      pendingAssetIds.push(assetId);
    }
  }

  if (!Array.isArray(log.blockedAssetIds)) {
    throw new Error('blockedAssetIds must be an array.');
  }
  const declaredBlockedAssetIds = [...log.blockedAssetIds].sort();
  const derivedBlockedAssetIds = [...blockedAssetIds].sort();
  if (JSON.stringify(declaredBlockedAssetIds) !== JSON.stringify(derivedBlockedAssetIds)) {
    throw new Error(
      `blockedAssetIds mismatch: declared=${JSON.stringify(declaredBlockedAssetIds)}, derived=${JSON.stringify(derivedBlockedAssetIds)}.`,
    );
  }
  const derivedStatus =
    blockedAssetIds.length === 0 && pendingAssetIds.length === 0 ? 'COMPLETE' : 'BLOCKED';
  if (log.status !== derivedStatus) {
    throw new Error(`Generation log status must be ${derivedStatus}, received ${log.status}.`);
  }

  if (requireComplete) {
    if (log.status !== 'COMPLETE') {
      throw new Error(`A complete audit requires log status COMPLETE, received ${log.status}.`);
    }
    if (pendingAssetIds.length > 0 || blockedAssetIds.length > 0) {
      throw new Error(
        `Generation log is incomplete: pending=${pendingAssetIds.length}, blocked=${blockedAssetIds.length}.`,
      );
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'PASS',
        requireComplete,
        expectedAssetCount: EXPECTED_ASSET_IDS.length,
        successfulAssetCount: successfulAssetIds.length,
        blockedAssetIds,
        pendingAssetIds,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
