import type { AddonApi, CookieStatus } from '@/util/useAddon';

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
