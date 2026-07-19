import type { PF2eScrollablePanel } from '../components/PF2eScrollablePanel';

export interface PF2eScrollablePanelControllerConfig {
  readonly onScroll?: (progress: number) => void;
}

interface ScrollEventSource {
  on(eventName: string, listener: () => void): unknown;
  off(eventName: string, listener: () => void): unknown;
}

export class PF2eScrollablePanelController {
  private readonly panel: PF2eScrollablePanel;
  private readonly onScroll?: (progress: number) => void;
  private readonly mouseWheelScroller?: ScrollEventSource;

  constructor(panel: PF2eScrollablePanel, config: PF2eScrollablePanelControllerConfig = {}) {
    this.panel = panel;
    this.onScroll = config.onScroll;
    this.panel.on('scroll', this.handleScroll);

    const mouseWheelScroller: unknown = this.panel.getElement('mouseWheelScroller');
    if (isScrollEventSource(mouseWheelScroller)) {
      this.mouseWheelScroller = mouseWheelScroller;
      this.mouseWheelScroller.on('scroll', this.handleScroll);
    }
  }

  setProgress(progress: number): this {
    this.panel.setT(progress, true);
    this.notifyScroll();
    return this;
  }

  destroy(): void {
    this.panel.off('scroll', this.handleScroll);
    this.mouseWheelScroller?.off('scroll', this.handleScroll);
  }

  private readonly handleScroll = (): void => {
    this.notifyScroll();
  };

  private notifyScroll(): void {
    this.onScroll?.(this.panel.t);
  }
}

function isScrollEventSource(value: unknown): value is ScrollEventSource {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'on' in value &&
    typeof value.on === 'function' &&
    'off' in value &&
    typeof value.off === 'function'
  );
}
