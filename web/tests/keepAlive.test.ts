import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const audio = {
  loop: false,
  play: vi.fn<() => Promise<void>>(),
  pause: vi.fn(),
};
const AudioMock = vi.fn(function () {
  return audio;
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  audio.loop = false;
  audio.play.mockResolvedValue();
  vi.stubGlobal('Audio', AudioMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('keep-alive audio', () => {
  it('does not construct Audio on import or an unmatched release', async () => {
    const { releaseKeepAlive } = await import('../src/util');
    releaseKeepAlive();
    expect(AudioMock).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it('constructs and loops audio on the first request, then reuses it', async () => {
    const { requestKeepAlive, releaseKeepAlive } = await import('../src/util');
    requestKeepAlive();
    expect(AudioMock).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^data:audio\/mp3;base64,/),
    );
    expect(audio.loop).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
    releaseKeepAlive();
    requestKeepAlive();
    expect(AudioMock).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledTimes(2);
    releaseKeepAlive();
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });

  it('pauses only after the final release and ignores extra releases', async () => {
    const { requestKeepAlive, releaseKeepAlive } = await import('../src/util');
    releaseKeepAlive();
    requestKeepAlive();
    requestKeepAlive();
    expect(audio.play).toHaveBeenCalledTimes(2);
    releaseKeepAlive();
    expect(audio.pause).not.toHaveBeenCalled();
    releaseKeepAlive();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    releaseKeepAlive();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    requestKeepAlive();
    releaseKeepAlive();
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });

  it('continues to ignore rejected playback promises', async () => {
    audio.play.mockRejectedValue(new Error('playback blocked'));
    const { requestKeepAlive, releaseKeepAlive } = await import('../src/util');
    expect(requestKeepAlive).not.toThrow();
    await Promise.resolve();
    releaseKeepAlive();
    expect(audio.pause).toHaveBeenCalledTimes(1);
  });
});
