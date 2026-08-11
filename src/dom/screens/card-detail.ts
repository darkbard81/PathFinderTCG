import { findTraitDefinition, type TraitCategoryId } from '../../game/cards/trait-catalog';
import type { RuntimeCardInstance } from '../../game/save/session';
import { ORB_STATS, buildOrbBadgeUrl, toCardTile, type CardTile, type OrbStat } from './card-tile';
import './card-detail.css';

/** 상세 패널에 그릴 특성 하나다. 카탈로그에 없는 id는 label 자리에 id를 그대로 둔다. */
export type CardDetailTrait = {
  id: string;
  label: string;
  category: TraitCategoryId | null;
  /** 특성 규칙 설명이다. 카탈로그에 없는 id는 빈 문자열이다. */
  description: string;
};

/** 상세 패널에 그릴 능력 하나다. */
export type CardDetailAbility = {
  id: string;
  category: string;
  name: string;
  text: string;
};

/**
 * 카드 한 장의 상세 표시 값이다.
 *
 * `CardTile`과 나누어 둔다. 타일은 그리드에 수십 장을 그리는 모델이라 얇아야 하는데,
 * 능력과 특성 배열까지 실으면 한 장도 안 여는 화면에서까지 값을 만들게 된다.
 */
export type CardDetail = {
  tile: CardTile;
  /**
   * 확대해서 볼 원화다. 틀과 수치를 얹기 전의 그림이라 인물이 가리지 않는다.
   * 타일이 쓰는 webp는 512x768에 틀까지 얹혀 있어 크게 띄울 그림이 아니다.
   */
  originalUrl: string;
  typeLabel: string;
  traits: CardDetailTrait[];
  abilities: CardDetailAbility[];
  description: string;
  note: string;
};

/** 한 화면에 패널이 둘 이상 있어도 설명 줄의 id가 겹치지 않게 센다. */
let detailViewCount = 0;

const TYPE_LABELS: Record<string, string> = {
  UNIT: '유닛',
  LEADER: '리더',
  EQUIPMENT: '장비',
  ITEM: '아이템',
};

const STAT_LABELS: Record<OrbStat, string> = {
  dominance: '지배력',
  cost: '코스트',
  hp: '체력',
  attack: '공격력',
};

/**
 * 런타임 카드 한 장을 상세 표시 값으로 바꾼다.
 * 수치는 `toCardTile`이 이미 인스턴스 우선으로 읽으므로 성장분이 그대로 반영된다.
 */
export function toCardDetail(card: RuntimeCardInstance, assetBaseUrl: string): CardDetail {
  const { definition } = card;

  return {
    tile: toCardTile(card, assetBaseUrl),
    originalUrl: `${assetBaseUrl}/cards/arts/${definition.id}.png`,
    typeLabel: TYPE_LABELS[definition.type] ?? definition.type,
    traits: definition.traits.map((traitId) => {
      const trait = findTraitDefinition(traitId);

      return {
        id: traitId,
        label: trait?.label ?? traitId,
        category: trait?.category ?? null,
        description: trait?.description ?? '',
      };
    }),
    abilities: definition.abilities.map((ability) => ({
      id: ability.id,
      category: ability.category,
      name: ability.name,
      text: ability.text,
    })),
    description: definition.description,
    note: definition.note,
  };
}

export type CardDetailView = {
  root: HTMLElement;
  /**
   * 원본을 크게 띄우는 판이다. 화면 루트에 따로 붙여야 한다.
   *
   * 패널 안에 두면 패널 크기에 갇힌다. position: fixed로 화면을 덮는 길도 있지만,
   * 오버레이 루트가 zoom으로 줄어 있어 fixed의 기준이 엔진마다 갈린다.
   */
  overlay: HTMLElement;
  /** null이면 빈 안내만 남긴다. 화면이 패널을 떼었다 붙이지 않아도 되게 한다. */
  render: (detail: CardDetail | null) => void;
};

export type CardDetailViewOptions = {
  /** 비었을 때 보여줄 안내다. 화면마다 여는 방법을 다르게 설명할 수 있다. */
  emptyMessage: string;
  /** 닫기 버튼을 붙인다. 떠 있는 패널만 쓴다. 고정 자리는 닫을 이유가 없다. */
  onClose?: () => void;
};

/**
 * 카드 상세 패널을 만든다.
 *
 * 전장·덱 구성·장비·성장이 같은 것을 쓴다. 놓이는 자리만 화면이 정하고,
 * 가로로 넓은 자리와 떠 있는 자리는 CSS 수식어로 나눈다.
 */
