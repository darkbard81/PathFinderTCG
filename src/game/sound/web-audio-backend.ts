import type {
  PlayBufferOptions,
  PlayStreamOptions,
  SoundBackend,
  SoundVoiceHandle,
} from './sound-backend';
import { VOLUME_CHANNELS, type VolumeChannel } from './volume';

/**
 * WebAudio로 소리를 내는 구현이다. 정책은 하나도 들고 있지 않다.
 *
 * 게인 그래프는 이렇게 엮인다. 화면에 그리는 것은 하나도 없다.
 *
 *   MediaElementSource(bgm) ─→ bgmGain   ─┐
 *   BufferSource(sfx)       ─→ sfxGain   ─┼─→ masterGain ─→ destination
 *   BufferSource(voice)     ─→ voiceGain ─┘
 *
 * BGM만 MediaElement로 흘려 받는다. 길이와 무관하게 메모리가 일정하다.
 * 나머지는 미리 디코드해 두어 지연 없이 나가고 예약 재생을 쓸 수 있다.
 *
 * 브라우저 API를 직접 만지므로 테스트가 닿지 않는다. 판단이 들어가는 코드를 두지 않고
 * `SoundPlayer`가 시키는 대로만 한다.
 */
export class WebAudioBackend implements SoundBackend {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly channels: Map<VolumeChannel, GainNode> = new Map();
  /** 디코드 결과를 재사용한다. 같은 소리를 쏠 때마다 다시 풀면 낭비다. */
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  /**
   * BGM에 쓴 엘리먼트와 소스 노드다.
   * 한 엘리먼트에 `createMediaElementSource`는 한 번뿐이라 짝을 지어 재사용한다.
   */
  private readonly streamSources = new Map<HTMLAudioElement, MediaElementAudioSourceNode>();
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

    // 값을 바로 대입하면 계단으로 튀어 지퍼 노이즈가 난다. 짧게 미끄러뜨린다.
    node.gain.setTargetAtTime(gain, this.context.currentTime, 0.01);
  }

  public playStream(options: PlayStreamOptions): SoundVoiceHandle {
    const element = new Audio(options.url);
    element.loop = options.loop;
    element.preload = 'auto';
    /*
     * iOS는 소리를 "재생 중인 미디어"로 인정받아야 무음 스위치를 켠 상태에서도 난다.
     * 인라인 재생을 명시하지 않으면 전체 화면 재생기로 넘기려 든다.
     *
     * crossOrigin은 두지 않는다. 자산이 같은 출처라 얻을 것이 없고, 켜면 서버가
     * 내주지 않는 CORS 헤더를 요구해 WebKit에서 실패할 여지만 는다.
     */
    element.setAttribute('playsinline', '');

    const source = this.context.createMediaElementSource(element);
    this.streamSources.set(element, source);

    const gain = this.context.createGain();
    gain.gain.value = options.gain;
    source.connect(gain);
    gain.connect(this.channelNode(options.channel));

    // 제스처 안에서 불러도 거절될 수 있다. 소리가 없다고 게임을 멈추지 않는다.
    void element.play().catch(() => undefined);

    let stopped = false;
    return {
      setGain: (value, rampSeconds) => {
        this.rampGain(gain, value, rampSeconds);
      },
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        element.pause();
        gain.disconnect();
        source.disconnect();
        this.streamSources.delete(element);
        element.src = '';
      },
    };
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
    for (const [element, source] of this.streamSources) {
      source.disconnect();
      element.pause();
      element.src = '';
    }
    this.streamSources.clear();
    void this.context.close().catch(() => undefined);
  }

  private channelNode(channel: VolumeChannel): GainNode {
    return this.channels.get(channel) ?? this.master;
  }

  /**
   * 게인을 옮긴다. 오디오 스레드에서 보간되므로 메인 스레드가 밀려도 매끄럽다.
   * 직접 값을 대입하거나 rAF로 조금씩 올리면 계단으로 튄다.
   */
  private rampGain(node: GainNode, value: number, rampSeconds?: number): void {
    const now = this.context.currentTime;
    if (!rampSeconds || rampSeconds <= 0) {
      node.gain.setTargetAtTime(value, now, 0.01);
      return;
    }

    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(value, now + rampSeconds);
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
