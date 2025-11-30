import z from 'zod';
import type { ProxyStore } from './store';

export const ProxyConfigSchema = z.object({
  protocol: z.enum(['http', 'https', 'socks5']),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
});

export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type ProxyProtocol = ProxyConfig['protocol'];

export type ProxyState = {
  id: number;
  config: ProxyConfig;
  failCount: number;
  successCount: number;
  cooldownUntil: number | null;
  lastUsedAt: number | null;
};

type ProxyManagerOptions = {
  store: ProxyStore;
  failThreshold?: number;
  cooldownMs?: number;
  defaultProxies?: ProxyConfig[];
};

const BASE_SCORE = 100;
const MIN_SCORE = 10;
const SUCCESS_WEIGHT = 1;
const FAILURE_WEIGHT = 10;
const DEFAULT_FAIL_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes

export class ProxyManager {
  private readonly store: ProxyStore;
  private readonly failThreshold: number;
  private readonly cooldownMs: number;

  constructor(options: ProxyManagerOptions) {
    this.store = options.store;
    this.failThreshold = options.failThreshold ?? DEFAULT_FAIL_THRESHOLD;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;

    if (options.defaultProxies) {
      for (const config of options.defaultProxies) {
        console.debug('Add default proxy:', config);
        this.add(config);
      }
    }
  }

  add(config: ProxyConfig): ProxyState {
    return this.store.addSync(config);
  }

  remove(id: number): void {
    this.store.removeSync(id);
  }

  list(): ProxyState[] {
    return this.store.listSync();
  }

  pick(): ProxyState | null {
    const now = Date.now();
    const states = this.store.listSync();
    const refreshed = states.map((state) =>
      this.refreshStateIfCooldownExpired(state, now),
    );
    const available = refreshed.filter((state) => state.cooldownUntil == null);
    if (available.length === 0) {
      return null;
    }
    const selected = this.selectByWeight(available, now);
    return selected ?? null;
  }

  reportResult(id: number, success: boolean): void {
    const state = this.store.getByIdSync(id);
    if (!state) {
      return;
    }
    const now = Date.now();
    if (success) {
      this.store.updateStateSync(id, {
        failCount: 0,
        successCount: state.successCount + 1,
        cooldownUntil: null,
        lastUsedAt: now,
      });
      return;
    }

    const failCount = state.failCount + 1;
    const updates: Partial<ProxyState> = {
      failCount,
      lastUsedAt: now,
    };
    if (failCount >= this.failThreshold) {
      updates.cooldownUntil = now + this.cooldownMs;
    }
    this.store.updateStateSync(id, updates);
  }

  private refreshStateIfCooldownExpired(
    state: ProxyState,
    now: number,
  ): ProxyState {
    if (state.cooldownUntil && state.cooldownUntil <= now) {
      return (
        this.store.updateStateSync(state.id, {
          cooldownUntil: null,
          failCount: 0,
        }) ?? { ...state, cooldownUntil: null, failCount: 0 }
      );
    }
    return state;
  }

  private selectByWeight(states: ProxyState[], now: number): ProxyState | null {
    const candidates = states.map((state) => ({
      state,
      weight: this.calculateWeight(state),
    }));

    const totalWeight = candidates.reduce(
      (sum, candidate) => sum + candidate.weight,
      0,
    );
    if (totalWeight <= 0) {
      return null;
    }
    let ticket = Math.random() * totalWeight;
    for (const candidate of candidates) {
      ticket -= candidate.weight;
      if (ticket <= 0) {
        const updated = this.store.updateStateSync(candidate.state.id, {
          lastUsedAt: now,
        }) ?? { ...candidate.state, lastUsedAt: now };
        return updated;
      }
    }
    const fallback = candidates[candidates.length - 1]?.state;
    if (!fallback) {
      return null;
    }
    return (
      this.store.updateStateSync(fallback.id, {
        lastUsedAt: now,
      }) ?? { ...fallback, lastUsedAt: now }
    );
  }

  private calculateWeight(state: ProxyState): number {
    const score =
      BASE_SCORE +
      state.successCount * SUCCESS_WEIGHT -
      state.failCount * FAILURE_WEIGHT;
    return Math.max(score, MIN_SCORE);
  }
}
