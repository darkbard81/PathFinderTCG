/**
 * 카드 이미지에 텍스트 영역을 넣을지 말지를 담는다.
 * 편집기 토글, 생성 요청 payload, 캡처 URL이 모두 이 값을 주고받는다.
 * CSS를 import하지 않는 leaf 모듈이라 node 측에서도 그대로 읽을 수 있다.
 */
export type CardTextInclusion = {
  ability: boolean;
  name: boolean;
};

/** 아무 것도 지정하지 않으면 두 영역을 모두 넣는다. 토글 이전의 동작이 기본값이다. */
export const DEFAULT_CARD_TEXT_INCLUSION: CardTextInclusion = {
  ability: true,
  name: true,
};

export const ABILITY_TEXT_INCLUSION_PARAM = 'includeAbilityText';
export const NAME_TEXT_INCLUSION_PARAM = 'includeNameText';

/**
 * 캡처 페이지가 자기 URL에서 포함 여부를 읽는다.
 * 값이 없거나 해석할 수 없으면 포함으로 본다. 빠뜨린 파라미터 때문에
 * 텍스트가 통째로 사라진 카드가 생성되는 쪽이 더 나쁘다.
 */
export function readCardTextInclusionFromParams(params: URLSearchParams): CardTextInclusion {
  return {
    ability: readFlag(params.get(ABILITY_TEXT_INCLUSION_PARAM)),
    name: readFlag(params.get(NAME_TEXT_INCLUSION_PARAM)),
  };
}

/** 캡처 브라우저에 넘길 URL에 포함 여부를 싣는다. */
export function writeCardTextInclusionToParams(
  params: URLSearchParams,
  inclusion: CardTextInclusion,
): void {
  params.set(ABILITY_TEXT_INCLUSION_PARAM, inclusion.ability ? '1' : '0');
  params.set(NAME_TEXT_INCLUSION_PARAM, inclusion.name ? '1' : '0');
}

/**
 * 생성 요청 본문에서 포함 여부를 읽는다.
 * boolean이 아닌 값은 무시하고 기본값을 쓴다. 이 토글은 검증 실패로
 * 요청을 거절할 만큼 중요한 값이 아니다.
 */
export function readCardTextInclusionFromPayload(payload: unknown): CardTextInclusion {
  if (typeof payload !== 'object' || payload === null) {
    return { ...DEFAULT_CARD_TEXT_INCLUSION };
  }

  const record = payload as Record<string, unknown>;
  return {
    ability: readBoolean(record[ABILITY_TEXT_INCLUSION_PARAM], DEFAULT_CARD_TEXT_INCLUSION.ability),
    name: readBoolean(record[NAME_TEXT_INCLUSION_PARAM], DEFAULT_CARD_TEXT_INCLUSION.name),
  };
}

function readFlag(value: string | null): boolean {
  if (value === null) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false';
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
