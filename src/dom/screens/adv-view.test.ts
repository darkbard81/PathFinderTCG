import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdvView, type AdvViewModel } from './adv-view';

type FakeEvent = {
  propagationStopped: boolean;
  stopPropagation: () => void;
};

type FakeKeyEvent = FakeEvent & {
  key: string;
  target: FakeElement;
  defaultPrevented: boolean;
  preventDefault: () => void;
};

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  parent: FakeElement | null = null;
  className = '';
  textContent = '';
  private source = '';
  srcAssignments = 0;
  alt = '';
  type = '';
  disabled = false;
  hidden = false;
  draggable = true;
  appendCalls = 0;
  removeChildCalls = 0;

  readonly classList = {
    toggle: (token: string, force: boolean): void => {
      const classes = new Set(this.className.split(/\s+/u).filter(Boolean));
      if (force) {
        classes.add(token);
      } else {
        classes.delete(token);
      }
      this.className = [...classes].join(' ');
    },
  };

  constructor(readonly tagName: string) {}

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    this.srcAssignments += 1;
  }

  append(...children: FakeElement[]): void {
    this.appendCalls += 1;
    children.forEach((child) => {
      child.parent = this;
    });
    this.children.push(...children);
  }

  removeChild(child: FakeElement): void {
    this.removeChildCalls += 1;
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parent = null;
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'src') {
      this.source = '';
    }
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click(): void {
    this.dispatch('click', this.createEvent());
  }

  keydown(key: string, target: FakeElement = this): FakeKeyEvent {
    const event: FakeKeyEvent = {
      ...this.createEvent(),
      key,
      target,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    this.dispatch('keydown', event);
    return event;
  }

  private createEvent(): FakeEvent {
    return {
      propagationStopped: false,
      stopPropagation() {
        this.propagationStopped = true;
      },
    };
  }

  private dispatch(type: string, event: FakeEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
    if (!event.propagationStopped) {
      this.parent?.dispatch(type, event);
    }
  }
}

