import './fonts.css';
import { UI_THEME } from '../theme';

/** 이 프로젝트가 쓰는 굵기다. 본문과 제목 두 종만 둔다. */
const REQUIRED_WEIGHTS = [400, 700];

/**
 * 테마 폰트를 미리 받아 DOM과 캔버스가 첫 화면부터 같은 글꼴을 쓰게 한다.
 * `font-display: swap`이라 쓰이는 곳이 없으면 브라우저가 로딩을 미루므로 명시적으로 요청한다.
 * 실패해도 폴백 글꼴로 계속 진행한다.
 */
export async function loadThemeFont(): Promise<boolean> {
  try {
    await Promise.all(
      REQUIRED_WEIGHTS.map((weight) =>
        document.fonts.load(`${weight} 1em "${UI_THEME.fontFamily}"`),
      ),
    );

    return true;
  } catch {
    return false;
  }
}
