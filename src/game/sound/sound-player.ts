import type { SoundBackend, SoundVoiceHandle } from './sound-backend';
import type { SoundTrackSource } from './playlist-loader';
import type { BgmTrack, SoundTrack, VoiceTrack } from './playlist';
import {
  createDefaultVolumeState,
  decibelToGain,
  resolveChannelGain,
  VOLUME_CHANNELS,
  type ChannelVolume,
  type SoundVolumeState,
  type VolumeChannel,
} from './volume';

/** 곡을 바꿀 때 겹치는 시간이다. 끊고 붙이면 이음매가 그대로 들린다. */
export const DEFAULT_CROSSFADE_SECONDS = 1.2;

/**
 * 한 번에 울릴 수 있는 SFX 수다.
 *
 * 넘치면 가장 오래된 것부터 끊는다. 제한이 없으면 연출이 몰릴 때 소리가 겹쳐
 * 뭉개지고, 브라우저마다 동시 재생 한계에 먼저 부딪혀 어느 소리가 빠질지 알 수 없다.
 */
export const DEFAULT_SFX_POLYPHONY = 12;

export type SoundPlayerOptions = {
  backend: SoundBackend;
  volume?: SoundVolumeState;
  crossfadeSeconds?: number;
  sfxPolyphony?: number;
  /** 볼륨이 바뀔 때마다 부른다. 기기 저장소에 쓰는 일은 바깥이 맡는다. */
  onVolumeChange?: (state: SoundVolumeState) => void;
  /**
   * 소리 하나가 실패했을 때 부른다. 재생기는 멈추지 않는다.
   * 삼키기만 하면 왜 안 나는지 알 길이 없어 바깥에 알릴 자리를 둔다.
   */
  onError?: (message: string, error: unknown) => void;
};

/**
 * 화면이 볼륨을 만질 때 쓰는 좁은 표면이다.
 *
 * 설정 다이얼로그에 `SoundPlayer`를 통째로 넘기지 않는다. 화면이 필요한 것은 값을
 * 읽고 바꾸는 일뿐이고, 재생과 잠금 해제까지 손댈 수 있게 두면 씬이 소리 수명에 얽힌다.
 */
export type SoundVolumeControl = {
  getVolume: () => SoundVolumeState;
  setVolume: (channel: VolumeChannel, patch: Partial<ChannelVolume>) => void;
};

type ActiveBgm = {
  trackId: string;
  handle: SoundVoiceHandle;
  gain: number;
};

/**
 * 손잡이를 받기 전에 소리가 끝날 수 있어 자리를 먼저 잡아 둔다.
 * 콜백이 손잡이를 직접 닫으면, 받아 오는 도중에 불렸을 때 아직 없는 값을 읽는다.
 */
type VoiceSlot = { handle: SoundVoiceHandle | null; ended: boolean };

function createVoiceSlot(): VoiceSlot {
  return { handle: null, ended: false };
}

/**
 * 어떤 소리를 언제 트는지 정하는 곳이다. WebAudio를 직접 만지지 않는다.
 *
 * BGM은 씬이 아니라 이 객체가 들고 있다. 로그인부터 로비까지 다섯 화면을 넘나드는
 * 동안 곡이 끊기면 안 되는데, Scene 수명에 묶으면 화면을 옮길 때마다 처음으로 돌아간다.
 */
export class SoundPlayer {
  private readonly backend: SoundBackend;
  private readonly crossfadeSeconds: number;
  private readonly sfxPolyphony: number;
  private readonly onVolumeChange: ((state: SoundVolumeState) => void) | undefined;
  private readonly onError: ((message: string, error: unknown) => void) | undefined;
  private volume: SoundVolumeState;
  private bgm: ActiveBgm | null = null;
  private voice: SoundVoiceHandle | null = null;
  private readonly sfx: SoundVoiceHandle[] = [];
  /**
   * 자동재생이 풀리기 전에 들어온 BGM 요청이다.
   * 잠긴 동안 요청을 버리면 로그인 화면에서 건 곡이 로비에서 저절로 시작하지 않는다.
   */
  private pendingBgm: SoundTrackSource<BgmTrack> | null = null;
  /**
   * 잠금이 풀리기 전에 들어온 대사다.
   *
   * 쿠키 세션이 살아 있으면 로그인 화면이 입력 없이 지나가, 메인 메뉴에 닿을 때까지
   * 제스처가 한 번도 없을 수 있다. 그때 대사를 버리면 영영 나지 않는다.
   * 제스처와 같은 틱에 들어온 요청도 여기 담긴다. `resume()`이 아직 안 끝났을 뿐이다.
   *
   * 효과음은 담지 않는다. 늦게 터지면 화면과 어긋난 자리에서 나 오히려 방해가 된다.
   * 대사는 늦게 나도 대사다.
   */
  private pendingVoice: SoundTrackSource<VoiceTrack> | null = null;
  private destroyed = false;

