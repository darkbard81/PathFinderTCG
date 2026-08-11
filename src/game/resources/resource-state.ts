/**
 * 저장 슬롯이 들고 다니는 재화다.
 * documents/UI_Template.png 2번 상단 리소스 바가 이 셋을 그린다.
 */
export type ResourceState = {
  /** 골드 */
  gold: number;
  /** 마나석 */
  manaStone: number;
  /** 소환 티켓 */
  summonTicket: number;
};

/** 재화 종류다. 정규화가 이 목록을 돌며 항목을 읽는다. */
export const RESOURCE_KEYS = ['gold', 'manaStone', 'summonTicket'] as const;

export type ResourceKey = (typeof RESOURCE_KEYS)[number];

type JsonRecord = Record<string, unknown>;

/**
 * 새 저장 슬롯과 기존 저장 슬롯 보정에 사용할 기본 재화를 만든다.
 * 시작 지급량은 아직 정하지 않아 전부 0이다.
 */
export function createDefaultResourceState(): ResourceState {
  return {
    gold: 0,
    manaStone: 0,
    summonTicket: 0,
  };
}

/**
 * 저장 파일에서 읽은 재화를 현재 런타임 타입으로 정규화한다.
 *
 * schemaVersion 5 이하에는 이 필드가 없으므로 없으면 기본값을 준다.
 * 항목 하나가 없는 것도 기본값으로 채운다. 나중에 재화를 하나 더 늘렸을 때
 * 그 필드가 없는 옛 저장 파일이 통째로 막히지 않게 하기 위해서다.
 *
 * 값이 있는데 개수로 말이 안 되면 예외를 던진다. 로비 배경은 카탈로그에서 사라진 id를
 * 조용히 버리지만, 재화는 그렇게 다루면 안 된다. 잘못 읽은 잔액을 0으로 눌러 담는 것은
 * 가진 것을 말없이 빼앗는 것과 같아서, 조용히 고치는 편이 막는 편보다 나쁘다.
 */
export function normalizeResourceState(value: unknown): ResourceState {
  if (value === undefined) {
    return createDefaultResourceState();
  }

  if (!isRecord(value)) {
    throw new Error('resources must be a resource state');
  }

  const state = createDefaultResourceState();

  for (const key of RESOURCE_KEYS) {
    state[key] = readAmount(value[key], key);
  }

  return state;
}

/** 재화는 개수라 음수도 소수도 될 수 없다. 정밀도가 깨지는 큰 수도 받지 않는다. */
function readAmount(value: unknown, key: ResourceKey): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`resources.${key} must be a non-negative integer`);
  }

  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}
