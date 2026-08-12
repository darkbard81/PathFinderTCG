import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from './web-audio-backend';

type FakeGainNode = {
  gain: {
    value: number;
    cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    setTargetAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

type FakeBufferSource = {
  buffer: AudioBuffer | null;
  loop: boolean;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type FakeMediaElementSource = {
  element: FakeAudioElement;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

type FakeAudioElement = {
  src: string;
  loop: boolean;
  preload: string;
  error: MediaError | null;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatch: (type: string) => void;
};

function installFakeAudio(playImpl: () => Promise<void> = () => Promise.resolve()) {
  const elements: FakeAudioElement[] = [];

  class FakeAudio {
    public loop = false;
    public preload = '';
    public error: MediaError | null = null;
    public readonly play = vi.fn(playImpl);
    public readonly pause = vi.fn();
    public readonly load = vi.fn();
    public readonly setAttribute = vi.fn();
    private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

    public readonly removeAttribute = vi.fn((name: string) => {
      if (name === 'src') {
        this.src = '';
      }
    });

    public readonly addEventListener = vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      },
    );

    public readonly removeEventListener = vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        this.listeners.get(type)?.delete(listener);
      },
    );

    public constructor(public src: string) {
      elements.push(this);
    }

    public dispatch(type: string): void {
      const event = { type, target: this } as unknown as Event;
      for (const listener of this.listeners.get(type) ?? []) {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }
  }

  vi.stubGlobal('Audio', FakeAudio);
  return elements;
}

function createFakeAudioContext() {
  const gains: FakeGainNode[] = [];
  const bufferSources: FakeBufferSource[] = [];
  const mediaElementSources: FakeMediaElementSource[] = [];
  const decodedBuffer = {} as AudioBuffer;
  const context = {
    currentTime: 12.5,
    destination: {},
    state: 'running',
    createGain: () => {
      const gain: FakeGainNode = {
        gain: {
          value: 1,
          cancelAndHoldAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          setTargetAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    },
    createBufferSource: () => {
      const source: FakeBufferSource = {
        buffer: null,
        loop: false,
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      bufferSources.push(source);
      return source;
    },
    createMediaElementSource: vi.fn((element: FakeAudioElement) => {
      const source: FakeMediaElementSource = {
        element,
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      mediaElementSources.push(source);
      return source;
    }),
    decodeAudioData: vi.fn(async () => decodedBuffer),
    close: vi.fn(async () => undefined),
  };

  return { context, gains, bufferSources, mediaElementSources, decodedBuffer };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebAudioBackend 채널 게인', () => {
  it('현재 자동화 값을 보존한 뒤 짧은 선형 램프로 옮긴다', () => {
    const fake = createFakeAudioContext();
    const backend = new WebAudioBackend(fake.context as unknown as AudioContext);

    backend.setChannelGain('bgm', 0.25);

    const bgm = fake.gains[1];
    expect(bgm?.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(12.5);
    expect(bgm?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, 12.52);
    expect(bgm?.gain.setTargetAtTime).not.toHaveBeenCalled();
  });
});

describe('WebAudioBackend BGM media element 경로', () => {
  it('MP3를 HTMLAudioElement에서 재생해 곡 게인과 BGM 채널에 연결한다', () => {
    const elements = installFakeAudio();
    const fake = createFakeAudioContext();
    const backend = new WebAudioBackend(fake.context as unknown as AudioContext);

    const handle = backend.playStream({
      url: '/tcg/sound/bgm/main.mp3',
      channel: 'bgm',
      gain: 0.5,
      loop: true,
    });

    const element = elements[0];
    const source = fake.mediaElementSources[0];
    const trackGain = fake.gains[4];
    expect(element?.src).toBe('/tcg/sound/bgm/main.mp3');
    expect(element?.loop).toBe(true);
    expect(element?.preload).toBe('auto');
    expect(element?.setAttribute).toHaveBeenCalledWith('playsinline', '');
    expect(element?.play).toHaveBeenCalledOnce();
    expect(source?.element).toBe(element);
    expect(source?.connect).toHaveBeenCalledWith(trackGain);
    expect(trackGain?.gain.value).toBe(0.5);
    expect(trackGain?.connect).toHaveBeenCalledWith(fake.gains[1]);

    handle.setGain(0.25, 1);
    expect(trackGain?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, 13.5);

    handle.stop();
    expect(element?.pause).toHaveBeenCalledOnce();
    expect(source?.disconnect).toHaveBeenCalledOnce();
    expect(trackGain?.disconnect).toHaveBeenCalledOnce();
    expect(element?.removeAttribute).toHaveBeenCalledWith('src');
    expect(element?.load).toHaveBeenCalledOnce();
  });

  it('media element의 비동기 play 실패를 한 번 알리고 노드를 정리한다', async () => {
    const error = new Error('play 실패');
    const elements = installFakeAudio(() => Promise.reject(error));
    const fake = createFakeAudioContext();
    const backend = new WebAudioBackend(fake.context as unknown as AudioContext);
    const onError = vi.fn();

    backend.playStream({
      url: '/tcg/sound/bgm/main.mp3',
      channel: 'bgm',
      gain: 0.5,
      loop: true,
      onError,
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(elements[0]?.pause).toHaveBeenCalledOnce();
    expect(fake.mediaElementSources[0]?.disconnect).toHaveBeenCalledOnce();
    expect(fake.gains[4]?.disconnect).toHaveBeenCalledOnce();

    elements[0]?.dispatch('error');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('media error를 알리고 재생 중인 element를 정리한다', () => {
    const elements = installFakeAudio();
    const fake = createFakeAudioContext();
    const backend = new WebAudioBackend(fake.context as unknown as AudioContext);
    const onError = vi.fn();
    const mediaError = new Error('로드 실패') as unknown as MediaError;

    backend.playStream({
      url: '/tcg/sound/bgm/main.mp3',
      channel: 'bgm',
      gain: 1,
      loop: true,
      onError,
    });
    const element = elements[0];
    if (element) {
      element.error = mediaError;
      element.dispatch('error');
    }

    expect(onError).toHaveBeenCalledWith(mediaError);
    expect(element?.pause).toHaveBeenCalledOnce();
    expect(fake.mediaElementSources[0]?.disconnect).toHaveBeenCalledOnce();
  });
});
