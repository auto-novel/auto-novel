import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { loadBannerImage } from './bannerImage';

const createUrl = vi.spyOn(URL, 'createObjectURL');
const revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
let decodeFails = false;
let width = 1200;
let height = 400;
class FakeImage {
  naturalWidth = width;
  naturalHeight = height;
  onload?: () => void;
  onerror?: () => void;
  set src(_value: string) {
    queueMicrotask(() => (decodeFails ? this.onerror?.() : this.onload?.()));
  }
}
const file = () => new File(['image'], 'banner.gif', { type: 'image/gif' });
beforeEach(() => {
  vi.clearAllMocks();
  decodeFails = false;
  width = 1200;
  height = 400;
  createUrl.mockReturnValue('blob:preview');
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => vi.unstubAllGlobals());

describe('本地 Banner 图片', () => {
  it('读取损坏图片失败会释放 URL', async () => {
    decodeFails = true;
    await expect(loadBannerImage(file())).rejects.toThrow('无法读取图片');
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview');
  });
  it('保留原文件及尺寸，不重编码 GIF', async () => {
    const source = file();
    const image = await loadBannerImage(source);
    expect(image).toEqual({ file: source, url: 'blob:preview', width, height });
    expect(image.file).toBe(source);
    expect(revokeUrl).not.toHaveBeenCalled();
  });
  it.each([
    [0, 400],
    [1200, 0],
    [8193, 1],
    [1, 8193],
    [8192, 4097],
  ])('加载时拒绝无效或超限尺寸 %i × %i 并释放 URL', async (w, h) => {
    width = w;
    height = h;
    await expect(loadBannerImage(file())).rejects.toThrow('宽高必须');
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview');
  });
  it('接受宽度和总像素恰好达到上限的图片', async () => {
    width = 8192;
    height = 4096;
    await expect(loadBannerImage(file())).resolves.toMatchObject({
      width,
      height,
    });
  });
});
