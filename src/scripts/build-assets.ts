import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appConfig } from '../config';
import { classifyRuntimeAsset, type RuntimeAssetKind } from './classify-runtime-asset';

const assetsRoot = path.resolve('assets');
const outputFile = path.join(assetsRoot, 'assets.json');
const manifestBase = {
  schemaVersion: 3,
  revisionAlgorithm: 'sha256-12hex',
  assetBaseUrl: appConfig.assets.assetBaseUrl,
};

/**
 * manifest에 올릴 런타임 자산 폴더다. 여기 없는 폴더는 훑지 않는다.
 *
 * assets/ 전체를 훑으면 카드 이미지를 굽기 위한 원본까지 딸려 들어온다.
 * pf2e/monster_core/arts 1378MB, cards/png 381MB, cards/arts 272MB가 그것이고,
 * 런타임은 이 셋을 한 번도 요청하지 않는다. 프리로드는 화면용 .webp/.webm만 고르고
 * (src/pixi/assets/preload-assets.ts), 그 밖에 manifest를 키로 조회하는 코드는 없다.
 * 담을 곳을 명시해야 새 원본 폴더가 생겨도 조용히 섞여 들어오지 않는다.
 *
 * motion/attack은 뺐다. 재생하는 코드가 아직 없어서 프리로드가 부팅마다 17MB를
 * 받고 버리기만 한다. 모션을 쓰게 되면 이 목록에 한 줄 되돌리면 된다.
 *
 * sound는 넣는다. BGM MP3와 voice/SFX WebM은 `audio`
 * 배열에 따로 담기고 `selectPreloadAssets`가 그 배열을 보지 않으므로 부팅에 딸려오지
 * 않는다. 여기 올리는 것은 revision을 얻기 위해서다. 그래야 4MB짜리 BGM이 내용 해시로
 * 강한 ETag를 받아, 자산 트리를 다시 받아 mtime만 바뀌어도 재다운로드되지 않는다.
 */
const runtimeAssetDirs = ['adv', 'cards/webp', 'cards/badge', 'cards/standing', 'ui', 'sound'];

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

/**
 * 런타임 자산 폴더만 훑는다.
 * 목록에 적힌 폴더가 아직 없어도 진행한다. 자산 트리는 저장소에 없을 수 있다.
 */
async function collectRuntimeFiles(): Promise<string[]> {
  const files: string[] = [];

  for (const dir of runtimeAssetDirs) {
    files.push(...(await walk(path.join(assetsRoot, dir))));
  }

  return files;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        console.warn(`자산 폴더 없음, 건너뜀: ${toRelativePath(dir)}`);
        return [];
      }

      throw error;
    },
  );
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
 * `runtimeAssetDirs`를 순회해 텍스처와 전투 모션, 소리 manifest를 다시 생성한다.
 * 실제 파일 해시와 경로를 함께 넣어 런타임 캐시 무결성을 유지한다.
 */
async function main(): Promise<void> {
  const buckets: Record<RuntimeAssetKind, AssetManifestEntry[]> = {
    texture: [],
    video: [],
    audio: [],
  };
  const files = await collectRuntimeFiles();

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    if (filePath === outputFile || excludedAssetPaths.has(relativePath)) {
      continue;
    }

    const kind = classifyRuntimeAsset(relativePath);
    if (!kind) {
      continue;
    }

    buckets[kind].push(await buildManifestEntry(filePath));
  }

  const { texture: textures, video: videos, audio } = buckets;
  for (const entries of [textures, videos, audio]) {
    entries.sort((left, right) => left.key.localeCompare(right.key));
  }

  const manifestBody = {
    ...manifestBase,
    textures,
    videos,
    audio,
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

  console.log(
    `assets.json 갱신: 텍스처 ${textures.length}개, 모션 ${videos.length}개, 소리 ${audio.length}개`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
