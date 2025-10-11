export interface AddonApi {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  tabFetch(
    tabUrl: string,
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response>;
  spoofFetch(
    baseUrl: string,
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response>;
}
declare global {
  interface Window {
    Addon?: AddonApi;
  }
}

// Delay the access to window.Addon until it's actually used
export const Addon: AddonApi = {
  fetch: (...args: Parameters<AddonApi['fetch']>) => {
    if (window.Addon?.fetch) return window.Addon.fetch(...args);
    return window.fetch(...args);
  },
  tabFetch(...args: Parameters<AddonApi['tabFetch']>) {
    if (window.Addon?.tabFetch) {
      return window.Addon.tabFetch(...args);
    }
    return window.fetch(args[1], args[2]);
  },
  spoofFetch(...args: Parameters<AddonApi['spoofFetch']>) {
    if (window.Addon?.spoofFetch) {
      return window.Addon.spoofFetch(...args);
    }
    return window.fetch(args[1], args[2]);
  },
};
