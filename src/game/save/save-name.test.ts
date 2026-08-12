import { describe, expect, it } from 'vitest';
import { createDefaultSaveName, normalizeSaveName, SAVE_NAME_MAX_LENGTH } from './save-name';

describe('createDefaultSaveName', () => {
  it('슬롯 번호로 호환 기본 이름을 만든다', () => {
    expect(createDefaultSaveName(2)).toBe('Slot 2');
  });
});

describe('normalizeSaveName', () => {
  it('앞뒤 공백을 제거한 이름을 돌려준다', () => {
    expect(normalizeSaveName('  모험 기록  ')).toBe('모험 기록');
  });

  it('빈 이름을 거부한다', () => {
    expect(() => normalizeSaveName('   ')).toThrow('non-empty');
  });

  it('최대 길이는 허용하고 그보다 긴 이름은 거부한다', () => {
    expect(normalizeSaveName('a'.repeat(SAVE_NAME_MAX_LENGTH))).toHaveLength(SAVE_NAME_MAX_LENGTH);
    expect(() => normalizeSaveName('a'.repeat(SAVE_NAME_MAX_LENGTH + 1))).toThrow('exceed');
  });
});
