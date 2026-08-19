import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

const schema = JSON.parse(readFileSync(resolve('cards/stage.schema.json'), 'utf8')) as JsonRecord;

function record(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected schema object');
  }
  return value as JsonRecord;
}

describe('stage ADV schema', () => {
  const properties = record(schema.properties);
  const definitions = record(schema.$defs);
  const advDefinition = record(definitions.advDefinition);
  const advDefinitionProperties = record(advDefinition.properties);
  const advBeat = record(definitions.advBeat);
  const advBeatProperties = record(advBeat.properties);

  it('Start와 End는 선택 필드이며 null 또는 같은 ADV 정의를 받는다', () => {
    expect(schema.required).not.toContain('startAdv');
    expect(schema.required).not.toContain('endAdv');
    expect(record(properties.startAdv).oneOf).toEqual([
      { type: 'null' },
      { $ref: '#/$defs/advDefinition' },
    ]);
    expect(record(properties.endAdv).oneOf).toEqual([
      { type: 'null' },
      { $ref: '#/$defs/advDefinition' },
    ]);
  });

  it('자산 키를 adv.*로 제한하고 첫 beat에 초기 컷씬을 요구한다', () => {
    const assetKeyPattern = new RegExp(String(record(definitions.advAssetKey).pattern));
    const beats = record(advDefinitionProperties.beats);
    const firstBeat = record((beats.prefixItems as unknown[])[0]);
    const initialRequirement = record((firstBeat.allOf as unknown[])[1]);

    expect(assetKeyPattern.test('adv.level01.start.cutscene')).toBe(true);
    expect(assetKeyPattern.test('ui.title-screen')).toBe(false);
    expect(assetKeyPattern.test('adv.')).toBe(false);
    expect(beats.minItems).toBe(1);
    expect(initialRequirement.required).toEqual(['cutsceneAssetKey']);
  });

  it('컷씬과 스탠딩은 beat의 선택 필드이고 위치는 세 곳만 허용한다', () => {
    const standing = record(definitions.advStanding);
    const standingProperties = record(standing.properties);

    expect(advDefinition.required).toEqual(['beats']);
    expect(advBeat.required).toEqual(['speaker', 'text', 'faceAssetKey']);
    expect(advBeatProperties).toHaveProperty('cutsceneAssetKey');
    expect(advBeatProperties).toHaveProperty('standings');
    expect(record(standingProperties.position).enum).toEqual(['left', 'center', 'right']);
  });
});
