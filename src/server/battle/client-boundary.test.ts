import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const srcRoot = path.join(projectRoot, 'src');

/** 브라우저 번들에 들어가는 디렉터리다. 여기서 서버 코드에 닿으면 판정이 클라이언트로 새어 나간다. */
const CLIENT_ROOTS = ['pixi', 'dom', 'game', 'services', 'tools'];

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
  return (
    CLIENT_ROOTS.flatMap((name) => listSourceFiles(path.join(srcRoot, name)))
      // 테스트는 번들에 들어가지 않는다. 서버 쪽을 그대로 불러 검증해도 된다.
      .filter((filePath) => !filePath.endsWith('.test.ts'))
  );
}

function listImportSpecifiers(filePath: string): string[] {
  return [...fs.readFileSync(filePath, 'utf8').matchAll(/from\s+'([^']+)'/g)].map(
    (match) => match[1]!,
  );
}

/**
 * 전투 판정이 브라우저 번들에서 빠졌는지 소스 수준에서 지킨다.
 *
 * 번들을 열어 보는 대신 import 경계를 본다. 클라이언트 코드가 `src/server`를 부르지 않는 한
 * 전투 엔진·능력 처리·AI·전투 난수는 브라우저로 갈 길이 없다.
 */
describe('전투 판정의 클라이언트 경계', () => {
  it('브라우저 코드는 서버 모듈을 import 하지 않는다', () => {
    const offenders = listClientSourceFiles().flatMap((filePath) => {
      const resolved = listImportSpecifiers(filePath)
        .filter((specifier) => specifier.startsWith('.'))
        .map((specifier) => path.resolve(path.dirname(filePath), specifier))
        .filter((target) => target.startsWith(path.join(srcRoot, 'server')));

      return resolved.length > 0 ? [path.relative(projectRoot, filePath)] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('전투 엔진과 능력 처리와 전투 런타임 생성은 서버 아래에만 있다', () => {
    for (const name of ['battle-engine.ts', 'ability-handlers.ts', 'create-battle-runtime.ts']) {
      expect(fs.existsSync(path.join(srcRoot, 'server', 'battle', name))).toBe(true);
      expect(fs.existsSync(path.join(srcRoot, 'game', 'battle', name))).toBe(false);
    }
  });
});