  public constructor(options: SoundPlayerOptions) {
    this.backend = options.backend;
    this.crossfadeSeconds = options.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS;
    this.sfxPolyphony = options.sfxPolyphony ?? DEFAULT_SFX_POLYPHONY;
    this.onVolumeChange = options.onVolumeChange;
    this.onError = options.onError;
    this.volume = options.volume ?? createDefaultVolumeState();
    this.applyChannelGains();
  }

  public getVolume(): SoundVolumeState {
    return structuredClone(this.volume);
  }

  /** 채널 볼륨이나 음소거를 바꾼다. 바뀐 값은 곧바로 게인 그래프에 반영된다. */
  public setVolume(channel: VolumeChannel, patch: Partial<ChannelVolume>): void {
    this.volume = {
      ...this.volume,
      [channel]: { ...this.volume[channel], ...patch },
    };
    this.applyChannelGains();
    this.onVolumeChange?.(this.getVolume());
  }

  /**
   * 이 화면이 원하는 BGM을 선언한다. `null`이면 음악을 끈다.
   *
   * 지금 울리는 곡과 같으면 아무것도 하지 않는다. 명령형 `play`로 두면 화면을 옮길
   * 때마다 곡이 처음으로 돌아가므로, 씬은 원하는 상태만 말하고 판단은 여기서 한다.
   */
  public requestBgm(track: SoundTrackSource<BgmTrack> | null): void {
    if (this.destroyed) {
      return;
    }

    if (!this.backend.isRunning()) {
      // 아직 잠겨 있다. 마지막 요청만 기억했다가 풀릴 때 시작한다.
      this.pendingBgm = track;
      return;
    }

    this.pendingBgm = null;
    if (track === null) {
      this.stopBgm();
      return;
    }

    if (this.bgm?.trackId === track.id) {
      return;
    }

    this.startBgm(track);
  }

  /** 지금 울리는 BGM 트랙 id다. 없으면 null이다. */
  public getPlayingBgmId(): string | null {
    return this.bgm?.trackId ?? null;
  }

  /**
   * 대사를 재생한다. 동시 발음은 하나다.
   * 새 대사가 이전 대사를 끊는다. 겹치면 둘 다 알아들을 수 없다.
   */
  public async playVoice(track: SoundTrackSource<VoiceTrack>): Promise<void> {
    if (this.destroyed) {
      return;
    }
    if (!this.backend.isRunning()) {
      // 버리지 않고 담아 둔다. 잠금이 풀리는 순간 이어서 낸다.
      this.pendingVoice = track;
      return;
    }

    this.voice?.stop();
    this.voice = null;

    const slot = createVoiceSlot();
    const handle = await this.playOneShot(track, 'voice', () => {
      slot.ended = true;
      if (slot.handle && this.voice === slot.handle) {
        this.voice = null;
      }
    });
    if (!handle) {
      return;
    }

    slot.handle = handle;
    if (this.destroyed || slot.ended) {
      handle.stop();
      return;
    }

    this.voice = handle;
  }

  /** 효과음을 재생한다. 동시 발음이 한도를 넘으면 가장 오래된 것부터 끊는다. */
  public async playSfx(track: SoundTrackSource<SoundTrack>): Promise<void> {
    if (this.destroyed) {
      return;
    }
    if (!this.backend.isRunning()) {
      // 담아 두지 않는다. 늦게 터지면 화면과 어긋난 자리에서 난다.
      this.onError?.(`sfx 건너뜀: ${track.id} (소리 잠금이 아직 풀리지 않았다)`, null);
      return;
    }

    while (this.sfx.length >= this.sfxPolyphony) {
      this.sfx.shift()?.stop();
    }

    const slot = createVoiceSlot();
    const handle = await this.playOneShot(track, 'sfx', () => {
      slot.ended = true;
      if (slot.handle) {
        this.removeSfx(slot.handle);
      }
    });
    if (!handle) {
      return;
    }

    slot.handle = handle;
    // 받아 오는 사이에 소리가 끝났거나 destroy됐으면 목록에 넣지 않는다.
    // 넣어 두면 죽은 손잡이가 동시 발음 자리를 영영 차지한다.
    if (this.destroyed || slot.ended) {
      handle.stop();
      return;
    }

    this.sfx.push(handle);
  }

