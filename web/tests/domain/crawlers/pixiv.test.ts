// @vitest-environment jsdom

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Providers } from '@/domain/crawlers';

describe.concurrent('web/crawlers/pixiv', () => {
  let provider: any;

  beforeAll(() => {
    (window as any).Addon = { fetch };
    provider = Providers['pixiv'];
    if (!provider) {
      throw new Error('Pixiv provider not found');
    }
  });

  afterAll(() => {
    delete (window as any).Addon;
  });

  describe('normal/single', () => {
    const novelId = '20701222';
    const chapterId = '20701222';

    it('metadata', async () => {
      const metadata = await provider.getMetadata(`s${novelId}`);
      expect(metadata?.title).toContain('mygo-污秽不堪的我');
    });

    it('chapter', async () => {
      const chapter = await provider.getChapter(`s${novelId}`, chapterId);
      expect(chapter?.paragraphs?.join('')).toContain(
        '我是污秽不堪的恶魔，我的囚笼里藏着一只美丽的折翼天使。',
      );
    });
  });

  describe('normal/series', () => {
    const novelId = '10999474';
    const chapterId = '20701185';

    it('metadata', async () => {
      const metadata = await provider.getMetadata(novelId);
      expect(metadata?.title).toContain('若叶睦死于傍晚的盛夏');
    });

    it('chapter', async () => {
      const chapter = await provider.getChapter(novelId, chapterId);
      expect(chapter?.paragraphs?.join('')).toContain(
        '若叶睦，已经死于这傍晚的盛夏。',
      );
    });
  });

  // describe("r18/series", () => {
  //     const novelId = "10999436";
  //     const chapterId = "20701122";

  //     it("metadata", async () => {
  //         const metadata = await provider.getMetadata(novelId);
  //         expect(metadata?.title).toContain("mygo-明明只是普通高一jk的我却不幸陷入九个成年女性组成的恐怖修罗场");
  //     });

  //     it("chapter", async () => {
  //         const chapter = await provider.getChapter(novelId, chapterId);
  //         expect(chapter?.paragraphs.join("")).toContain("猫说：“要做吗？”");
  //     });
  // });
});
