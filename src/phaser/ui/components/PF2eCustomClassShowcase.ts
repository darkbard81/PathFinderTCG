import type * as Phaser from 'phaser';
import { Pages } from 'phaser4-rex-plugins/templates/ui/ui-components.js';
import type Sizer from 'phaser4-rex-plugins/templates/ui/sizer/Sizer.js';

import {
  getPF2eCustomClassDefinition,
  PF2E_DEFAULT_CUSTOM_CLASS_ID,
  type PF2eCustomClassId,
} from '../showcase/pf2eCustomClassCatalog';
import {
  PF2E_ELF_THEME,
  PF2E_NINE_LABEL_VARIANTS,
  PF2E_NINE_PATCH_VISUAL_STATES,
  type PF2eNineLabelVariant,
  type PF2eNinePatchVariant,
  type PF2eNinePatchVisualState,
} from '../theme/pf2eElfTheme';
import { PF2eBadgeLabel } from './PF2eBadgeLabel';
import { PF2eButtons } from './PF2eButtons';
import { PF2eConfirmDialog } from './PF2eConfirmDialog';
import { PF2eGridTable, type PF2eGridTableItem } from './PF2eGridTable';
import { PF2eNineLabel } from './PF2eNineLabel';
import { PF2eNinePatch2 } from './PF2eNinePatch2';
import { PF2ePanel } from './PF2ePanel';
import { PF2eScrollablePanel } from './PF2eScrollablePanel';
import { PF2eTabPages } from './PF2eTabPages';

export interface PF2eCustomClassShowcaseConfig {
  readonly contentWidth: number;
  readonly initialClassId?: PF2eCustomClassId;
}

export class PF2eCustomClassShowcase extends Pages {
  private readonly contentWidth: number;
  private currentClassId: PF2eCustomClassId;

  constructor(scene: Phaser.Scene, config: PF2eCustomClassShowcaseConfig) {
    super(scene, {
      width: 2,
      height: 2,
      fadeIn: 0,
      swapMode: 'invisible',
    });

    scene.add.existing(this);
    this.contentWidth = Math.max(
      PF2E_ELF_THEME.components.showcase.minimumContentWidth,
      Math.round(config.contentWidth),
    );
    this.currentClassId = config.initialClassId ?? PF2E_DEFAULT_CUSTOM_CLASS_ID;

    this.addBackground(
      new PF2eNinePatch2(scene, {
        variant: 'panel',
        width: 2,
        height: 2,
      }),
    );

    this.addPage(this.createNinePatchPage(scene), {
      key: 'ninePatch2',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });
    this.addPage(this.createNineLabelPage(scene), {
      key: 'nineLabel',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });
    this.addPage(this.createPanelPage(scene), {
      key: 'panel',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });
    this.addPage(this.createTabPagesPage(scene), {
      key: 'tabPages',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });
    this.addPage(this.createScrollablePanelPage(scene), {
      key: 'scrollablePanel',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });
    this.addPage(this.createGridTablePage(scene), {
      key: 'gridTable',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });
    this.addPage(this.createConfirmDialogPage(scene), {
      key: 'confirmDialog',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });
    this.addPage(this.createBadgeLabelPage(scene), {
      key: 'badgeLabel',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });
    this.addPage(this.createButtonsPage(scene), {
      key: 'buttons',
      align: 'center',
      padding: PF2E_ELF_THEME.components.showcase.inset,
      expand: true,
    });

    this.showClass(this.currentClassId);
  }

  showClass(classId: PF2eCustomClassId): this {
    this.currentClassId = classId;
    this.swapPage(classId, 0);
    return this;
  }

  private createNinePatchPage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('ninePatch2');
    const content = this.createContentSizer(scene);

    content
      .add(this.createSectionLabel(scene, 'Variants'), { expand: true })
      .add(
        this.createPatchSample(
          scene,
          'panel · 확장형 패널',
          'panel',
          'idle',
          PF2E_ELF_THEME.components.showcase.panelSampleHeight,
        ),
        {
          expand: true,
        },
      )
      .add(
        this.createPatchSample(
          scene,
          'control · 컨트롤 프레임',
          'control',
          'idle',
          PF2E_ELF_THEME.components.showcase.controlSampleHeight,
        ),
        {
          expand: true,
        },
      )
      .add(
        this.createPatchSample(
          scene,
          'tab · 탭 전용 프레임',
          'tab',
          'idle',
          PF2E_ELF_THEME.components.tabPages.tabHeight,
        ),
        {
          expand: true,
        },
      )
      .add(this.createSectionLabel(scene, 'Visual states'), { expand: true });

