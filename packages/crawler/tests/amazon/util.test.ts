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

  test('keeps normal cover urls', () => {
    expect(
      prettyCover(
        'https://m.media-amazon.com/images/I/51+O-UDQg+L._SY346_.jpg',
      ),
    ).toBe('https://images-cn.ssl-images-amazon.cn/images/I/51+O-UDQg+L.jpg');
  });
});
