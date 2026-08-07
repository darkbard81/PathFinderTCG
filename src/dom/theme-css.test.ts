import { UI_THEME } from '../theme';
import { buildThemeCssVariables } from './theme-css';

describe('buildThemeCssVariables', () => {
  const variables = buildThemeCssVariables();

  it('모든 이름이 --pf 접두사를 가진 CSS 커스텀 속성이다', () => {
    const names = Object.keys(variables);

    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => name.startsWith('--pf-'))).toBe(true);
  });

  it('색 토큰을 camelCase에서 kebab-case로 옮긴다', () => {
    expect(variables['--pf-color-background']).toBe(UI_THEME.colors.background.css);
    expect(variables['--pf-color-surface-hover']).toBe(UI_THEME.colors.surfaceHover.css);
  });

  it('텍스트 변형마다 크기와 색을 함께 낸다', () => {
    expect(variables['--pf-text-loader-title-size']).toBe(UI_THEME.text.loaderTitle.fontSize);
    expect(variables['--pf-text-loader-title-color']).toBe(UI_THEME.text.loaderTitle.color.css);
  });

  it('DOM 전용 토큰을 그룹 이름과 함께 낸다', () => {
    expect(variables['--pf-login-panel-background']).toBe(UI_THEME.dom.login.panelBackground);
    expect(variables['--pf-license-dialog-panel-radius']).toBe(
      UI_THEME.dom.licenseDialog.panelRadius,
    );
  });

  it('surface는 색과 불투명도를 rgba 한 값으로 합친다', () => {
    expect(variables['--pf-surface-progress-fill']).toBe('rgba(168, 230, 178, 0.95)');
  });

  it('모든 색 토큰과 surface 토큰이 빠짐없이 포함된다', () => {
    const colorCount = Object.keys(UI_THEME.colors).length;
    const surfaceCount = Object.keys(UI_THEME.surfaces).length;

    expect(Object.keys(variables).filter((name) => name.startsWith('--pf-color-'))).toHaveLength(
      colorCount,
    );
    expect(Object.keys(variables).filter((name) => name.startsWith('--pf-surface-'))).toHaveLength(
      surfaceCount,
    );
  });
});
