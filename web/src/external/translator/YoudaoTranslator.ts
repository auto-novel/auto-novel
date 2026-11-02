import type { KyInstance } from 'ky';
import ky from 'ky';

import { createTranslator } from '@auto-novel/translator';

import { ensureCookie, getAddon } from '@/external/addon';
import { lazy } from '@/util';

const getClient = lazy(async (): Promise<KyInstance> => {
  const addon = await getAddon();

  await ensureCookie(addon, 'https://dict.youdao.com/', '.youdao.com', [
    'OUTFOX_SEARCH_USER_ID',
  ]);

  return ky.create({
    fetch: addon.fetch.bind(addon),
  });
});

export const createYoudaoTranslator = async (
  log?: (message: string, detail?: readonly string[]) => void,
) => createTranslator({ kind: 'youdao', client: await getClient(), log });
