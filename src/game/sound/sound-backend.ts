import type { VolumeChannel } from './volume';

/**
 * 소리를 실제로 내는 쪽의 경계다.
 *
 * `SequenceRunner`가 `playVideo`를 주입받는 것과 같은 이유로 갈라 둔다.
 * 무엇을 언제 트는가라는 정책은 `SoundPlayer`가, 노드를 만들고 스피커로 보내는 일은
 * 이쪽 구현이 맡는다. vitest가 `environment: 'node'`라 WebAudio가 없으므로,
 * 이 경계가 있어야 정책에 테스트가 닿는다.
 */

/** 재생 중인 소리 하나를 다루는 손잡이다. */
export type SoundVoiceHandle = {
  /**
   * 이 소리만의 게인을 정한다. 채널 게인과 곱해진다.
   * `rampSeconds`를 주면 그 시간에 걸쳐 옮긴다. 페이드에 쓴다.
   */
  setGain: (gain: number, rampSeconds?: number) => void;
  /** 즉시 멈춘다. 여러 번 불러도 안전해야 한다. */
  stop: () => void;
};

export type PlayStreamOptions = {
  url: string;
  channel: VolumeChannel;
  /** 트랙 보정 게인을 반영한 시작 게인이다. */
  gain: number;
  loop: boolean;
};

export type PlayBufferOptions = {
  url: string;
  channel: VolumeChannel;
  gain: number;
  /** 자연 종료를 알린다. 동시 발음 수를 세는 쪽이 구독한다. */
  onEnded?: () => void;
};

export type SoundBackend = {
  /**
   * 자동재생 잠금을 푼다. 사용자 제스처 안에서 불러야 한다.
   * 풀리지 않으면 false를 돌려준다. 던지지 않는다.
   */
  resume: () => Promise<boolean>;
  /** 지금 소리를 낼 수 있는 상태인지다. */
  isRunning: () => boolean;
  /** 채널 게인을 정한다. 0~1 선형값이다. */
  setChannelGain: (channel: VolumeChannel, gain: number) => void;
  /** 흘려 받아 재생한다. 길이와 무관하게 메모리가 일정해야 하는 BGM에 쓴다. */
  playStream: (options: PlayStreamOptions) => SoundVoiceHandle;
  /** 미리 디코드해 재생한다. 지연 없이 나가야 하는 짧은 소리에 쓴다. */
  playBuffer: (options: PlayBufferOptions) => Promise<SoundVoiceHandle>;
  destroy: () => void;
};
