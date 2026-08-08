/**
 * step이 넘기는 이징 이름을 함수로 바꾼다.
 * 이름은 `Sine.easeInOut` 형식이며 대소문자를 가리지 않는다.
 * PixiJS에는 tween 시스템이 없어 필요한 곡선만 직접 갖는다.
 */
export type EasingFunction = (progress: number) => number;

const EASINGS: Record<string, EasingFunction> = {
  linear: (progress) => progress,
  'sine.easein': (progress) => 1 - Math.cos((progress * Math.PI) / 2),
  'sine.easeout': (progress) => Math.sin((progress * Math.PI) / 2),
  'sine.easeinout': (progress) => -(Math.cos(Math.PI * progress) - 1) / 2,
  'cubic.easein': (progress) => progress ** 3,
  'cubic.easeout': (progress) => 1 - (1 - progress) ** 3,
  'cubic.easeinout': (progress) =>
    progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2,
  'quad.easein': (progress) => progress ** 2,
  'quad.easeout': (progress) => 1 - (1 - progress) ** 2,
  'quad.easeinout': (progress) =>
    progress < 0.5 ? 2 * progress ** 2 : 1 - (-2 * progress + 2) ** 2 / 2,
};

export const DEFAULT_EASING_NAME = 'Sine.easeInOut';

/**
 * 이징 이름을 함수로 해석한다.
 * 모르는 이름은 기본 곡선으로 떨어뜨린다. 연출이 멈추는 것보다 낫다.
 */
export function resolveEasing(name: string = DEFAULT_EASING_NAME): EasingFunction {
  return EASINGS[name.toLowerCase()] ?? EASINGS[DEFAULT_EASING_NAME.toLowerCase()]!;
}
