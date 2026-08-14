import {
  ABILITY_TEXT_INCLUSION_PARAM,
  NAME_TEXT_INCLUSION_PARAM,
  readCardTextInclusionFromParams,
  readCardTextInclusionFromPayload,
  writeCardTextInclusionToParams,
} from './text-inclusion';

describe('readCardTextInclusionFromParams', () => {
  it('파라미터가 없으면 두 영역을 모두 넣는다', () => {
    expect(readCardTextInclusionFromParams(new URLSearchParams())).toEqual({
      ability: true,
      name: true,
    });
  });

  it('0과 false만 제외로 읽는다', () => {
    const params = new URLSearchParams({
      [ABILITY_TEXT_INCLUSION_PARAM]: '0',
      [NAME_TEXT_INCLUSION_PARAM]: 'False',
    });

    expect(readCardTextInclusionFromParams(params)).toEqual({ ability: false, name: false });
  });

  it('1과 알 수 없는 값은 포함으로 읽는다', () => {
    const params = new URLSearchParams({
      [ABILITY_TEXT_INCLUSION_PARAM]: '1',
      [NAME_TEXT_INCLUSION_PARAM]: 'yes',
    });

    expect(readCardTextInclusionFromParams(params)).toEqual({ ability: true, name: true });
  });
});

describe('writeCardTextInclusionToParams', () => {
  it('캡처 URL이 다시 같은 값으로 읽히게 싣는다', () => {
    const params = new URLSearchParams();

    writeCardTextInclusionToParams(params, { ability: false, name: true });

    expect(params.get(ABILITY_TEXT_INCLUSION_PARAM)).toBe('0');
    expect(params.get(NAME_TEXT_INCLUSION_PARAM)).toBe('1');
    expect(readCardTextInclusionFromParams(params)).toEqual({ ability: false, name: true });
  });
});

describe('readCardTextInclusionFromPayload', () => {
  it('boolean 필드를 그대로 읽는다', () => {
    expect(
      readCardTextInclusionFromPayload({
        [ABILITY_TEXT_INCLUSION_PARAM]: false,
        [NAME_TEXT_INCLUSION_PARAM]: false,
      }),
    ).toEqual({ ability: false, name: false });
  });

  it.each([
    { label: '필드가 없는 요청', payload: { cardId: 'card_001' } },
    { label: 'boolean이 아닌 값', payload: { [ABILITY_TEXT_INCLUSION_PARAM]: 'false' } },
    { label: '객체가 아닌 본문', payload: null },
  ])('$label은 기본값인 포함으로 둔다', ({ payload }) => {
    expect(readCardTextInclusionFromPayload(payload)).toEqual({ ability: true, name: true });
  });
});
