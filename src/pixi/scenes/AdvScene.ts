import { Container, Sprite, Texture } from 'pixi.js';
import {
  createAdvView,
  type AdvStandingModel,
  type AdvView,
  type AdvViewModel,
} from '../../dom/screens/adv-view';
import type {
  StageAdvAssetKey,
  StageAdvBeatDefinition,
  StageAdvDefinition,
} from '../../game/stage/types';
import type { ViewportLayout } from '../app/viewport';
import {
  loadStageAdvBundle,
  type LoadedStageAdvBundle,
  type StageAdvPhase,
  unloadStageAdvBundle,
} from '../assets/adv-assets';
import type { Scene } from './scene';

/** 테스트와 런타임이 같은 ADV 번들 생명주기 계약을 쓰게 하는 최소 loader 표면이다. */
export type StageAdvAssetLoader = {
  load: (
    assetBaseUrl: string,
    stageId: string,
    phase: StageAdvPhase,
  ) => Promise<LoadedStageAdvBundle>;
  unload: (bundleId: string) => Promise<void>;
};

/** 한 번 재생할 Stage ADV와 완료 뒤 이어갈 화면을 묶은 옵션이다. */
export type AdvSceneOptions = {
  assetBaseUrl: string;
  stageId: string;
  phase: StageAdvPhase;
  definition: StageAdvDefinition;
  onComplete: () => void;
  view?: AdvView;
  assets?: StageAdvAssetLoader;
};

const defaultAssetLoader: StageAdvAssetLoader = {
  load: loadStageAdvBundle,
  unload: unloadStageAdvBundle,
};

/** Stage 전후의 선형 ADV를 재생하고 컷씬 번들 수명을 화면 전환에 맞춰 관리한다. */
export class AdvScene implements Scene {
  public readonly view = new Container({
    label: 'adv',
    eventMode: 'none',
    isRenderGroup: true,
  });
  public readonly element: HTMLElement;

  private readonly advView: AdvView;
  private readonly assets: StageAdvAssetLoader;
  private layout: ViewportLayout | null = null;
  private cutscene: Sprite | null = null;
  private cutsceneAssetKey: StageAdvAssetKey | null = null;
  private standings: AdvStandingModel[] = [];
  private bundle: LoadedStageAdvBundle | null = null;
  private beatIndex = 0;
  private state: AdvViewModel['state'] = 'loading';
  private errorMessage = '';
  private active = true;
  private completed = false;
  private loadAttempt = 0;

  public constructor(private readonly options: AdvSceneOptions) {
    this.assets = options.assets ?? defaultAssetLoader;
    this.advView =
      options.view ??
      createAdvView({
        onNext: () => this.next(),
        onSkip: () => this.skip(),
        onRetry: () => this.retry(),
      });
    this.element = this.advView.element;
  }

  /** 첫 beat부터 시작하고 자산 로딩은 전환 queue를 막지 않게 백그라운드에서 시작한다. */
  public enter(): void {
    this.active = true;
    this.completed = false;
    this.beatIndex = 0;
    this.state = 'loading';
    this.errorMessage = '';
    this.standings = [];
    this.renderView();
    void this.loadAssets();
  }

  /** 컷씬 Sprite를 먼저 파괴한 뒤 로드한 phase 번들을 해제한다. */
  public async exit(): Promise<void> {
    this.active = false;
    this.loadAttempt += 1;
    this.destroyCutscene();

    const bundle = this.bundle;
    this.bundle = null;
    if (bundle) {
      await this.assets.unload(bundle.bundleId);
    }
  }

  /** 라우터가 전달한 논리 영역 안에서 컷씬을 cover 배치한다. */
  public resize(layout: ViewportLayout): void {
    this.layout = layout;
    this.layoutCutscene();
  }

  private async loadAssets(): Promise<void> {
    const attempt = ++this.loadAttempt;
    this.state = 'loading';
    this.errorMessage = '';
    this.renderView();

    let loadedBundle: LoadedStageAdvBundle | null = null;
    try {
      loadedBundle = await this.assets.load(
        this.options.assetBaseUrl,
        this.options.stageId,
        this.options.phase,
      );

      if (!this.active || this.completed || attempt !== this.loadAttempt) {
        await this.assets.unload(loadedBundle.bundleId);
        return;
      }

      assertRequiredAssets(this.options.definition, loadedBundle);
      this.bundle = loadedBundle;
      this.applyBeatVisuals(this.options.definition.beats[0]);
      this.state = 'ready';
      this.renderView();
    } catch (error: unknown) {
      this.destroyCutscene();
      if (loadedBundle) {
        if (this.bundle === loadedBundle) {
          this.bundle = null;
        }
        await this.assets.unload(loadedBundle.bundleId).catch(() => undefined);
      }

      if (!this.active || this.completed || attempt !== this.loadAttempt) {
        return;
      }

      this.state = 'error';
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.renderView();
    }
  }

