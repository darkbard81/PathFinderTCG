import { describe, expect, it } from 'vitest';
import {
  CARD_TEXT_TOOL_ACCOUNT_ID,
  createDefaultLicenseLinks,
  formatMainMenuLoadSummary,
} from './main-menu-view';

describe('formatMainMenuLoadSummary', () => {
  it('omits skip text when every asset loaded', () => {
    expect(formatMainMenuLoadSummary(203, 0)).toBe('Loaded 203 assets');
  });

  it('includes skip count when some assets failed', () => {
    expect(formatMainMenuLoadSummary(200, 3)).toBe('Loaded 200 assets, skipped 3');
  });
});

describe('createDefaultLicenseLinks', () => {
  it('lists coding tools, Grok Build media, PixiJS engine, and runtime licenses', () => {
    const links = createDefaultLicenseLinks();
    const labels = links.map((link) => link.label);

    expect(labels).toEqual([
      'ORC License',
      'OpenAI Terms',
      'Claude Code Terms',
      'Suno Terms',
      'xAI Terms',
      'PixiJS License',
      'Node.js License',
    ]);
    expect(links.find((link) => link.label === 'xAI Terms')?.purpose).toBe(
      'Grok Build / 영상 에셋',
    );
    expect(links.find((link) => link.label === 'Claude Code Terms')?.url).toContain(
      'code.claude.com',
    );
    expect(links.find((link) => link.label === 'PixiJS License')?.purpose).toBe('게임 엔진');
  });
});

describe('CARD_TEXT_TOOL_ACCOUNT_ID', () => {
  it('matches the original gated account', () => {
    expect(CARD_TEXT_TOOL_ACCOUNT_ID).toBe('darkbard81');
  });
});
