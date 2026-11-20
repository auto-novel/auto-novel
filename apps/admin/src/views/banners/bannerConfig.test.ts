import { expect, it } from 'vite-plus/test';
import { validateBannerConfig } from './bannerConfig';

it.each(['', ' /novel ', 'https://example.com'])(
  '接受有效跳转地址 %j',
  (link) => {
    expect(validateBannerConfig(link, 0)).toBe('');
  },
);

it.each(['//example.com', 'javascript:alert(1)', '/novel\\test'])(
  '拒绝非法跳转地址 %j',
  (link) => {
    expect(validateBannerConfig(link, 0)).toBe(
      '跳转地址必须为站内路径或 HTTP(S) 地址',
    );
  },
);

it.each([-2147483648, 2147483647])('接受排序边界 %s', (sortOrder) => {
  expect(validateBannerConfig('', sortOrder)).toBe('');
});

it.each([-2147483649, 2147483648, 1.5, NaN])(
  '拒绝非法排序值 %s',
  (sortOrder) => {
    expect(validateBannerConfig('', sortOrder)).toBe(
      '排序值必须为有效的 32 位整数',
    );
  },
);
