import { afterEach, describe, expect, test, vi } from 'vitest';
import { ProxyManager } from '@/services/proxy/manager.ts';
import { ProxyStore } from '@/services/proxy/store.ts';

describe('ProxyManager', () => {
  const stores: ProxyStore[] = [];

  afterEach(() => {
    vi.useRealTimers();
    while (stores.length) {
      const store = stores.pop();
      store?.close();
    }
  });

  test('picks proxies and honors cooldown on failure', async () => {
    const manager = createManager({ failThreshold: 1, cooldownMs: 20 });
    manager.add({ protocol: 'http', host: 'proxy.test', port: 8080 });

    const firstPick = manager.pick();
    expect(firstPick).not.toBeNull();
    expect(firstPick?.config.host).toBe('proxy.test');

    manager.reportResult(firstPick?.id ?? 0, false);
    expect(manager.pick()).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 25));
    const renewed = manager.pick();
    expect(renewed).not.toBeNull();
    expect(renewed?.config.host).toBe('proxy.test');
  });

  test('cycles through multiple proxies by weight', () => {
    const manager = createManager({ failThreshold: 3 });
    manager.add({ protocol: 'http', host: 'proxy.a', port: 8000 });
    manager.add({ protocol: 'http', host: 'proxy.b', port: 8001 });

    const picks = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const pick = manager.pick();
      expect(pick).not.toBeNull();
      if (pick) {
        picks.add(pick.config.host);
        manager.reportResult(pick.id, true);
      }
    }

    expect(picks.size).toBeGreaterThanOrEqual(2);
  });

  function createManager(options?: {
    failThreshold?: number;
    cooldownMs?: number;
  }) {
    const store = new ProxyStore(':memory:');
    stores.push(store);
    return new ProxyManager({
      store,
      failThreshold: options?.failThreshold,
      cooldownMs: options?.cooldownMs,
    });
  }
});
