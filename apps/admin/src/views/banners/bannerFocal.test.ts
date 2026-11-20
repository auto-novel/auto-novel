import { expect, it } from 'vite-plus/test';
import { bannerFocalPosition, validateBannerFocal } from './bannerFocal';

it('焦点尽量居中而不是直接当作 CSS 百分比', () => {
  expect(bannerFocalPosition(1000, 500, 500, 500, 0.6, 0.5)).toBe('70% 50%');
  expect(bannerFocalPosition(500, 1000, 500, 500, 0.5, 0.6)).toBe('50% 70%');
});
it('焦点靠近边缘时不露白', () => {
  expect(bannerFocalPosition(1000, 500, 500, 500, 0, 0)).toBe('0% 50%');
  expect(bannerFocalPosition(1000, 500, 500, 500, 1, 1)).toBe('100% 50%');
});
it('无裁剪或图片尚未加载时使用居中', () => {
  expect(bannerFocalPosition(500, 500, 500, 500, 0, 1)).toBe('50% 50%');
  expect(bannerFocalPosition(0, 0, 500, 500, 0.5, 0.5)).toBe('50% 50%');
});
it('只接受 0–1 之间的有限值', () => {
  expect(validateBannerFocal(0, 1)).toBe('');
  expect(validateBannerFocal(1.2, 0.5)).not.toBe('');
  expect(validateBannerFocal(NaN, 0.5)).not.toBe('');
});
