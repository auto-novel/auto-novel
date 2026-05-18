import type { KyInstance } from 'ky';
import ky from 'ky';

import { YoudaoTranslator as PackageYoudaoTranslator } from '@auto-novel/translator';

import { ensureCookie } from '@/external/addon';
import { AddonNotFoundError } from '@/external/errors';
import { lazy } from '@/util';

const getClient = lazy(async (): Promise<KyInstance> => {
  const addon = window.Addon;
  if (!addon) throw new AddonNotFoundError();

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
