import { Container } from 'pixi.js';
import {
  createTitleView,
  type TitleCredentials,
  type TitleView,
  type TitleViewModel,
} from '../../dom/screens/title-view';
import { AuthApiError } from '../../game/auth/client';
import type { GameServices } from '../../services/game-services';
import type { Scene } from './scene';

export type TitleSceneOptions = {
  services: GameServices;
  backgroundImageUrl: string;
  /** 로그인에 성공했을 때 다음 화면으로 넘기기 위한 신호다. */
  onAuthenticated: () => void;
  /** 세션 만료 등으로 타이틀에 돌아왔을 때 표시할 메시지다. */
  statusMessage?: string;
  view?: TitleView;
};

/** 타이틀 배경 위에서 계정 로그인과 신규 가입을 받는 첫 화면이다. */
export class TitleScene implements Scene {
  public readonly view = new Container({ label: 'title' });
  public readonly element: HTMLElement;

  private readonly titleView: TitleView;
  private status = '';
  private statusIsError = false;
  private busy = false;
  private active = true;

  public constructor(private readonly options: TitleSceneOptions) {
    this.titleView =
      options.view ??
      createTitleView({
        backgroundImageUrl: options.backgroundImageUrl,
        onSubmit: (credentials, register) => {
          void this.submitCredentials(credentials, register);
        },
      });
    this.element = this.titleView.element;
  }

  /** 기존 쿠키 세션이 살아 있으면 입력 없이 통과시킨다. */
  public async enter(): Promise<void> {
    this.renderView({ busy: true, status: 'Checking session...', statusIsError: false });

    try {
      const session = await this.options.services.auth.restore();

      if (session && this.active) {
        this.options.onAuthenticated();
        return;
      }

      this.renderView({
        busy: false,
        status: this.options.statusMessage ?? 'Enter your account details to continue.',
        statusIsError: false,
      });
      this.titleView.focusId();
    } catch (error) {
      this.renderView({ busy: false, status: formatAuthError(error), statusIsError: true });
      this.titleView.focusId();
    }
  }

  public exit(): void {
    this.active = false;
  }

  /** 배치는 CSS가 담당하므로 좌표 계산이 필요 없다. */
  public resize(): void {
    // 의도적으로 비어 있다.
  }

  private async submitCredentials(credentials: TitleCredentials, register: boolean): Promise<void> {
    this.renderView({
      busy: true,
      status: register ? 'Creating account...' : 'Signing in...',
      statusIsError: false,
    });

    try {
      const { auth } = this.options.services;

      if (register) {
        await auth.register(credentials);
      } else {
        await auth.login(credentials);
      }

      this.titleView.clearPassword();

      if (this.active) {
        this.options.onAuthenticated();
      }
    } catch (error) {
      this.titleView.clearPassword();
      this.renderView({ busy: false, status: formatAuthError(error), statusIsError: true });
      this.titleView.focusPassword();
    }
  }

  private renderView(patch: Partial<TitleViewModel>): void {
    this.status = patch.status ?? this.status;
    this.statusIsError = patch.statusIsError ?? this.statusIsError;
    this.busy = patch.busy ?? this.busy;
    this.titleView.render({
      status: this.status,
      statusIsError: this.statusIsError,
      busy: this.busy,
    });
  }
}

function formatAuthError(error: unknown): string {
  return error instanceof AuthApiError || error instanceof Error ? error.message : String(error);
}
