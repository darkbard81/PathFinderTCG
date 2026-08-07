import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeId } from './runtime-id';

describe('createRuntimeId', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
    });

    expect(createRuntimeId()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0x11);
        return bytes;
      },
    });

    expect(createRuntimeId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('still returns an id when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    expect(createRuntimeId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('restores the original crypto object after tests', () => {
    expect(originalCrypto).toBeDefined();
  });
});
