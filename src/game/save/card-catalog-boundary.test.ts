import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const srcRoot = path.join(projectRoot, 'src');

/** 브라우저 번들에 들어가는 디렉터리다. */
const CLIENT_ROOTS = ['pixi', 'dom', 'game', 'services', 'tools'];

/**
 * 카드 정의 JSON을 값으로 읽는 모듈이다. 서버·테스트만 import 할 수 있다.
 */
const CARD_DATA_MODULES = new Set([
  path.join(srcRoot, 'game', 'save', 'card-catalog-data.ts'),
  path.join(srcRoot, 'game', 'save', 'auto-card-catalog.ts'),
  path.join(srcRoot, 'game', 'save', 'create-initial-save.ts'),
  path.join(srcRoot, 'game', 'stage', 'stage-enemy-decks.ts'),
]);

function listSourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

function listClientSourceFiles(): string[] {
  return [
    ...CLIENT_ROOTS.flatMap((name) => listSourceFiles(path.join(srcRoot, name))),
    path.join(srcRoot, 'main.ts'),
  ].filter((filePath) => !filePath.endsWith('.test.ts') && !CARD_DATA_MODULES.has(filePath));
}

function listImportSpecifiers(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8');
  return [
    ...source.matchAll(/from\s+'([^']+)'/g),
    ...source.matchAll(/import\.meta\.glob(?:<[^>]+>)?\(\s*'([^']+)'/g),
  ].map((match) => match[1]!);
}

function resolveImportTarget(filePath: string, specifier: string): string | null {
  if (specifier.endsWith('.json')) {
    return path.resolve(path.dirname(filePath), specifier);
  }

  if (!specifier.startsWith('.')) {
    return null;
  }

  const resolved = path.resolve(path.dirname(filePath), specifier);
  return resolved.endsWith('.ts') ? resolved : `${resolved}.ts`;
}

/**
 * 카드 정의 JSON이 브라우저 번들에서 빠졌는지 소스 수준에서 지킨다.
 *
 * 번들을 열어 보는 대신 import 경계를 본다. 화면 코드가 덱 JSON이나 그걸 읽는 모듈을
 * 부르지 않으면 적 구성·미공개 카드 수치가 브라우저로 갈 길이 없다.
 */
describe('카드 정의의 클라이언트 경계', () => {
  it('브라우저 코드는 카드 정의 JSON을 import 하지 않는다', () => {
    const cardsRoot = path.join(projectRoot, 'cards');
    const offenders = listClientSourceFiles().flatMap((filePath) => {
      const hits = listImportSpecifiers(filePath).flatMap((specifier) => {
        if (/cards\/deck_[^']*\.json/.test(specifier) || /\/deck_\*\.json$/.test(specifier)) {
          return [specifier];
        }

        const target = resolveImportTarget(filePath, specifier);
        if (!target) {
          return [];
        }

        if (CARD_DATA_MODULES.has(target) || target.startsWith(`${cardsRoot}${path.sep}deck_`)) {
          return [specifier];
        }

        return [];
      });

      return hits.length > 0 ? [path.relative(projectRoot, filePath)] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('타입·순수 함수 카탈로그는 덱 JSON을 읽지 않는다', () => {
    const catalogSource = fs.readFileSync(
      path.join(srcRoot, 'game', 'save', 'card-catalog.ts'),
      'utf8',
    );

    expect(catalogSource).not.toMatch(/cards\/deck_/);
    expect(catalogSource).not.toMatch(/from '\.\/card-catalog-data'/);
    expect(catalogSource).not.toMatch(/from '\.\/auto-card-catalog'/);
  });
});
