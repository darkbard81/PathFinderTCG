import { PF2E_NINE_LABEL_VARIANTS, PF2E_NINE_PATCH_VISUAL_STATES } from '../theme/pf2eElfTheme';

export const PF2E_CUSTOM_CLASS_IDS = [
  'ninePatch2',
  'nineLabel',
  'panel',
  'tabPages',
  'scrollablePanel',
  'gridTable',
  'confirmDialog',
  'badgeLabel',
  'buttons',
] as const;
export type PF2eCustomClassId = (typeof PF2E_CUSTOM_CLASS_IDS)[number];

export interface PF2eCustomClassDefinition {
  readonly id: PF2eCustomClassId;
  readonly name: string;
  readonly baseClass: string;
  readonly summary: string;
  readonly configKeys: readonly string[];
  readonly variants: readonly string[];
  readonly states: readonly string[];
}

export const PF2E_DEFAULT_CUSTOM_CLASS_ID: PF2eCustomClassId = 'ninePatch2';

export const PF2E_CUSTOM_CLASS_CATALOG: readonly PF2eCustomClassDefinition[] = [
  {
    id: 'ninePatch2',
    name: 'PF2eNinePatch2',
    baseClass: 'NinePatch2',
    summary: '고정 엣지와 반복 가능한 중앙을 가진 엘프 테마 프레임입니다.',
    configKeys: ['variant', 'width', 'height', 'x?', 'y?'],
    variants: [
      'panel',
      'control',
      'tab',
      'scrollTrack',
      'scrollThumb',
      'gridCell',
      'dialog',
      'button',
    ],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'nineLabel',
    name: 'PF2eNineLabel',
    baseClass: 'Label',
    summary: '텍스트 표시와 버튼 입력을 하나의 테마형 Label API로 제공합니다.',
    configKeys: [
      'text',
      'variant',
      'width?',
      'height?',
      'fontSize?',
      'wrapWidth?',
      'onActivate?',
      'enabled?',
    ],
    variants: PF2E_NINE_LABEL_VARIANTS,
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'panel',
    name: 'PF2ePanel',
    baseClass: 'Sizer',
    summary: 'NinePatch 패널 배경과 테마 inset을 가진 재사용 레이아웃 표면입니다.',
    configKeys: ['width?', 'height?', 'orientation?', 'inset?', 'itemGap?', 'visualState?'],
    variants: ['vertical', 'horizontal'],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'tabPages',
    name: 'PF2eTabPages',
    baseClass: 'TabPages',
    summary: '테마 탭과 typed page 정의를 묶고 현재 페이지만 표시합니다.',
    configKeys: ['pages', 'initialPageId?', 'tabPosition?', 'wrapTabs?', 'onPageChange?'],
    variants: ['top', 'bottom', 'left', 'right'],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'scrollablePanel',
    name: 'PF2eScrollablePanel',
    baseClass: 'ScrollablePanel',
    summary: '테마 스크롤 트랙과 thumb, 휠·드래그 동작을 묶은 세로 스크롤 패널입니다.',
    configKeys: [
      'child',
      'width?',
      'height?',
      'backgroundVariant?',
      'scrollbarPosition?',
      'hideScrollbarWhenUnscrollable?',
      'wheelSpeed?',
      'dragThreshold?',
      'onScroll?',
    ],
    variants: ['left scrollbar', 'right scrollbar'],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'gridTable',
    name: 'PF2eGridTable',
    baseClass: 'GridTable',
    summary: '셀 재사용, 선택 상태, 테마 스크롤바를 제공하는 카드 목록용 가상 그리드입니다.',
    configKeys: [
      'width',
      'height',
      'items',
      'columns?',
      'initialSelectedId?',
      'scrollbarPosition?',
      'onSelectionChange?',
    ],
    variants: ['one column', 'two columns'],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'confirmDialog',
    name: 'PF2eConfirmDialog',
    baseClass: 'ConfirmDialog',
    summary: '엘프 테마 modal cover와 확인·취소 callback을 제공하는 확인 대화상자입니다.',
    configKeys: [
      'title',
      'message',
      'confirmText?',
      'cancelText?',
      'danger?',
      'width?',
      'height?',
      'onConfirm?',
      'onCancel?',
    ],
    variants: ['normal', 'danger'],
    states: ['closed', 'open', 'confirm', 'cancel'],
  },
  {
    id: 'badgeLabel',
    name: 'PF2eBadgeLabel',
    baseClass: 'BadgeLabel',
    summary: '테마 Label 위에 수치형 엘프 메달리온을 지정 위치로 겹쳐 표시합니다.',
    configKeys: ['text', 'badgeValue', 'variant?', 'badgePosition?', 'width?', 'height?'],
    variants: [
      'leftTop',
      'centerTop',
      'rightTop',
      'leftCenter',
      'center',
      'rightCenter',
      'leftBottom',
      'centerBottom',
      'rightBottom',
    ],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'buttons',
    name: 'PF2eButtons',
    baseClass: 'Buttons',
    summary: 'typed button 정의와 그룹 입력 상태를 관리하는 엘프 테마 액션 그룹입니다.',
    configKeys: ['buttons', 'orientation?', 'width?', 'height?', 'onButtonClick?'],
    variants: ['horizontal', 'vertical', 'primary', 'danger'],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
] as const;

export function getPF2eCustomClassDefinition(id: PF2eCustomClassId): PF2eCustomClassDefinition {
  const definition = PF2E_CUSTOM_CLASS_CATALOG.find((candidate) => candidate.id === id);
  if (!definition) {
    throw new Error(`Unknown PF2e custom class: ${id}`);
  }
  return definition;
}

export function getAdjacentPF2eCustomClassId(
  currentId: PF2eCustomClassId,
  direction: 'previous' | 'next',
): PF2eCustomClassId {
  const currentIndex = PF2E_CUSTOM_CLASS_IDS.indexOf(currentId);
  const offset = direction === 'next' ? 1 : -1;
  const nextIndex =
    (currentIndex + offset + PF2E_CUSTOM_CLASS_IDS.length) % PF2E_CUSTOM_CLASS_IDS.length;
  const adjacentId = PF2E_CUSTOM_CLASS_IDS[nextIndex];
  if (!adjacentId) {
    throw new Error('PF2e custom class catalog is empty');
  }
  return adjacentId;
}
