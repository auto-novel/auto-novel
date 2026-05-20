import { AddonNotFoundError, assertAddonVersion } from '@/external/errors';

export interface CookieStatus {
  domain: string;
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
}

export type InfoResult = {
  version: string; // extension version
  homepage_url: string;
};

export interface AddonApi {
  version: string;

  ping(): Promise<string>;

  info(): Promise<InfoResult>;

  cookiesStatus(params: {
    url?: string;
    domain?: string;
    partitionKey?: {
      topLevelSite: string;
    };
    keys: string[] | '*';
  }): Promise<Record<string, CookieStatus>>;

  cookiesPatch(params: {
    url: string;
    patches: Record<string, CookieStatus>;
  }): Promise<void>;

  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  tabFetch(
    options: { tabUrl: string; forceNewTab?: boolean },
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

export function getAddon(): AddonApi {
  const addon = window.Addon;
  if (!addon) throw new AddonNotFoundError();

  assertAddonVersion(addon.version);
  return addon;
}

function allCookiesAvailable(
  status: Record<string, CookieStatus | undefined>,
): boolean {
  return Object.values(status).every((cookie) => cookie);
}

export async function ensureCookie(
  addon: AddonApi,
  url: string,
  domain: string | undefined,
  keys: string[],
) {
  const status = await addon.cookiesStatus({ domain, keys });
  if (allCookiesAvailable(status)) return status;

  await addon.tabFetch({ tabUrl: url, forceNewTab: true }, url);

  const newStatus = await addon.cookiesStatus({ domain, keys });
  if (allCookiesAvailable(newStatus)) return newStatus;

  throw new Error('Cookie is not available');
}