export function createCardDetailView(options: CardDetailViewOptions): CardDetailView {
  const root = document.createElement('section');
  root.className = 'pf-card-detail';
  root.setAttribute('aria-live', 'polite');

  const empty = document.createElement('p');
  empty.className = 'pf-card-detail__empty';
  empty.textContent = options.emptyMessage;

  const body = document.createElement('div');
  body.className = 'pf-card-detail__body';
  body.hidden = true;

  // 눌러서 원본을 크게 보는 자리라 버튼으로 만든다. 그림 자체는 장식이라 이름을 버튼이 갖는다.
  const art = document.createElement('button');
  art.type = 'button';
  art.className = 'pf-card-detail__art';
  art.setAttribute('aria-label', '원화 크게 보기');
  art.setAttribute('aria-expanded', 'false');

  const artImage = document.createElement('img');
  artImage.className = 'pf-card-detail__art-image';
  artImage.alt = '';
  artImage.draggable = false;
  artImage.setAttribute('aria-hidden', 'true');
  art.append(artImage);

  const overlay = createOriginalOverlay(art);
  art.addEventListener('click', () => overlay.open());

  const main = document.createElement('div');
  main.className = 'pf-card-detail__main';

  const heading = document.createElement('div');
  heading.className = 'pf-card-detail__heading';

  const name = document.createElement('h2');
  name.className = 'pf-card-detail__name';

  const meta = document.createElement('p');
  meta.className = 'pf-card-detail__meta';

  heading.append(name, meta);

  const stats = document.createElement('ul');
  stats.className = 'pf-card-detail__stats';

  // 칩이 눌리는 컨트롤이 되므로 목록이 아니라 버튼 묶음으로 둔다.
  const traits = document.createElement('div');
  traits.className = 'pf-card-detail__traits';
  traits.setAttribute('role', 'group');
  traits.setAttribute('aria-label', '특성');

  /*
   * 고른 특성의 규칙 설명이다.
   *
   * title 툴팁만으로는 hover가 없는 판에서 읽을 수 없다. 카드 상세를 hover가 아니라
   * 길게 누르기로 여는 것과 같은 이유다. 눌러서 여는 줄을 따로 둔다.
   */
  const traitDescription = document.createElement('p');
  traitDescription.className = 'pf-card-detail__trait-description';
  traitDescription.id = `pf-card-detail-trait-${(detailViewCount += 1)}`;
  traitDescription.hidden = true;

  let openTraitId: string | null = null;

  function setOpenTrait(trait: CardDetailTrait | null): void {
    openTraitId = trait?.id ?? null;
    traitDescription.textContent = trait?.description ?? '';
    traitDescription.hidden = trait === null;
    // 색 규칙이 칩과 같은 선택자를 쓰도록 고른 특성의 갈래를 그대로 실어 준다.
    traitDescription.dataset.category = trait?.category ?? '';
    traitDescription.dataset.trait = trait?.id ?? '';

    for (const chip of traits.querySelectorAll<HTMLButtonElement>('.pf-card-detail__trait')) {
      chip.setAttribute('aria-expanded', String(chip.dataset.trait === openTraitId));
    }
  }

  const abilities = document.createElement('div');
  abilities.className = 'pf-card-detail__abilities';

  const description = document.createElement('p');
  description.className = 'pf-card-detail__description';

  // 머리와 수치·특성은 고정하고 긴 글만 스크롤한다. 통째로 스크롤하면 이름이 밀려 올라간다.
  const scroll = document.createElement('div');
  scroll.className = 'pf-card-detail__scroll';
  scroll.dataset.interactive = 'true';
  scroll.append(abilities, description);

  // 이름·수치·특성을 한 덩어리로 묶는다. 가로로 넓은 자리에서는 이 덩어리와 긴 글을 좌우로 나눈다.
  const summary = document.createElement('div');
  summary.className = 'pf-card-detail__summary';
  // 넘칠 때 이 열이 직접 스크롤한다. 오버레이 기본 pointer-events:none에서 스크롤을 받으려면 필요하다.
  summary.dataset.interactive = 'true';
  summary.append(heading, stats, traits, traitDescription);

  main.append(summary, scroll);
  body.append(art, main);
  root.append(empty, body);

  if (options.onClose) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pf-btn-plain pf-card-detail__close';
    close.textContent = '×';
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', options.onClose);
    root.append(close);
  }

  return {
    root,
    overlay: overlay.root,
    render: (detail) => {
      empty.hidden = detail !== null;
      body.hidden = detail === null;

      if (!detail) {
        // 이미지를 비우지 않는다. src를 빈 문자열로 두면 현재 주소를 다시 받으러 간다.
        return;
      }

      artImage.src = detail.tile.artUrl;
      overlay.setSource(detail.originalUrl, detail.tile.name);
      name.textContent = detail.tile.name;
      meta.textContent = [
        detail.typeLabel,
        detail.tile.level === null ? null : `Lv.${detail.tile.level}`,
      ]
        .filter(Boolean)
        .join(' · ');

      renderStats(stats, detail.tile);
      renderTraits(traits, detail.traits, traitDescription.id, (trait) =>
        // 같은 칩을 다시 누르면 닫는다.
        setOpenTrait(trait.id === openTraitId ? null : trait),
      );
      // 카드가 바뀌면 열려 있던 설명은 남기지 않는다.
      setOpenTrait(null);
      renderAbilities(abilities, detail.abilities);

      description.textContent = [detail.description, detail.note].filter(Boolean).join('\n\n');
      description.hidden = description.textContent.length === 0;
    },
  };
}

