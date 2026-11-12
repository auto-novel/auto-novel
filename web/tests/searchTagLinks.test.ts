import { describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';

import WebNovelTags from '../src/pages/novel/components/WebNovelTags.vue';
import { formatSearchTag } from '../src/util/search-query';

vi.mock('@/util/web', () => ({
  WebUtil: { tryTranslateKeyword: (tag: string) => tag },
}));

describe('小说标签链接', () => {
  it('真实组件生成可还原空格、引号和 URL 特殊字符的链接', async () => {
    const tags = ['西洋', 'ＡＡ BB?&x=#%+', 'A "B" C\\D', '-女主人公'];
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
      ],
    });
    const app = createSSRApp(WebNovelTags, {
      providerId: 'kakuyomu',
      attentions: ['R18'],
      keywords: tags,
    }).use(router);
    await router.push('/');

    const html = await renderToString(app);
    for (const tag of ['R18', ...tags]) {
      const href = router.resolve({
        path: '/novel',
        query: { query: formatSearchTag(tag) },
      }).href;
      expect(html).toContain(`href="${href}"`);
      expect(router.resolve(href).query.query).toBe(formatSearchTag(tag));
    }
  });
});
