import { AES } from 'crypto-es/lib/aes';
import { Utf8 } from 'crypto-es/lib/core';
import { MD5 } from 'crypto-es/lib/md5';
import type { Options } from 'ky';
import ky from 'ky';

import { lazy } from '@/util';
import { ensureCookie } from './util';

const getClient = lazy(async () => {
  const addon = window.Addon;
  if (!addon) return ky;

  const url = 'https://dict.youdao.com/';
  const domain = '.youdao.com';
  const keys = ['OUTFOX_SEARCH_USER_ID'];

  const cookies = await ensureCookie(addon, url, domain, keys);

  return ky.create({
    fetch: addon.fetch.bind(window.Addon),
  });
});

const getBaseBody = (key: string) => {
  const c = 'fanyideskweb';
  const p = 'webfanyi';
  const t = Date.now().toString();

  const sign = MD5(
    `client=${c}&mysticTime=${t}&product=${p}&key=${key}`,
  ).toString();
  return {
    sign,
    client: c,
    product: p,
    appVersion: '1.0.0',
    vendor: 'web',
    pointParam: 'client,mysticTime,product',
    mysticTime: t,
    keyfrom: 'fanyi.web',
  };
};

const decode = (src: string) => {
  const dec = AES.decrypt(
    src.replace(/_/g, '/').replace(/-/g, '+'),
    MD5(
      'ydsecret://query/key/B*RGygVywfNBwpmBaZg*WT7SIOUP2T0C9WHMZN39j^DAdaZhAnxvGcCY6VYFwnHl',
    ),
    {
      iv: MD5(
        'ydsecret://query/iv/C@lZe2YzHtZ2CYgaXKSVfsb7Y4QWHjITPPZ0nQp87fBeJ!Iv6v^6fvi2WN@bYpJ4',
      ),
    },
  ).toString(Utf8);
  return dec;
};

let key = 'fsdsogkndfokasodnaso';

async function rlog() {
  const client = await getClient();
  client.get('https://rlogs.youdao.com/rlog.php', {
    searchParams: {
      _npid: 'fanyiweb',
      _ncat: 'pageview',
      _ncoo: (2147483647 * Math.random()).toString(),
      _nssn: 'NULL',
      _nver: '1.2.0',
      _ntms: Date.now().toString(),
    },
    credentials: 'include',
    retry: 0,
  });
}

async function refreshKey() {
  const client = await getClient();
  const resp: any = await client
    .get('https://dict.youdao.com/webtranslate/key', {
      searchParams: {
        keyid: 'webfanyi-key-getter',
        ...getBaseBody('asdjnjfenknafdfsdfsd'),
      },
      credentials: 'include',
      retry: 0,
    })
    .json();
  key = resp['data']['secretKey'];
}

async function webtranslate(query: string, from: string, options?: Options) {
  const client = await getClient();
  const resp = await client
    .post('https://dict.youdao.com/webtranslate', {
      body: new URLSearchParams({
        i: query,
        from,
        to: 'zh-CHS',
        dictResult: 'true',
        keyid: 'webfanyi',
        ...getBaseBody(key),
      }),
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
      credentials: 'include',
      retry: 0,
      ...options,
    })
    .text();
  return decode(resp);
}

export const YoudaoApi = {
  rlog,
  refreshKey,
  webtranslate,
};
