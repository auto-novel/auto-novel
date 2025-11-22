export type ProxyProtocol = 'http' | 'https' | 'socks5';

export type ProxyConfig = {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
};

export type ProxyState = {
  id: number;
  config: ProxyConfig;
  failCount: number;
  successCount: number;
  cooldownUntil: number | null;
  lastUsedAt: number | null;
};

type ProxyManagerOptions = {
  failThreshold?: number;
  cooldownMs?: number;
  proxies?: ProxyConfig[];
};

const BASE_SCORE = 100;
const MIN_SCORE = 10;
const SUCCESS_WEIGHT = 1;
const FAILURE_WEIGHT = 10;
const DEFAULT_FAIL_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes

export class ProxyManager {
  private readonly states: ProxyState[] = [];
  private nextId = 1;
  private readonly failThreshold: number;
  private readonly cooldownMs: number;

  constructor(options?: ProxyManagerOptions) {
    this.failThreshold = options?.failThreshold ?? DEFAULT_FAIL_THRESHOLD;
    this.cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    if (options?.proxies) {
      this.load(options.proxies);
    }
  }

  load(proxies: ProxyConfig[]) {
    this.states.length = 0;
    this.nextId = 1;
    proxies.forEach((proxy) => this.add(proxy));
  }

  add(config: ProxyConfig): ProxyState {
    const state: ProxyState = {
      id: this.nextId++,
      config,
      failCount: 0,
      successCount: 0,
      cooldownUntil: null,
      lastUsedAt: null,
    };
    this.states.push(state);
    return state;
  }

  pick(): ProxyState | null {
    const now = Date.now();
    const available = this.states.filter((state) => {
      if (state.cooldownUntil && state.cooldownUntil <= now) {
        state.cooldownUntil = null;
        state.failCount = 0;
      }
      return state.cooldownUntil == null;
    });

    if (available.length === 0) {
      return null;
    }

    const candidates = available.map((state) => ({
      state,
      weight: this.calculateWeight(state),
    }));

    const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let ticket = Math.random() * totalWeight;

    for (const candidate of candidates) {
      ticket -= candidate.weight;
      if (ticket <= 0) {
        candidate.state.lastUsedAt = now;
        return candidate.state;
      }
    }

    const fallback = candidates[candidates.length - 1].state;
    fallback.lastUsedAt = now;
    return fallback;
  }

  reportResult(id: number, success: boolean): void {
    const state = this.states.find((entry) => entry.id === id);
    if (!state) {
      return;
    }

    const now = Date.now();
    state.lastUsedAt = now;

    if (success) {
      state.failCount = 0;
      state.successCount += 1;
      state.cooldownUntil = null;
      return;
    }

    state.failCount += 1;
    if (state.failCount >= this.failThreshold) {
      state.cooldownUntil = now + this.cooldownMs;
    }
  }

  getStates(): ProxyState[] {
    return this.states.map((state) => ({ ...state }));
  }

  private calculateWeight(state: ProxyState): number {
    const score = BASE_SCORE + state.successCount * SUCCESS_WEIGHT - state.failCount * FAILURE_WEIGHT;
    return Math.max(score, MIN_SCORE);
  }
}
