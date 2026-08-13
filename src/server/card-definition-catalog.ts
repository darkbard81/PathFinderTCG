import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mergeCardDefinitions,
  type CardDefinition,
  type CardDefinitionFile,
} from '../game/save/card-catalog';

const defaultProjectRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * `cards/deck_*.json`을 디스크에서 모아 서버가 쓸 카드 정의를 만든다.
 *
 * 브라우저는 카드 JSON을 번들에 넣지 않는다. 서버는 번들 밖에서 돌아 직접 읽어야 하고,
 * 합치는 규칙은 테스트용 `auto-card-catalog.ts`와 같은 함수를 써서 다른 카드를 보지 않게 한다.
 */
export function readServerCardDefinitions(
  projectRoot: string = defaultProjectRoot,
): readonly CardDefinition[] {
  const cardsRoot = path.join(projectRoot, 'cards');
  const deckFileNames = fs
    .readdirSync(cardsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^deck_[A-Za-z0-9_-]+\.json$/.test(entry.name))
    .map((entry) => entry.name)
    // 브라우저 쪽 자동 등록도 경로 순으로 합치고 뒤에 온 정의를 우선한다. 순서를 맞춘다.
    .sort((left, right) => left.localeCompare(right));

  return mergeCardDefinitions(
    deckFileNames.map(
      (name) =>
        (JSON.parse(fs.readFileSync(path.join(cardsRoot, name), 'utf8')) as CardDefinitionFile)
          .cards,
    ),
  );
}
