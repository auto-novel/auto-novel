import ky from 'ky';

import { Providers } from '@auto-novel/crawler';

const checkAddon = () => {
  return window.Addon !== undefined;
};

const getProvider = (providerId: string) => {
  if (!window.Addon || !(providerId in Providers)) return undefined;
  const client = ky.create({ fetch: window.Addon.fetch });
  const providerInitFn = Providers[providerId as keyof typeof Providers];
  const provider = providerInitFn(client);
  return provider;
};

const updateWebNovel = async (providerId: string, novelId: string) => {
  const provider = getProvider(providerId);
  if (!provider) throw new Error('Provider not available');

  const metadata = await provider.getMetadata(novelId);
  if (metadata == null) throw new Error('Novel not found');

  console.log(metadata);
};

export const Crawler = {
  checkAddon,
  updateWebNovel,
};
