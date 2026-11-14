import { describe, expect, test } from 'vitest';

import { prettyCover } from '@/amazon/util';

describe('prettyCover', () => {
  test('removes the logged-in experiment path segment', () => {
    expect(
      prettyCover(
        'https://images-cn.ssl-images-amazon.cn/images/W/BW_MEDIAX_AVIF_MEASUREMENT_1306696-T2/images/I/91TY7Nje7-L.jpg',
      ),
    ).toBe('https://images-cn.ssl-images-amazon.cn/images/I/91TY7Nje7-L.jpg');
  });

  test.each([
    '._AC_AIweblab1392912,T3_SF730,1044_PQ60_.jpg',
    '.jpg?aicid=detailPage-mediaBlock',
    '._AC_AIweblab1392912,T3_SF730,1044_PQ60_.jpg?aicid=detailPage-mediaBlock',
  ])('removes thumbnail modifiers and query parameters: %s', (suffix) => {
    const cover = 'https://images-cn.ssl-images-amazon.cn/images/I/919BBubda1L';
    expect(prettyCover(cover + suffix)).toBe(`${cover}.jpg`);
  });

  test.each([
    '.jpg',
    '._SY346_.jpg',
    '._SY346_ControlCacheEqualizer.jpg',
    '._PJku-sticker-v7,TopRight,0,-50._SY346_.jpg',
  ])('normalizes existing cover formats: %s', (suffix) => {
    expect(
      prettyCover(`https://m.media-amazon.com/images/I/51+O-UDQg+L${suffix}`),
    ).toBe('https://images-cn.ssl-images-amazon.cn/images/I/51+O-UDQg+L.jpg');
  });
});
