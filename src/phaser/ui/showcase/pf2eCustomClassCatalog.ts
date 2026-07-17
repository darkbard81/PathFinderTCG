import { PF2E_NINE_LABEL_VARIANTS, PF2E_NINE_PATCH_VISUAL_STATES } from '../theme/pf2eElfTheme';

export const PF2E_CUSTOM_CLASS_IDS = ['ninePatch2', 'nineLabel'] as const;
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
    summary: '엘프 테마 패널과 컨트롤 프레임을 크기에 맞게 확장합니다.',
    configKeys: ['variant', 'width', 'height', 'x?', 'y?'],
    variants: ['panel', 'control'],
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
