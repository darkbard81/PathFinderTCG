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
    summary: '텍스트와 NinePatch 배경에 PF2e 테마만 적용하는 표시용 Label입니다.',
    configKeys: ['text', 'variant', 'width?', 'height?', 'fontSize?', 'wrapWidth?'],
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
    summary: '테마 탭과 typed page 정의를 조립하며 선택 callback은 controller가 담당합니다.',
    configKeys: ['pages', 'tabPosition?', 'wrapTabs?', 'width?', 'height?'],
    variants: ['top', 'bottom', 'left', 'right'],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'scrollablePanel',
    name: 'PF2eScrollablePanel',
    baseClass: 'ScrollablePanel',
    summary: 'rexUI 스크롤 패널에 테마 트랙, thumb, 배경을 조립하는 어댑터입니다.',
    configKeys: [
      'child',
      'width?',
      'height?',
      'backgroundVariant?',
      'scrollbarPosition?',
      'hideScrollbarWhenUnscrollable?',
      'wheelSpeed?',
      'dragThreshold?',
    ],
    variants: ['left scrollbar', 'right scrollbar'],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'gridTable',
    name: 'PF2eGridTable',
    baseClass: 'GridTable',
    summary: '재사용 셀과 스크롤바에 테마를 적용하며 선택 상태는 controller가 소유합니다.',
    configKeys: ['width', 'height', 'items', 'columns?', 'scrollbarPosition?'],
    variants: ['one column', 'two columns'],
    states: PF2E_NINE_PATCH_VISUAL_STATES,
  },
  {
    id: 'confirmDialog',
    name: 'PF2eConfirmDialog',
    baseClass: 'ConfirmDialog',
    summary: '확인 대화상자의 프레임과 텍스트 스타일만 구성하는 테마 어댑터입니다.',
    configKeys: ['title', 'message', 'confirmText?', 'cancelText?', 'danger?', 'width?', 'height?'],
    variants: ['normal', 'danger'],
    states: ['controller-owned'],
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
    summary: 'typed button 정의를 테마 Label로 조립하며 callback은 controller가 연결합니다.',
    configKeys: ['buttons', 'orientation?', 'width?', 'height?'],
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