/**
 * 원본 그림을 크게 띄우는 판을 만든다.
 *
 * 원화는 장당 2~3MB다. 패널을 열 때마다 받으면 아무도 안 누르는 그림에 그 값을 치른다.
 * 그래서 처음 누를 때까지 주소를 걸지 않는다.
 *
 * 닫기는 판 아무 곳이나 누르면 된다. 원본을 확인하려고 잠깐 여는 자리라
 * 닫기 버튼을 찾아 누르게 할 이유가 없다. Escape도 함께 받는다.
 *
 * 닫을 때 그림을 지운다. 남겨 두면 다음에 다른 카드를 열었을 때 새 그림을 받는 동안
 * 이전 카드가 그대로 보인다. 지우기만 하면 이번에는 빈 판이 잠깐 보이므로,
 * 그림은 다 받은 뒤에 나타나게 한다. 그동안은 어두운 판만 깔려 누른 것이 먹혔음을 알린다.
 */
function createOriginalOverlay(trigger: HTMLElement): {
  root: HTMLElement;
  open: () => void;
  setSource: (url: string, name: string) => void;
} {
  const root = document.createElement('div');
  root.className = 'pf-card-detail-original';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const image = document.createElement('img');
  image.className = 'pf-card-detail-original__image';
  image.alt = '';
  image.draggable = false;
  image.addEventListener('load', () => image.classList.add('is-ready'));
  root.append(image);

  let url = '';

  function close(): void {
    root.classList.remove('is-open');
    image.classList.remove('is-ready');
    // 빈 문자열이 아니라 속성을 지운다. ''를 넣으면 브라우저가 현재 주소를 다시 받으러 간다.
    image.removeAttribute('src');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }

  root.addEventListener('click', close);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });

  return {
    root,
    setSource: (nextUrl, name) => {
      url = nextUrl;
      root.setAttribute('aria-label', `${name} 원화`);
    },
    open: () => {
      if (!url) {
        return;
      }

      image.classList.remove('is-ready');
      image.src = url;
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      root.focus();

      // 캐시에서 바로 온 그림은 load가 이미 끝나 있어 이벤트가 오지 않는다.
      if (image.complete) {
        image.classList.add('is-ready');
      }
    },
  };
}

/** 수치는 타일과 같은 순서로 둔다. 배지 그림도 그대로 재사용해 같은 값임을 눈으로 잇는다. */
function renderStats(list: HTMLElement, tile: CardTile): void {
  list.replaceChildren();

  for (const stat of ORB_STATS) {
    const value = tile[stat];
    if (value === null) {
      continue;
    }

    const item = document.createElement('li');
    item.className = 'pf-card-detail__stat';

    const icon = document.createElement('img');
    icon.className = 'pf-card-detail__stat-icon';
    icon.src = buildOrbBadgeUrl(tile.badgeBaseUrl, stat);
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = `${value}`;

    item.title = `${STAT_LABELS[stat]} ${value}`;
    item.setAttribute('aria-label', item.title);
    item.append(icon, text);
    list.append(item);
  }
}

function renderTraits(
  group: HTMLElement,
  traits: readonly CardDetailTrait[],
  descriptionId: string,
  onToggle: (trait: CardDetailTrait) => void,
): void {
  group.replaceChildren();
  group.hidden = traits.length === 0;

  for (const trait of traits) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pf-card-detail__trait';
    chip.dataset.trait = trait.id;
    /*
     * 크기와 희귀도는 PF2e에서 색으로 구분한다.
     * 희귀도는 별도 필드가 아니라 특성 하나로 들어오므로 카테고리와 id를 함께 실어
     * CSS가 등급까지 갈라 칠할 수 있게 한다.
     */
    if (trait.category) {
      chip.dataset.category = trait.category;
    }
    chip.textContent = trait.label;

    if (trait.description) {
      // 마우스가 있는 판에서는 누르지 않아도 읽힌다. 두 방식을 함께 둔다.
      chip.title = trait.description;
      chip.setAttribute('aria-expanded', 'false');
      chip.setAttribute('aria-controls', descriptionId);
      chip.addEventListener('click', () => onToggle(trait));
    } else {
      // 카탈로그에 없는 id다. 읽을 설명이 없으므로 누를 것도 없다.
      chip.disabled = true;
    }

    group.append(chip);
  }
}

function renderAbilities(container: HTMLElement, abilities: readonly CardDetailAbility[]): void {
  container.replaceChildren();
  container.hidden = abilities.length === 0;

  for (const ability of abilities) {
    const entry = document.createElement('div');
    entry.className = 'pf-card-detail__ability';

    const head = document.createElement('p');
    head.className = 'pf-card-detail__ability-head';

    const category = document.createElement('span');
    category.className = 'pf-card-detail__ability-category';
    category.textContent = ability.category;

    const abilityName = document.createElement('span');
    abilityName.className = 'pf-card-detail__ability-name';
    abilityName.textContent = ability.name;

    head.append(category, abilityName);

    const text = document.createElement('p');
    text.className = 'pf-card-detail__ability-text';
    text.textContent = ability.text;

    entry.append(head, text);
    container.append(entry);
  }
}
