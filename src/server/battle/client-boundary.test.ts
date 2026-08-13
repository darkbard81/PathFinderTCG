import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectClientModuleGraph,
  resolveClientEntryPoints,
} from '../../testing/client-module-graph';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const srcRoot = path.join(projectRoot, 'src');

/**
 * 전투 판정이 브라우저 번들에서 빠졌는지 실제 Vite 진입점의 import 그래프로 지킨다.
 * 클라이언트 코드가 `src/server`를 부르지 않는 한 전투 엔진·능력 처리·AI·난수는 새어 나가지 않는다.
 */
describe('전투 판정의 클라이언트 경계', () => {
  it('브라우저 코드는 서버 모듈을 import 하지 않는다', () => {
    const serverRoot = path.join(srcRoot, 'server');
    const { imports } = collectClientModuleGraph({
      projectRoot,
      entryPoints: resolveClientEntryPoints(projectRoot),
    });
    const offenders = imports
      .filter(
        ({ target }) =>
          target !== null &&
          (target === serverRoot || target.startsWith(`${serverRoot}${path.sep}`)),
      )
      .map(({ importer, specifier }) => `${path.relative(projectRoot, importer)} -> ${specifier}`);

    expect(offenders).toEqual([]);
  });

  it('전투 엔진과 능력 처리와 전투 런타임 생성은 서버 아래에만 있다', () => {
    for (const name of ['battle-engine.ts', 'ability-handlers.ts', 'create-battle-runtime.ts']) {
      expect(fs.existsSync(path.join(srcRoot, 'server', 'battle', name))).toBe(true);
      expect(fs.existsSync(path.join(srcRoot, 'game', 'battle', name))).toBe(false);
    }
  });
});