  /**
   * 자동재생 잠금을 푼다. 첫 포인터·키 입력에서 부른다.
   * 풀리면 잠긴 동안 들어온 요청을 이어서 낸다. 풀리지 않아도 던지지 않는다.
   *
   * **BGM은 `await` 앞에서, 대사는 뒤에서 시작한다.** 이유가 서로 다르다.
   * BGM은 media element라 `play()`가 제스처를 요구하는데, iOS Safari는 `await` 뒤로
   * 밀린 호출을 제스처로 쳐주지 않는다(Chrome은 느슨해 이 차이가 안 드러난다).
   * 대사는 BufferSource라 제스처를 따지지 않으므로 뒤에서 내도 된다. 오히려 뒤여야
   * 한다. `pointerdown`이 이 함수를 부른 직후 같은 틱의 `click`이 대사를 요청하는데,
   * 앞에서 비우면 그 요청이 아직 담기기 전이라 놓친다.
   */
  public async unlock(): Promise<boolean> {
    if (this.destroyed) {
      return false;
    }

    const resuming = this.backend.resume();

    /*
     * 담아 둔 것을 아직 비우지 않는다.
     *
     * `resume()`이 끝내 성사되지 않으면 아래 `await`가 영영 돌아오지 않는다. 여기서
     * 비워 두면 그 요청을 잃고, 다음 제스처가 다시 걸 것도 없어진다. 성사를 확인한
     * 뒤에 비운다. 그 사이 이 함수가 다시 불려도 `this.bgm`이 겹쳐 걸기를 막는다.
     */
    const pending = this.pendingBgm;
    if (pending && !this.bgm) {
      this.startBgm(pending);
    }

    const resumed = await resuming;
    if (!resumed || this.destroyed) {
      // 방금 건 곡을 접는다. 담아 둔 요청은 그대로 있어 다음 입력에서 다시 건다.
      if (pending) {
        this.stopBgm();
      }
      return false;
    }

    this.pendingBgm = null;
    const pendingVoice = this.pendingVoice;
    this.pendingVoice = null;
    if (pendingVoice) {
      void this.playVoice(pendingVoice);
    }

    return true;
  }

  public destroy(): void {
    this.destroyed = true;
    this.pendingBgm = null;
    this.pendingVoice = null;
    this.stopBgm();
    this.voice?.stop();
    this.voice = null;
    for (const handle of this.sfx.splice(0)) {
      handle.stop();
    }
    this.backend.destroy();
  }

  /** 새 곡을 0에서 올리고, 울리던 곡은 0으로 내리며 겹친다. */
  private startBgm(track: SoundTrackSource<BgmTrack>): void {
    const previous = this.bgm;
    const gain = decibelToGain(track.gainDb);
    const started: { handle?: SoundVoiceHandle } = {};
    const handle = this.backend.playStream({
      url: track.url,
      channel: 'bgm',
      // 울리던 곡이 없으면 겹칠 것도 없으니 곧바로 제 크기로 시작한다.
      gain: previous ? 0 : gain,
      loop: true,
      onError: (error) => {
        if (started.handle && this.bgm?.handle === started.handle) {
          this.bgm = null;
        }
        this.onError?.(`bgm 재생 실패: ${track.id}`, error);
      },
    });
    started.handle = handle;

    if (previous) {
      handle.setGain(gain, this.crossfadeSeconds);
      previous.handle.setGain(0, this.crossfadeSeconds);
      // 페이드가 끝나기 전에 끊으면 소리가 잘린다. 다 내려간 뒤에 정리한다.
      setTimeout(() => previous.handle.stop(), this.crossfadeSeconds * 1000);
    }

    this.bgm = { trackId: track.id, handle, gain };
  }

  private stopBgm(): void {
    this.bgm?.handle.stop();
    this.bgm = null;
  }

  private async playOneShot(
    track: SoundTrackSource<SoundTrack>,
    channel: VolumeChannel,
    onEnded: () => void,
  ): Promise<SoundVoiceHandle | null> {
    try {
      return await this.backend.playBuffer({
        url: track.url,
        channel,
        gain: decibelToGain(track.gainDb),
        onEnded,
      });
    } catch (error: unknown) {
      /*
       * 소리 하나를 못 받았다고 게임을 멈추지 않는다. 다만 조용히 삼키지도 않는다.
       * 받기 실패인지 디코드 실패인지가 여기서만 드러난다. 삼키면 "왜 안 나지"만 남는다.
       */
      this.onError?.(`${channel} 재생 실패: ${track.id}`, error);
      return null;
    }
  }

  private removeSfx(handle: SoundVoiceHandle | null): void {
    if (!handle) {
      return;
    }

    const index = this.sfx.indexOf(handle);
    if (index >= 0) {
      this.sfx.splice(index, 1);
    }
  }

  private applyChannelGains(): void {
    for (const channel of VOLUME_CHANNELS) {
      this.backend.setChannelGain(channel, resolveChannelGain(this.volume, channel));
    }
  }
}
