import type { RuntimeCardInstance } from '../../game/save/session';
import './card-tile.css';

/**
 * 카드 한 장의 표시용 값이다.
 * 프레임·수정구슬 도형·능력 텍스트·이름은 카드 이미지에 이미 그려져 있어 수치만 다룬다.
 */
export type CardTile = {
  instanceId: string;
  cardId: string;
  name: string;
  cost: number | null;
  dominance: number | null;
  attack: number | null;
  hp: number | null;
  level: number | null;
  artUrl: string;
};

export type CardTileOptions = {
  disabled?: boolean;
  selected?: boolean;
  /** 타일 상단 가운데 칩이다. 레벨이나 재료 EXP처럼 짧은 값만 넣는다. */
  chip?: string;
  /** 툴팁 끝에 덧붙일 부가 설명이다. */
  note?: string;
  onClick?: () => void;
};

/**
 * 카드 이미지를 통째로 깔고 수치만 얹은 타일을 만든다.
 * 수치가 없는 항목은 그리지 않아 비어 있는 수정구슬이 그대로 보이게 둔다.
 */
export function createCardTileElement(
  tile: CardTile,
  options: CardTileOptions = {},
): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'pf-card-tile';
  element.disabled = options.disabled ?? false;
  element.classList.toggle('is-selected', options.selected ?? false);
  element.setAttribute('aria-pressed', String(options.selected ?? false));

  // 썸네일 크기에서는 이미지 속 이름을 읽을 수 없다. 접근성 이름과 툴팁으로 보완한다.
  element.title = formatCardTileLabel(tile, options.note);
  element.setAttribute('aria-label', element.title);

  const image = document.createElement('img');
  image.className = 'pf-card-tile__image';
  image.src = tile.artUrl;
  image.alt = '';
  image.loading = 'lazy';
  // 이미지는 브라우저 기본 드래그 대상이다. 켜 두면 전장에서 우리 포인터 드래그가 pointercancel로 끊긴다.
  image.draggable = false;
  // 이미지가 없으면 배경 그라디언트만 남긴다. 수치는 그대로 읽을 수 있다.
  image.addEventListener('error', () => image.remove());
  element.append(image);

  if (options.chip) {
    const chip = document.createElement('span');
    chip.className = 'pf-card-tile__chip';
    chip.textContent = options.chip;
    element.append(chip);
  }

  element.append(
    createOrbValue('cost', tile.cost),
    createOrbValue('dominance', tile.dominance),
    createOrbValue('attack', tile.attack),
    createOrbValue('hp', tile.hp),
  );

  const { onClick } = options;
  if (onClick) {
    element.addEventListener('click', () => onClick());
  }

  return element;
}

/** 카드 이미지에 그려진 수정구슬 위에 수치 하나를 얹는다. */
function createOrbValue(kind: string, value: number | null): HTMLElement {
  const orb = document.createElement('span');
  orb.className = `pf-card-tile__orb pf-card-tile__orb--${kind}`;
  orb.textContent = value === null ? '' : String(value);
  return orb;
}

/** 툴팁과 접근성 이름에 쓸 한 줄 요약이다. */
export function formatCardTileLabel(tile: CardTile, note?: string): string {
  const stats = [
    `코스트 ${formatStat(tile.cost)}`,
    `지배력 ${formatStat(tile.dominance)}`,
    `공격 ${formatStat(tile.attack)}`,
    `체력 ${formatStat(tile.hp)}`,
  ].join(' · ');

  return [tile.name, stats, note].filter(Boolean).join(' · ');
}

function formatStat(value: number | null): string {
  return value === null ? '-' : String(value);
}

/**
 * 런타임 카드 한 장을 표시용 타일 값으로 바꾼다.
 * 저장 인스턴스 수치를 우선 읽어 성장으로 오른 값이 그대로 보이게 한다.
 */
export function toCardTile(card: RuntimeCardInstance, assetBaseUrl: string): CardTile {
  const { definition, instance } = card;

  return {
    instanceId: instance.instanceId,
    cardId: definition.id,
    name: definition.name,
    cost: readStat(instance.cost, definition.cost),
    dominance: readStat(instance.dominance, definition.dominance),
    attack: readStat(instance.attack, definition.attack),
    hp: readStat(instance.hp, definition.hp),
    level: readStat(instance.level, definition.level),
    artUrl: `${assetBaseUrl.replace(/\/+$/, '')}/cards/webp/${definition.id}.webp`,
  };
}

function readStat(
  instanceValue: number | undefined,
  definitionValue: number | undefined,
): number | null {
  return instanceValue ?? definitionValue ?? null;
}