  private next(): void {
    if (this.completed || this.state !== 'ready') {
      return;
    }

    if (this.beatIndex >= this.options.definition.beats.length - 1) {
      this.complete();
      return;
    }

    this.beatIndex += 1;
    this.applyBeatVisuals(this.options.definition.beats[this.beatIndex]!);
    this.renderView();
  }

  private skip(): void {
    this.complete();
  }

  private retry(): void {
    if (this.completed || this.state !== 'error') {
      return;
    }

    void this.loadAssets();
  }

  private complete(): void {
    if (this.completed) {
      return;
    }

    this.completed = true;
    this.loadAttempt += 1;
    this.renderView();
    this.options.onComplete();
  }

  private renderView(): void {
    const beat = this.options.definition.beats[this.beatIndex];
    const ready = this.state === 'ready' && beat !== undefined;

    this.advView.render({
      state: this.state,
      standings: ready ? this.standings : [],
      speaker: ready ? beat.speaker : null,
      text: ready ? beat.text : '',
      faceImageUrl: ready ? this.resolveAssetUrl(beat.faceAssetKey) : null,
      progressText: ready ? `${this.beatIndex + 1} / ${this.options.definition.beats.length}` : '',
      errorMessage: this.errorMessage,
      completed: this.completed,
    });
  }

  private applyBeatVisuals(beat: StageAdvBeatDefinition): void {
    if (beat.cutsceneAssetKey !== undefined) {
      this.applyCutscene(beat.cutsceneAssetKey);
    }

    if (beat.standings !== undefined) {
      this.standings = beat.standings.map((standing) => ({
        position: standing.position,
        imageUrl: this.requireAssetUrl(standing.assetKey),
      }));
    }
  }

  private applyCutscene(assetKey: StageAdvAssetKey): void {
    if (this.cutsceneAssetKey === assetKey) {
      return;
    }

    const texture = this.bundle?.resources[assetKey];
    if (!(texture instanceof Texture)) {
      throw new Error(`ADV cutscene is not a texture: ${assetKey}`);
    }

    if (this.cutscene) {
      this.cutscene.texture = texture;
    } else {
      this.cutscene = new Sprite({
        texture,
        label: 'adv-cutscene',
        eventMode: 'none',
      });
      this.view.addChild(this.cutscene);
    }
    this.cutsceneAssetKey = assetKey;
    this.layoutCutscene();
  }

  private resolveAssetUrl(assetKey: StageAdvAssetKey | null): string | null {
    return assetKey === null ? null : this.requireAssetUrl(assetKey);
  }

  private requireAssetUrl(assetKey: StageAdvAssetKey): string {
    const url = this.bundle?.urls.get(assetKey);
    if (!url) {
      throw new Error(`Missing ADV asset URL: ${assetKey}`);
    }
    return url;
  }

  private layoutCutscene(): void {
    const layout = this.layout;
    const cutscene = this.cutscene;
    if (!layout || !cutscene) {
      return;
    }

    const scale = Math.max(
      layout.width / cutscene.texture.width,
      layout.height / cutscene.texture.height,
    );
    cutscene.scale.set(scale);
    cutscene.position.set(
      (layout.width - cutscene.texture.width * scale) / 2,
      (layout.height - cutscene.texture.height * scale) / 2,
    );
  }

  private destroyCutscene(): void {
    this.cutscene?.destroy();
    this.cutscene = null;
    this.cutsceneAssetKey = null;
  }
}

function assertRequiredAssets(definition: StageAdvDefinition, bundle: LoadedStageAdvBundle): void {
  const requiredKeys = new Set<StageAdvAssetKey>();
  const cutsceneKeys = new Set<StageAdvAssetKey>();
  for (const beat of definition.beats) {
    if (beat.cutsceneAssetKey !== undefined) {
      requiredKeys.add(beat.cutsceneAssetKey);
      cutsceneKeys.add(beat.cutsceneAssetKey);
    }
    for (const standing of beat.standings ?? []) {
      requiredKeys.add(standing.assetKey);
    }
    if (beat.faceAssetKey !== null) {
      requiredKeys.add(beat.faceAssetKey);
    }
  }

  for (const assetKey of requiredKeys) {
    if (!(assetKey in bundle.resources) || !bundle.urls.has(assetKey)) {
      throw new Error(`Missing ADV asset: ${assetKey}`);
    }
  }

  for (const assetKey of cutsceneKeys) {
    if (!(bundle.resources[assetKey] instanceof Texture)) {
      throw new Error(`ADV cutscene is not a texture: ${assetKey}`);
    }
  }
}
