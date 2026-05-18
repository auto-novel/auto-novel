import type { KyInstance } from 'ky';
import ky from 'ky';

import { YoudaoTranslator as PackageYoudaoTranslator } from '@auto-novel/translator';

import { ensureCookie, getAddon } from '@/external/addon';
import { lazy } from '@/util';

const getClient = lazy(async (): Promise<KyInstance> => {
  const addon = getAddon();

  await ensureCookie(addon, 'https://dict.youdao.com/', '.youdao.com', [
    'OUTFOX_SEARCH_USER_ID',
  ]);

  return ky.create({
    fetch: addon.fetch.bind(addon),
  });
});

export const createYoudaoTranslator = async (
  log?: (message: string, detail?: string[]) => void,
) =>
  new PackageYoudaoTranslator({
    client: await getClient(),
    log,
  }).init();
