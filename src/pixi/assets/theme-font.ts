import { Assets } from 'pixi.js';
import { joinAssetUrl } from '../../game/assets/manifest';
import { UI_THEME } from '../../theme';

const THEME_FONT_PATH = 'fonts/CookieRun Bold.ttf';

/**
 * 테마가 선언한 폰트를 로딩해 DOM과 캔버스가 같은 글꼴을 쓰게 한다.
 * 로딩에 실패해도 폴백 글꼴로 계속 진행한다. 글꼴은 표현일 뿐 흐름을 끊을 이유가 없다.
 */
export async function loadThemeFont(assetBaseUrl: string): Promise<boolean> {
  try {
    await Assets.load({
      alias: 'theme-font',
      src: joinAssetUrl(assetBaseUrl, THEME_FONT_PATH),
      data: { family: UI_THEME.fontFamily },
    });

    return true;
  } catch {
    return false;
  }
}
