import type {
  PlayBufferOptions,
  PlayStreamOptions,
  SoundBackend,
  SoundVoiceHandle,
} from './sound-backend';
import { VOLUME_CHANNELS, type VolumeChannel } from './volume';

/**
 * "즉시" 반영도 이만큼은 미끄러뜨린다.
 * 값을 대입하면 파형이 계단으로 끊겨 딸깍 소리가 난다. 귀에는 즉시로 들린다.
 */
const INSTANT_RAMP_SECONDS = 0.02;

/**
 * WebAudio로 소리를 내는 구현이다. 정책은 하나도 들고 있지 않다.
 *
 * 게인 그래프는 이렇게 엮인다. 화면에 그리는 것은 하나도 없다.
 *
 *   BufferSource(bgm)   ─→ bgmGain   ─┐
 *   BufferSource(sfx)   ─→ sfxGain   ─┼─→ masterGain ─→ destination
 *   BufferSource(voice) ─→ voiceGain ─┘
 *
 * 실기 iPad Safari에서 voice 버퍼는 나지만 MediaElement BGM이 나지 않아, 원인을 가르는
 * 동안 BGM도 `decodeAudioData`로 임시 재생한다. 긴 곡 전체가 PCM 메모리에 올라가고 시작도
 * 다운로드·디코드를 기다리므로 영구 설계로 두지 않는다.
 *
 * 테스트는 노드 연결과 예약 호출까지만 대역으로 확인한다. 실제 코덱과 기기 출력은 실기
 * 브라우저에서 확인해야 한다.
 */
export class WebAudioBackend implements SoundBackend {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly channels: Map<VolumeChannel, GainNode> = new Map();
  /** 디코드 결과를 재사용한다. 같은 소리를 쏠 때마다 다시 풀면 낭비다. */
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  /** 다운로드 중인 것을 포함해 아직 멈추지 않은 BGM 손잡이다. */
  private readonly activeStreams = new Set<SoundVoiceHandle>();
  private destroyed = false;

  public constructor(context: AudioContext = new AudioContext()) {
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);

    for (const channel of VOLUME_CHANNELS) {
      if (channel === 'master') {
        this.channels.set(channel, this.master);
        continue;
      }

      const gain = context.createGain();
      gain.connect(this.master);
      this.channels.set(channel, gain);
    }
  }

  public async resume(): Promise<boolean> {
    if (this.destroyed) {
      return false;
    }

    try {
      await this.context.resume();
    } catch {
      return false;
    }

    return this.context.state === 'running';
  }

  public isRunning(): boolean {
    return !this.destroyed && this.context.state === 'running';
  }

  public setChannelGain(channel: VolumeChannel, gain: number): void {
    const node = this.channels.get(channel);
    if (!node) {
      return;
    }

    this.rampGain(node, gain);
  }

  public playStream(options: PlayStreamOptions): SoundVoiceHandle {
    const gain = this.context.createGain();
    gain.gain.value = options.gain;
    gain.connect(this.channelNode(options.channel));

    let source: AudioBufferSourceNode | null = null;
    let stopped = false;
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      source?.disconnect();
      gain.disconnect();
      this.activeStreams.delete(handle);
    };

    const handle: SoundVoiceHandle = {
      setGain: (value, rampSeconds) => {
        this.rampGain(gain, value, rampSeconds);
      },
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        try {
          source?.stop();
        } catch {
          // BufferSource는 이미 자연 종료됐을 수 있다. 아래 정리는 그대로 한다.
        }
        cleanup();
      },
    };

    this.activeStreams.add(handle);
    void this.loadBuffer(options.url)
      .then((buffer) => {
        if (stopped || this.destroyed) {
          return;
        }

        source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = options.loop;
        source.connect(gain);
        source.onended = () => {
          stopped = true;
          cleanup();
        };
        source.start();
      })
      .catch((error: unknown) => {
        if (!stopped && !this.destroyed) {
          options.onError?.(error);
        }
        handle.stop();
      });

    return handle;
  }

  public async playBuffer(options: PlayBufferOptions): Promise<SoundVoiceHandle> {
    const buffer = await this.loadBuffer(options.url);
    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gain = this.context.createGain();
    gain.gain.value = options.gain;
    source.connect(gain);
    gain.connect(this.channelNode(options.channel));

    let stopped = false;
    const cleanup = (): void => {
      source.disconnect();
      gain.disconnect();
    };
    source.onended = () => {
      cleanup();
      options.onEnded?.();
    };
    source.start();

    return {
      setGain: (value, rampSeconds) => {
        this.rampGain(gain, value, rampSeconds);
      },
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        // BufferSource는 일회용이다. 이미 끝났으면 stop이 던진다.
        try {
          source.stop();
        } catch {
          cleanup();
        }
      },
    };
  }

  public destroy(): void {
    this.destroyed = true;
    this.buffers.clear();
    for (const handle of [...this.activeStreams]) {
      handle.stop();
    }
    this.activeStreams.clear();
    void this.context.close().catch(() => undefined);
  }

  private channelNode(channel: VolumeChannel): GainNode {
    return this.channels.get(channel) ?? this.master;
  }

  /**
   * 게인을 옮긴다. 오디오 스레드에서 보간되므로 메인 스레드가 밀려도 매끄럽다.
   * 직접 값을 대입하거나 rAF로 조금씩 올리면 계단으로 튄다.
   *
   * **`setTargetAtTime`을 쓰지 않는다.** 실기 iPad WebKit에서 이미 울리는 채널의
   * 볼륨을 바꿔도 적용되지 않았다. 끝값에 정확히 도달하는 짧은 선형 램프는 같은
   * 기기에서도 반영된다.
   */
  private rampGain(node: GainNode, value: number, rampSeconds?: number): void {
    const now = this.context.currentTime;
    const seconds = Math.max(rampSeconds ?? 0, INSTANT_RAMP_SECONDS);

    // 진행 중인 자동화의 현재 값을 유지하면서 이후 예약만 걷어낸다.
    node.gain.cancelAndHoldAtTime(now);
    node.gain.linearRampToValueAtTime(value, now + seconds);
  }

  private loadBuffer(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) {
      return cached;
    }

    const pending = (async (): Promise<AudioBuffer> => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load sound: ${response.status} ${response.statusText}`);
      }

      // decodeAudioData는 넘긴 ArrayBuffer를 detach한다. 다시 쓰지 않는다.
      return this.context.decodeAudioData(await response.arrayBuffer());
    })();

    // 실패한 요청을 캐시에 남기면 다시 시도할 수 없다.
    this.buffers.set(
      url,
      pending.catch((error: unknown) => {
        this.buffers.delete(url);
        throw error;
      }),
    );

    return this.buffers.get(url) ?? pending;
  }
}
