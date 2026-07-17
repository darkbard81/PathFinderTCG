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
import { PF2eNineLabel } from './PF2eNineLabel';
import { PF2eNinePatch2 } from './PF2eNinePatch2';
import { PF2ePanel } from './PF2ePanel';
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
    const scrollablePanel = scene.rexUI.add.scrollablePanel({
      width: 2,
      height: 2,
      scrollMode: 0,
      panel: {
        child: scrollContent,
        mask: {
          padding: PF2E_ELF_THEME.components.showcase.maskPadding,
          maskType: 'stencil',
        },
      },
      slider: {
        track: scene.rexUI.add.roundRectangle({
          width: PF2E_ELF_THEME.sizes.scrollbar,
          height: 2,
          radius: PF2E_ELF_THEME.radii.control,
          color: PF2E_ELF_THEME.colors.surface,
          strokeColor: PF2E_ELF_THEME.colors.border,
          strokeWidth: PF2E_ELF_THEME.strokes.hairline,
        }),
        thumb: scene.rexUI.add.roundRectangle({
          width: PF2E_ELF_THEME.sizes.scrollbar,
          height: PF2E_ELF_THEME.sizes.minimumTouchTarget,
          radius: PF2E_ELF_THEME.radii.control,
          color: PF2E_ELF_THEME.colors.accent,
        }),
        adaptThumbSize: true,
        minThumbSize: PF2E_ELF_THEME.sizes.minimumTouchTarget,
      },
      scroller: {
        threshold: 8,
        pointerOutRelease: true,
      },
      mouseWheelScroller: {
        focus: true,
        speed: 0.12,
      },
      clampChildOY: true,
      space: {
        sliderY: PF2E_ELF_THEME.spacing.controlGap,
      },
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
