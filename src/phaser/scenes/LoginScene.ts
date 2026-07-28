import * as Phaser from 'phaser';

import { PathfinderApiError } from '../../game/client/PathfinderApiClient.js';
import { getGameSession } from '../adapters/sceneBridge.js';
import { PF2eAuthPanel } from '../ui/components/PF2eAuthPanel.js';
import { PF2eScreenPanel } from '../ui/components/PF2eScreenPanel.js';
import { PF2eButtonsController } from '../ui/controllers/PF2eButtonsController.js';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme.js';
import { calculatePhaseSevenLayout } from '../../ui/layout/phaseSevenLayout.js';

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
  private screen?: PF2eScreenPanel;
  private authPanel?: PF2eAuthPanel;
  private buttonsController?: PF2eButtonsController;
  private initialStatus = '';
  private busy = false;

  constructor() {
    super('LoginScene');
  }

  init(data: LoginSceneData): void {
    this.initialStatus = data.status ?? '';
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.rebuildLayout(gameSize.width, gameSize.height);
  };

  private rebuildLayout(width: number, height: number): void {
    const previousCredentials = this.authPanel?.getCredentials();
    const layout = calculatePhaseSevenLayout(width, height);

    this.buttonsController?.destroy();
    this.buttonsController = undefined;
    this.screen?.destroy();
    this.screen = undefined;
    this.authPanel = undefined;

    const authPanel = new PF2eAuthPanel(this, {
      width: Math.max(240, layout.rootWidth - layout.panelInset * 2),
      compact: layout.width < 620,
    });
    if (previousCredentials !== undefined) {
      authPanel.usernameField.textInput.setValue(previousCredentials.username);
      authPanel.passwordField.textInput.setValue(previousCredentials.password);
    }
    authPanel.setEnabled(!this.busy);

    const screen = new PF2eScreenPanel(this, {
      width: layout.rootWidth,
      height: layout.rootHeight,
      inset: layout.panelInset,
      gap: layout.gap,
      title: 'Pathfinder TCG',
      subtitle: '로컬 계정으로 로그인하거나 새 계정을 만든 뒤 세이브 슬롯을 선택하세요.',
      titleFontSize: layout.titleFontSize,
      bodyFontSize: layout.bodyFontSize,
      content: authPanel,
    })
      .setPosition(width / 2, height / 2)
      .layout();
    screen.setStatus(
      this.initialStatus ||
        '사용자명: 영문 소문자 / 숫자 / 밑줄 / 하이픈 3~24자\n비밀번호: 12~128자',
    );
    this.buttonsController = new PF2eButtonsController(authPanel.buttons, {
      onButtonClick: (buttonId) => {
        void this.submit(buttonId === 'register');
      },
    });
    this.authPanel = authPanel;
    this.screen = screen;
    this.game.canvas.dataset.scene = 'login';
    this.game.canvas.dataset.orientation = layout.orientation;
  }

  private async submit(register: boolean): Promise<void> {
    if (this.busy || this.authPanel === undefined || this.screen === undefined) {
      return;
    }

    const credentials = this.authPanel.getCredentials();

    if (credentials.username.trim().length === 0 || credentials.password.length === 0) {
      this.screen.setStatus('사용자명과 비밀번호를 모두 입력하세요.', 'danger');
      return;
    }

    this.busy = true;
    this.authPanel.setEnabled(false);
    this.screen.setStatus(register ? '계정을 만들고 로그인하는 중입니다…' : '로그인 중입니다…');

    try {
      const session = getGameSession(this);
      if (register) {
        await session.registerAndLogin(credentials.username, credentials.password);
      } else {
        await session.login(credentials.username, credentials.password);
      }

      if (this.scene.isActive()) {
        this.scene.start('SaveSlotScene');
      }
    } catch (error: unknown) {
      this.busy = false;
      this.authPanel?.setEnabled(true);
      this.screen?.setStatus(errorMessage(error), 'danger');
    }
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.buttonsController?.destroy();
    this.buttonsController = undefined;
  };
}
