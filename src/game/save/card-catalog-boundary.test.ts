import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectClientModuleGraph,
  resolveClientEntryPoints,
  type ClientImport,
} from '../../testing/client-module-graph';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const srcRoot = path.join(projectRoot, 'src');

/** 카드 정의 JSON을 값으로 읽는 모듈이다. 서버·테스트만 import 할 수 있다. */
const CARD_DATA_MODULES = new Set([
  path.join(srcRoot, 'game', 'save', 'card-catalog-data.ts'),
  path.join(srcRoot, 'game', 'save', 'auto-card-catalog.ts'),
  path.join(srcRoot, 'game', 'save', 'create-initial-save.ts'),
  path.join(srcRoot, 'game', 'stage', 'stage-enemy-decks.ts'),
]);

function isCardDataImport(clientImport: ClientImport): boolean {
  if (/cards\/deck_[^/]*\.json(?:[?#].*)?$/.test(clientImport.specifier)) {
    return true;
  }
  if (!clientImport.target) {
    return false;
  }

  const cardsRoot = path.join(projectRoot, 'cards');
  return (
    CARD_DATA_MODULES.has(clientImport.target) ||
    clientImport.target.startsWith(`${cardsRoot}${path.sep}deck_`)
  );
}

/** 실제 Vite 브라우저 진입점에서 도달할 수 있는 카드 데이터 경계를 검증한다. */
describe('카드 정의의 클라이언트 경계', () => {
  it('브라우저 코드는 카드 정의 JSON을 import 하지 않는다', () => {
    const { imports } = collectClientModuleGraph({
      projectRoot,
      entryPoints: resolveClientEntryPoints(projectRoot),
    });
    const offenders = imports
      .filter(isCardDataImport)
      .map(({ importer, specifier }) => `${path.relative(projectRoot, importer)} -> ${specifier}`);

    expect(offenders).toEqual([]);
  });

  it('실제 진입점에서 루트 브라우저 모듈까지 따라간다', () => {
    const { files } = collectClientModuleGraph({
      projectRoot,
      entryPoints: resolveClientEntryPoints(projectRoot),
    });
    const relativeFiles = [...files].map((filePath) => path.relative(projectRoot, filePath));

    expect(relativeFiles).toContain('src/theme.ts');
    expect(relativeFiles).toContain('src/tools/card-text/client/main.ts');
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
