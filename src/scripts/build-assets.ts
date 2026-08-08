import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appConfig } from '../config';

const assetsRoot = path.resolve('assets');
const outputFile = path.join(assetsRoot, 'assets.json');
const manifestBase = {
  schemaVersion: 2,
  revisionAlgorithm: 'sha256-12hex',
  assetBaseUrl: appConfig.assets.assetBaseUrl,
};
const textureExtensions = new Set(['.png', '.webp']);
const videoExtensions = new Set(['.webm']);
const attackMotionPathPrefix = 'motion/attack/';

/**
 * 런타임 자산이 아니라 다른 자산을 만들기 위한 원본이라 manifest에 올리지 않는다.
 * source_badge.png는 배지 4개를 잘라내는 2MB짜리 2x2 시트다.
 */
const excludedAssetPaths = new Set(['cards/badge/source_badge.png']);

type AssetManifestEntry = {
  key: string;
  path: string;
  revision: string;
};

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/** 파일 경로를 assets 루트 기준 슬래시 경로로 바꾼다. */
function toRelativePath(filePath: string): string {
  return path.relative(assetsRoot, filePath).split(path.sep).join('/');
}

/**
 * 파일 경로를 manifest용 텍스처 키로 바꾼다.
 * 폴더 구조를 점으로 이어 namespace처럼 취급한다.
 */
function buildKey(filePath: string): string {
  const parts = toRelativePath(filePath).split('/');
  const baseName = path.parse(parts.at(-1) ?? '').name;
  const namespace = parts[0];
  const folderName = parts.slice(1, -1).join('.');

  return folderName ? `${namespace}.${folderName}.${baseName}` : `${namespace}.${baseName}`;
}

/**
 * manifest에 기록할 상대 경로와 revision을 계산한다.
 */
async function buildManifestEntry(filePath: string): Promise<AssetManifestEntry> {
  const buffer = await readFile(filePath);
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 12);

  return {
    key: buildKey(filePath),
    path: toRelativePath(filePath),
    revision: hash,
  };
}

/**
 * 일반공격 모션으로 사용할 `motion/attack` webm만 video manifest 대상으로 판별한다.
 */
function isAttackMotionVideo(filePath: string): boolean {
  return (
    toRelativePath(filePath).startsWith(attackMotionPathPrefix) &&
    videoExtensions.has(path.extname(filePath).toLowerCase())
  );
}

/**
 * `assets/`를 순회해 텍스처와 전투 모션 manifest를 다시 생성한다.
 * 실제 파일 해시와 경로를 함께 넣어 런타임 캐시 무결성을 유지한다.
 */
async function main(): Promise<void> {
  const textures: AssetManifestEntry[] = [];
  const videos: AssetManifestEntry[] = [];
  const files = await walk(assetsRoot);

  for (const filePath of files) {
    if (filePath === outputFile || excludedAssetPaths.has(toRelativePath(filePath))) {
      continue;
    }

    if (isAttackMotionVideo(filePath)) {
      videos.push(await buildManifestEntry(filePath));
      continue;
    }

    if (!textureExtensions.has(path.extname(filePath).toLowerCase())) {
      continue;
    }

    textures.push(await buildManifestEntry(filePath));
  }

  textures.sort((left, right) => left.key.localeCompare(right.key));
  videos.sort((left, right) => left.key.localeCompare(right.key));

  const manifestBody = {
    ...manifestBase,
    textures,
    videos,
  };
  const manifestRevision = createHash('sha256')
    .update(`${JSON.stringify(manifestBody, null, 2)}\n`)
    .digest('hex')
    .slice(0, 12);

  await writeFile(
    outputFile,
    `${JSON.stringify(
      {
        ...manifestBody,
        manifestRevision,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`assets.json 갱신: 텍스처 ${textures.length}개, 모션 ${videos.length}개`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
