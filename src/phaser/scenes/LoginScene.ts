import * as Phaser from 'phaser';

import { PathfinderApiError } from '../../game/client/PathfinderApiClient.js';
import { calculateAuthDomLayout } from '../../ui/layout/authDomLayout.js';
import { getGameSession } from '../adapters/sceneBridge.js';
import { PF2eAuthDomElement } from '../ui/components/PF2eAuthDomElement.js';
import {
  PF2eAuthDomController,
  type PF2eAuthAction,
} from '../ui/controllers/PF2eAuthDomController.js';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme.js';

interface LoginSceneData {
  readonly status?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof PathfinderApiError || error instanceof Error) {
    return error.message;
  }

  return '로그인 요청을 처리하지 못했습니다.';
}

export class LoginScene extends Phaser.Scene {
  private authElement?: PF2eAuthDomElement;
  private authController?: PF2eAuthDomController;
  private initialStatus = '';
  private busy = false;

  constructor() {
    super('LoginScene');
  }

  init(data: LoginSceneData): void {
    this.initialStatus = data.status ?? '';
    this.busy = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    const authElement = new PF2eAuthDomElement(this, {
      initialStatus:
        this.initialStatus ||
        '사용자명: 영문 소문자 / 숫자 / 밑줄 / 하이픈 3~24자\n비밀번호: 12~128자',
    });
    this.authController = new PF2eAuthDomController(authElement.getEventTargets(), {
      onSubmit: (action) => {
        void this.submit(action);
      },
    });
    this.authElement = authElement;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.updateLayout(this.scale.gameSize.width, this.scale.gameSize.height);
    this.game.canvas.dataset.scene = 'login';
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.updateLayout(gameSize.width, gameSize.height);
  };

  private updateLayout(width: number, height: number): void {
    const layout = calculateAuthDomLayout(width, height);
    this.authElement?.updateLayout(layout);
    this.game.canvas.dataset.orientation = layout.orientation;
  }

  private async submit(action: PF2eAuthAction): Promise<void> {
    if (this.busy || this.authElement === undefined) {
      return;
    }

    const credentials = this.authElement.getCredentials();

    if (credentials.username.trim().length === 0 || credentials.password.length === 0) {
      this.authElement.setStatus('사용자명과 비밀번호를 모두 입력하세요.', 'danger');
      return;
    }

    this.busy = true;
    this.authElement.setEnabled(false);
    this.authElement.setStatus(
      action === 'register' ? '계정을 만들고 로그인하는 중입니다…' : '로그인 중입니다…',
    );

    try {
      const session = getGameSession(this);
      if (action === 'register') {
        await session.registerAndLogin(credentials.username, credentials.password);
      } else {
        await session.login(credentials.username, credentials.password);
      }

      if (this.scene.isActive()) {
        this.scene.start('SaveSlotScene');
      }
    } catch (error: unknown) {
      this.busy = false;
      this.authElement?.setEnabled(true);
      this.authElement?.setStatus(errorMessage(error), 'danger');
    }
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.authController?.destroy();
    this.authController = undefined;
    this.authElement = undefined;
  };
}