const readyModel: AdvViewModel = {
  state: 'ready',
  standings: [],
  speaker: '우쭈링',
  text: '대사',
  faceImageUrl: '/face.webp',
  progressText: '1 / 2',
  errorMessage: '',
  completed: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAdvView', () => {
  it('건너뛰기와 재시도만 대화창과 분리된 액션 행에 둔다', () => {
    installFakeDocument();
    const view = createAdvView({ onNext: vi.fn(), onSkip: vi.fn(), onRetry: vi.fn() });
    const root = view.element as unknown as FakeElement;
    const interfaceLayer = findByClass(root, 'pf-adv__interface');
    const dialog = findByClass(root, 'pf-adv__dialog');
    const actions = findByClass(root, 'pf-adv__actions');
    const buttons = findAllByClass(actions, 'pf-adv__button');

    expect(interfaceLayer.children).toEqual([actions, dialog]);
    expect(dialog.children).not.toContain(actions);
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.dataset.kind)).toEqual(['skip', 'retry']);
    expect(buttons.map((button) => button.textContent)).not.toContain('다음');
    expect(buttons.every((button) => button.className.includes('pf-btn-plain'))).toBe(true);
    expect(buttons.every((button) => !button.className.includes('pf-btn9'))).toBe(true);
  });

  it('버튼이 아닌 화면 클릭만 다음으로 진행하고 액션 버튼은 전파하지 않는다', () => {
    installFakeDocument();
    const onNext = vi.fn();
    const onSkip = vi.fn();
    const onRetry = vi.fn();
    const view = createAdvView({ onNext, onSkip, onRetry });
    const root = view.element as unknown as FakeElement;
    const actions = findByClass(root, 'pf-adv__actions');
    const skip = findByKind(actions, 'skip');
    const retry = findByKind(actions, 'retry');

    root.click();
    skip.click();
    retry.click();

    expect(onNext).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('키보드로도 대사를 넘길 수 있게 루트에 포커스와 Enter·Space를 둔다', () => {
    installFakeDocument();
    const onNext = vi.fn();
    const view = createAdvView({ onNext, onSkip: vi.fn(), onRetry: vi.fn() });
    const root = view.element as unknown as FakeElement;

    expect(root.attributes.get('tabindex')).toBe('0');

    expect(root.keydown('Enter').defaultPrevented).toBe(true);
    expect(root.keydown(' ').defaultPrevented).toBe(true);
    expect(onNext).toHaveBeenCalledTimes(2);

    expect(root.keydown('a').defaultPrevented).toBe(false);
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it('액션 버튼 위에서 누른 Enter는 루트의 다음 진행으로 새지 않는다', () => {
    installFakeDocument();
    const onNext = vi.fn();
    const view = createAdvView({ onNext, onSkip: vi.fn(), onRetry: vi.fn() });
    const root = view.element as unknown as FakeElement;
    const skip = findByKind(findByClass(root, 'pf-adv__actions'), 'skip');

    root.keydown('Enter', skip);

    expect(onNext).not.toHaveBeenCalled();
  });

  it('화자와 face가 없는 대사에서도 고정 슬롯을 제거하지 않는다', () => {
    installFakeDocument();
    const view = createAdvView({ onNext: vi.fn(), onSkip: vi.fn(), onRetry: vi.fn() });
    const root = view.element as unknown as FakeElement;
    const speaker = findByClass(root, 'pf-adv__speaker');
    const face = findByClass(root, 'pf-adv__face');

    view.render(readyModel);
    expect(speaker.className).not.toContain('is-hidden');
    expect(face.className).not.toContain('is-hidden');
    expect(face.src).toBe('/face.webp');

    view.render({ ...readyModel, speaker: null, faceImageUrl: null });
    expect(speaker.className).toContain('is-hidden');
    expect(face.className).toContain('is-hidden');
    expect(speaker.hidden).toBe(false);
    expect(face.hidden).toBe(false);
    expect(face.src).toBe('');
  });

  it('같은 스탠딩과 face는 대사만 바뀌어도 노드와 src를 다시 그리지 않는다', () => {
    installFakeDocument();
    const view = createAdvView({ onNext: vi.fn(), onSkip: vi.fn(), onRetry: vi.fn() });
    const root = view.element as unknown as FakeElement;
    const standings = findByClass(root, 'pf-adv__standings');
    const face = findByClass(root, 'pf-adv__face');
    const model: AdvViewModel = {
      ...readyModel,
      standings: [{ position: 'center', imageUrl: '/standing.webp' }],
    };

    view.render(model);
    const standing = standings.children[0];
    const faceSource = face.src;
    const faceSrcAssignments = face.srcAssignments;

    view.render({ ...model, text: '다음 대사', progressText: '2 / 2' });

    expect(standings.children[0]).toBe(standing);
    expect(standings.appendCalls).toBe(1);
    expect(standings.removeChildCalls).toBe(0);
    expect(face.src).toBe(faceSource);
    expect(face.srcAssignments).toBe(faceSrcAssignments);
  });

  it('스탠딩 변경분이 있을 때 기존 위치의 이미지 노드를 재사용하고 빈 배열로 지운다', () => {
    installFakeDocument();
    const view = createAdvView({ onNext: vi.fn(), onSkip: vi.fn(), onRetry: vi.fn() });
    const root = view.element as unknown as FakeElement;
    const standings = findByClass(root, 'pf-adv__standings');

    view.render({
      ...readyModel,
      standings: [{ position: 'center', imageUrl: '/standing-a.webp' }],
    });
    const standing = standings.children[0];

    view.render({
      ...readyModel,
      standings: [{ position: 'center', imageUrl: '/standing-b.webp' }],
    });
    expect(standings.children[0]).toBe(standing);
    expect(standing?.src).toBe('/standing-b.webp');

    view.render({ ...readyModel, standings: [] });
    expect(standings.children).toHaveLength(0);
    expect(standings.removeChildCalls).toBe(1);
  });
});

function installFakeDocument(): void {
  vi.stubGlobal('document', {
    createElement: (tagName: string) => new FakeElement(tagName),
  });
}

function findByClass(root: FakeElement, className: string): FakeElement {
  const found = findAllByClass(root, className)[0];
  if (!found) {
    throw new Error(`Missing .${className}`);
  }
  return found;
}

function findAllByClass(root: FakeElement, className: string): FakeElement[] {
  const matches = root.className.split(/\s+/u).includes(className) ? [root] : [];
  return [...matches, ...root.children.flatMap((child) => findAllByClass(child, className))];
}

function findByKind(root: FakeElement, kind: string): FakeElement {
  const found = [root, ...root.children].find((element) => element.dataset.kind === kind);
  if (!found) {
    throw new Error(`Missing data-kind=${kind}`);
  }
  return found;
}
