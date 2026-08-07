import { UI_THEME } from '../theme';

const VARIABLE_PREFIX = '--pf';

/**
 * 테마 토큰을 CSS 커스텀 속성 이름과 값의 쌍으로 만든다.
 * DOM과 캔버스가 같은 `src/theme.ts` 값을 쓰도록 하는 유일한 변환 지점이다.
 */
export function buildThemeCssVariables(): Record<string, string> {
  const variables: Record<string, string> = {
    [`${VARIABLE_PREFIX}-font-family`]: UI_THEME.fontFamily,
  };

  for (const [name, token] of Object.entries(UI_THEME.colors)) {
    variables[`${VARIABLE_PREFIX}-color-${toKebabCase(name)}`] = token.css;
  }

  for (const [name, size] of Object.entries(UI_THEME.spacing)) {
    variables[`${VARIABLE_PREFIX}-space-${toKebabCase(name)}`] = `${size}px`;
  }

  for (const [name, style] of Object.entries(UI_THEME.text)) {
    variables[`${VARIABLE_PREFIX}-text-${toKebabCase(name)}-size`] = style.fontSize;
    variables[`${VARIABLE_PREFIX}-text-${toKebabCase(name)}-color`] = style.color.css;
  }

  for (const [name, surface] of Object.entries(UI_THEME.surfaces)) {
    variables[`${VARIABLE_PREFIX}-surface-${toKebabCase(name)}`] = toRgba(
      surface.fill.canvas,
      surface.fillAlpha,
    );
  }

  return variables;
}

/** surface는 색과 불투명도를 함께 갖는다. CSS에서는 한 값으로 써야 하므로 rgba로 합친다. */
function toRgba(canvasColor: number, alpha: number): string {
  const red = (canvasColor >> 16) & 0xff;
  const green = (canvasColor >> 8) & 0xff;
  const blue = canvasColor & 0xff;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** 테마 토큰을 대상 엘리먼트에 CSS 커스텀 속성으로 적용한다. */
export function applyThemeCssVariables(target: HTMLElement): void {
  for (const [name, value] of Object.entries(buildThemeCssVariables())) {
    target.style.setProperty(name, value);
  }
}

function toKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