    for (const state of PF2E_NINE_PATCH_VISUAL_STATES) {
      content.add(
        this.createPatchSample(scene, state, 'control', state, PF2E_ELF_THEME.sizes.treeRow),
        { expand: true },
      );
    }

    return this.createPageShell(scene, definition.id, content);
  }

  private createNineLabelPage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('nineLabel');
    const content = this.createContentSizer(scene);
    let activationCount = 0;
    const activationStatus = this.createBodyText(
      scene,
      '버튼을 눌러 onActivate callback을 확인하세요.',
      PF2E_ELF_THEME.colors.accentText,
    );

    content.add(this.createSectionLabel(scene, 'Variants'), { expand: true });
    for (const variant of PF2E_NINE_LABEL_VARIANTS) {
      content.add(this.createLabelVariantSample(scene, variant), { expand: true });
    }

    content
      .add(this.createSectionLabel(scene, 'Interactive callbacks'), { expand: true })
      .add(
        new PF2eNineLabel(scene, {
          text: 'Primary callback',
          variant: 'primary',
          width: this.contentWidth,
          onActivate: () => {
            activationCount += 1;
            activationStatus.setText(`primary callback · ${activationCount}회`);
          },
        }),
        { expand: true },
      )
      .add(
        new PF2eNineLabel(scene, {
          text: 'Danger callback',
          variant: 'danger',
          width: this.contentWidth,
          onActivate: () => {
            activationCount += 1;
            activationStatus.setText(`danger callback · ${activationCount}회`);
          },
        }),
        { expand: true },
      )
      .add(activationStatus, { align: 'left' })
      .add(this.createSectionLabel(scene, 'Visual states'), { expand: true });

    for (const state of PF2E_NINE_PATCH_VISUAL_STATES) {
      const stateLabel = new PF2eNineLabel(scene, {
        text: state,
        variant: 'primary',
        width: this.contentWidth,
        enabled: state !== 'disabled',
      }).setVisualState(state);
      content.add(stateLabel, { expand: true });
    }

    return this.createPageShell(scene, definition.id, content);
  }

  private createPanelPage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('panel');
    const content = this.createContentSizer(scene);
    const panelTheme = PF2E_ELF_THEME.components.tabPages;
    const innerWidth = Math.max(160, this.contentWidth - panelTheme.pageInset * 2);
    const verticalPanel = new PF2ePanel(scene, {
      width: this.contentWidth,
      height: PF2E_ELF_THEME.components.showcase.panelDemoHeight,
      inset: panelTheme.pageInset,
      itemGap: PF2E_ELF_THEME.components.showcase.sampleGap,
    })
      .add(
        new PF2eNineLabel(scene, {
          text: 'Vertical panel',
          variant: 'section',
          width: innerWidth,
        }),
        { expand: true },
      )
      .add(
        this.createBodyText(
          scene,
          'NinePatch 패널 배경, inset, itemGap을 하나의 Sizer 상속 컴포넌트로 제공합니다.',
          PF2E_ELF_THEME.colors.mutedText,
          innerWidth,
        ),
        { align: 'left' },
      );
    const horizontalPanel = new PF2ePanel(scene, {
      width: this.contentWidth,
      height: PF2E_ELF_THEME.components.showcase.panelDemoHeight,
      orientation: 'x',
      inset: panelTheme.pageInset,
      visualState: 'selected',
    })
      .add(
        new PF2eNineLabel(scene, {
          text: 'Left',
          variant: 'status',
        }),
        { proportion: 1 },
      )
      .add(
        new PF2eNineLabel(scene, {
          text: 'Right',
          variant: 'status',
        }),
        { proportion: 1 },
      );

    content
      .add(this.createSectionLabel(scene, 'Layout surfaces'), { expand: true })
      .add(verticalPanel, { expand: true })
      .add(horizontalPanel, { expand: true });

    return this.createPageShell(scene, definition.id, content);
  }

  private createTabPagesPage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('tabPages');
    const content = this.createContentSizer(scene);
    const status = this.createBodyText(
      scene,
      '선택 페이지 · summary',
      PF2E_ELF_THEME.colors.accentText,
    );
    const tabPages = new PF2eTabPages(scene, {
      width: this.contentWidth,
      height: PF2E_ELF_THEME.components.showcase.tabPagesDemoHeight,
      initialPageId: 'summary',
      pages: [
        {
          id: 'summary',
          title: '요약',
          page: this.createTabPagePanel(
            scene,
            'Summary page',
            '선택한 카드와 덱의 핵심 정보를 표시하는 페이지입니다.',
          ),
        },
        {
          id: 'deck',
          title: '덱',
          page: this.createTabPagePanel(
            scene,
            'Deck page',
            '카드 구성과 남은 덱 제한을 표시하는 페이지입니다.',
          ),
        },
        {
          id: 'history',
          title: '기록',
          page: this.createTabPagePanel(
            scene,
            'History page',
            '최근 전투와 카드 획득 기록을 표시하는 페이지입니다.',
          ),
        },
      ],
      onPageChange: (pageId) => {
        status.setText(`선택 페이지 · ${pageId}`);
      },
    });

    content
      .add(this.createSectionLabel(scene, 'Interactive tab pages'), { expand: true })
      .add(tabPages, { expand: true })
      .add(status, { align: 'left' });

    return this.createPageShell(scene, definition.id, content);
  }

  private createScrollablePanelPage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('scrollablePanel');
    const content = this.createContentSizer(scene);
    const childWidth = Math.max(
      160,
      this.contentWidth -
        PF2E_ELF_THEME.sizes.scrollbar -
        PF2E_ELF_THEME.components.scrollablePanel.sliderGap,
    );
    const list = scene.rexUI.add.sizer({
      width: childWidth,
      orientation: 'y',
      space: {
        item: PF2E_ELF_THEME.components.showcase.sampleGap,
      },
    });
    const status = this.createBodyText(scene, '스크롤 위치 · 0%', PF2E_ELF_THEME.colors.accentText);

    for (let index = 1; index <= 10; index += 1) {
      list.add(
        new PF2eNineLabel(scene, {
          text: `엘프 전술 기록 ${index}`,
          variant: index === 1 ? 'section' : 'status',
          width: childWidth,
        }),
        { expand: true },
      );
    }

    const scrollablePanel = new PF2eScrollablePanel(scene, {
      width: this.contentWidth,
      height: PF2E_ELF_THEME.components.showcase.scrollablePanelDemoHeight,
      child: list,
      hideScrollbarWhenUnscrollable: false,
      onScroll: (progress) => {
        status.setText(`스크롤 위치 · ${Math.round(progress * 100)}%`);
      },
    });

    content
      .add(this.createSectionLabel(scene, 'Wheel, drag and themed scrollbar'), { expand: true })
      .add(scrollablePanel, { expand: true })
      .add(status, { align: 'left' });

    return this.createPageShell(scene, definition.id, content);
  }

  private createGridTablePage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('gridTable');
    const content = this.createContentSizer(scene);
    const items: readonly PF2eGridTableItem[] = [
      { id: 'ranger', title: '숲의 정찰자', detail: '이동 · 사거리 3' },
      { id: 'druid', title: '달빛 드루이드', detail: '회복 · 자연 주문' },
      { id: 'warden', title: '고목의 수호자', detail: '방어 · 도발' },
      { id: 'archer', title: '은엽 궁수', detail: '원거리 · 관통' },
      { id: 'seer', title: '별잎 예언자', detail: '탐색 · 카드 예견' },
      { id: 'blade', title: '녹음의 검무사', detail: '연속 공격 · 회피' },
      { id: 'healer', title: '샘물 치유사', detail: '정화 · 지속 회복' },
      { id: 'scout', title: '이끼길 척후병', detail: '선제 · 은신' },
      { id: 'keeper', title: '룬숲 기록관', detail: '지식 · 카드 회수' },
      { id: 'falconer', title: '매 조련사', detail: '정찰 · 표식' },
      { id: 'weaver', title: '가시덩굴 직조사', detail: '속박 · 반격' },
      { id: 'captain', title: '금빛잎 대장', detail: '지휘 · 강화' },
    ];
    const status = this.createBodyText(
      scene,
      '선택 카드 · 숲의 정찰자',
      PF2E_ELF_THEME.colors.accentText,
    );
    const gridTable = new PF2eGridTable(scene, {
      width: this.contentWidth,
      height: PF2E_ELF_THEME.components.showcase.gridTableDemoHeight,
      items,
      columns: this.contentWidth >= 480 ? 2 : 1,
      initialSelectedId: 'ranger',
      onSelectionChange: (item) => {
        status.setText(`선택 카드 · ${item.title}`);
      },
    });

    content
      .add(this.createSectionLabel(scene, 'Reusable themed cells'), { expand: true })
      .add(gridTable, { expand: true })
      .add(status, { align: 'left' });

    return this.createPageShell(scene, definition.id, content);
  }

  private createConfirmDialogPage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('confirmDialog');
    const content = this.createContentSizer(scene);
    const status = this.createBodyText(
      scene,
      '대화상자 결과 · 대기 중',
      PF2E_ELF_THEME.colors.accentText,
    );
    const openButton = new PF2eButtons(scene, {
      buttons: [{ id: 'openDialog', text: '확인 대화상자 열기', variant: 'danger' }],
      onButtonClick: () => {
        new PF2eConfirmDialog(scene, {
          title: '카드를 추방하시겠습니까?',
          message:
            '선택한 카드는 이번 덱에서 제거됩니다. 이 예제는 게임 상태를 변경하지 않고 confirm/cancel callback만 시연합니다.',
          confirmText: '추방',
          cancelText: '돌아가기',
          danger: true,
          width: Math.min(620, Math.max(360, scene.scale.gameSize.width - 64)),
          height: PF2E_ELF_THEME.components.showcase.confirmDialogDemoHeight,
          onConfirm: () => {
            status.setText('대화상자 결과 · confirm');
          },
          onCancel: () => {
            status.setText('대화상자 결과 · cancel');
          },
        }).openModal();
      },
    });

    content
      .add(this.createSectionLabel(scene, 'Modal confirm and cancel'), { expand: true })
      .add(
        this.createBodyText(
          scene,
          '새 dialog 프레임과 button 프레임, modal cover를 실제 입력으로 확인합니다.',
          PF2E_ELF_THEME.colors.mutedText,
        ),
        { align: 'left' },
      )
      .add(openButton, { expand: true })
      .add(status, { align: 'left' });

    return this.createPageShell(scene, definition.id, content);
  }

  private createBadgeLabelPage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('badgeLabel');
    const content = this.createContentSizer(scene);
    const mutableBadge = new PF2eBadgeLabel(scene, {
      text: '보유 카드',
      badgeValue: 3,
      badgePosition: 'rightTop',
    });
    let badgeValue = 3;
    const incrementButton = new PF2eButtons(scene, {
      buttons: [{ id: 'incrementBadge', text: '배지 +1' }],
      onButtonClick: () => {
        badgeValue += 1;
        mutableBadge.setBadgeValue(badgeValue);
      },
    });

    content
      .add(this.createSectionLabel(scene, 'Badge positions and values'), { expand: true })
      .add(mutableBadge, { expand: true })
      .add(
        new PF2eBadgeLabel(scene, {
          text: '새로운 퀘스트',
          badgeValue: '!',
          badgePosition: 'leftTop',
        }),
        { expand: true },
      )
      .add(incrementButton, { expand: true });

    return this.createPageShell(scene, definition.id, content);
  }

  private createButtonsPage(scene: Phaser.Scene): Sizer {
    const definition = getPF2eCustomClassDefinition('buttons');
    const content = this.createContentSizer(scene);
    const status = this.createBodyText(
      scene,
      '버튼 입력 · 대기 중',
      PF2E_ELF_THEME.colors.accentText,
    );
    const horizontal = new PF2eButtons(scene, {
      buttons: [
        { id: 'scout', text: '정찰' },
        { id: 'endTurn', text: '턴 종료', variant: 'danger' },
      ],
      onButtonClick: (buttonId) => {
        status.setText(`버튼 입력 · ${buttonId}`);
      },
    });
    const vertical = new PF2eButtons(scene, {
      orientation: 'y',
      buttons: [
        { id: 'draw', text: '카드 뽑기' },
        { id: 'locked', text: '잠긴 행동', enabled: false },
      ],
      onButtonClick: (buttonId) => {
        status.setText(`버튼 입력 · ${buttonId}`);
      },
    });

    content
      .add(this.createSectionLabel(scene, 'Horizontal action group'), { expand: true })
      .add(horizontal, { expand: true })
      .add(this.createSectionLabel(scene, 'Vertical and disabled state'), { expand: true })
      .add(vertical, { expand: true })
      .add(status, { align: 'left' });

    return this.createPageShell(scene, definition.id, content);
  }

  private createTabPagePanel(scene: Phaser.Scene, title: string, description: string): PF2ePanel {
    const theme = PF2E_ELF_THEME.components.tabPages;
    const innerWidth = Math.max(140, this.contentWidth - theme.inset * 2 - theme.pageInset * 2);

    return new PF2ePanel(scene, {
      width: 2,
      height: 2,
      inset: theme.pageInset,
      itemGap: PF2E_ELF_THEME.components.showcase.sampleGap,
    })
      .add(
        new PF2eNineLabel(scene, {
          text: title,
          variant: 'status',
          width: innerWidth,
        }),
        { expand: true },
      )
      .add(this.createBodyText(scene, description, PF2E_ELF_THEME.colors.mutedText, innerWidth), {
        align: 'left',
      });
  }

  private createPageShell(
    scene: Phaser.Scene,
    classId: PF2eCustomClassId,
    scrollContent: Sizer,
  ): Sizer {
    const definition = getPF2eCustomClassDefinition(classId);
    const gap = PF2E_ELF_THEME.components.showcase.sectionGap;
    const page = scene.rexUI.add.sizer({
      width: 2,
      height: 2,
      orientation: 'y',
      space: {
        item: gap,
      },
    });
    const title = new PF2eNineLabel(scene, {
      text: definition.name,
      variant: 'heading',
      fontSize: PF2E_ELF_THEME.components.showcase.titleFontSize,
    });
    const apiSummary = this.createBodyText(
      scene,
      [
        `extends ${definition.baseClass}`,
        definition.summary,
        `Config · ${definition.configKeys.join(', ')}`,
        `Variants · ${definition.variants.join(', ')}`,
        `States · ${definition.states.join(', ')}`,
        '마우스 휠 또는 드래그로 아래 샘플을 스크롤합니다.',
      ].join('\n'),
      PF2E_ELF_THEME.colors.mutedText,
    );
    const scrollablePanel = new PF2eScrollablePanel(scene, {
      width: 2,
      height: 2,
      child: scrollContent,
    });

    return page
      .add(title, { align: 'center', expand: true })
      .add(apiSummary, { align: 'left' })
      .add(scrollablePanel, { proportion: 1, expand: true });
  }

  private createContentSizer(scene: Phaser.Scene): Sizer {
    return scene.rexUI.add.sizer({
      width: this.contentWidth,
      orientation: 'y',
      space: {
        item: PF2E_ELF_THEME.components.showcase.sampleGap,
      },
    });
  }

  private createSectionLabel(scene: Phaser.Scene, text: string): PF2eNineLabel {
    return new PF2eNineLabel(scene, {
      text,
      variant: 'status',
      width: this.contentWidth,
      fontSize: PF2E_ELF_THEME.components.showcase.sectionFontSize,
    });
  }

  private createPatchSample(
    scene: Phaser.Scene,
    text: string,
    variant: PF2eNinePatchVariant,
    state: PF2eNinePatchVisualState,
    height: number,
  ): Sizer {
    const sample = scene.rexUI.add.sizer({
      width: this.contentWidth,
      height,
      orientation: 'y',
      space: {
        left: PF2E_ELF_THEME.components.showcase.samplePaddingX,
        right: PF2E_ELF_THEME.components.showcase.samplePaddingX,
        top: PF2E_ELF_THEME.components.showcase.samplePaddingY,
        bottom: PF2E_ELF_THEME.components.showcase.samplePaddingY,
      },
    });
    const background = new PF2eNinePatch2(scene, {
      variant,
      width: 2,
      height: 2,
    }).setVisualState(state);
    const label = this.createBodyText(scene, text, PF2E_ELF_THEME.colors.text);

    return sample.addBackground(background).add(label, { align: 'center' });
  }

  private createLabelVariantSample(
    scene: Phaser.Scene,
    variant: PF2eNineLabelVariant,
  ): PF2eNineLabel {
    const defaultFontSize = PF2E_ELF_THEME.label[variant].fontSize;
    const fontSize =
      variant === 'heading'
        ? Math.min(
            defaultFontSize,
            Math.max(
              PF2E_ELF_THEME.components.showcase.responsiveHeadingMinimum,
              Math.round(
                this.contentWidth * PF2E_ELF_THEME.components.showcase.responsiveHeadingScale,
              ),
            ),
          )
        : defaultFontSize;

    return new PF2eNineLabel(scene, {
      text: `${variant} · 표시 샘플`,
      variant,
      width: this.contentWidth,
      fontSize,
    });
  }

  private createBodyText(
    scene: Phaser.Scene,
    text: string,
    color: string,
    wrapWidth = this.contentWidth,
  ): Phaser.GameObjects.Text {
    return scene.add.text(0, 0, text, {
      color,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${PF2E_ELF_THEME.components.showcase.bodyFontSize}px`,
      lineSpacing: PF2E_ELF_THEME.components.showcase.bodyLineSpacing,
      wordWrap: {
        width: wrapWidth,
        useAdvancedWrap: true,
      },
    });
  }
}
