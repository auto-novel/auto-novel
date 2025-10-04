import { AES } from 'crypto-es/lib/aes';
import { Utf8 } from 'crypto-es/lib/core';
import { MD5 } from 'crypto-es/lib/md5';
import type { Options } from 'ky';
// import ky from 'ky';
import { ky_tab_factory, ky_spoof_factory } from '@/util/useAddon';

// const ky = ky_spoof_factory('https://dict.youdao.com/');
const ky = ky_tab_factory('https://dict.youdao.com/');

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

const rlog = () =>
  ky.get('https://rlogs.youdao.com/rlog.php', {
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

const refreshKey = () =>
  ky
    .get('https://dict.youdao.com/webtranslate/key', {
      searchParams: {
        keyid: 'webfanyi-key-getter',
        ...getBaseBody('asdjnjfenknafdfsdfsd'),
      },
      credentials: 'include',
      retry: 0,
    })
    .json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((json: any) => (key = json['data']['secretKey']));

const webtranslate = (query: string, from: string, options?: Options) =>
  ky
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
    .text()
    .then(decode);

export const YoudaoApi = {
  rlog,
  refreshKey,
  webtranslate,
};
