import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import cases from '../../server/src/test/resources/search-query-cases.json';
import { useWebSearchHistoryStore } from '../src/stores/useSearchHistoryStore';
import {
  convertSearchQuery,
  formatSearchTag,
  parseSearchQuery,
} from '../src/util/search-query';

vi.mock('@/util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/util')>()),
  useLocalStorage: (_key: string, defaults: object) => ref(defaults),
}));

describe('搜索字符串分词', () => {
  it.each(cases)('$name', ({ input, tokens }) => {
    expect(parseSearchQuery(input)).toEqual(
      tokens.map(([raw, tag, excluded]) => ({ raw, tag, excluded })),
    );
  });

  it.each(['ＥＳＮ大賞６受賞作', 'AA BB?&x=#%+', '-女主人公', 'A "B" C\\D'])(
    '标签构造及路由编码往返不改变原文：%s',
    (tag) => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/novel', component: { template: '<div />' } }],
      });
      const query = formatSearchTag(tag);
      const url = router.resolve({ path: '/novel', query: { query } }).href;
      const decoded = router.resolve(url);

      expect(decoded.hash).toBe('');
      expect(decoded.query).toEqual({ query });
      expect(parseSearchQuery(String(decoded.query.query))).toEqual([
        { raw: query, tag, excluded: false },
      ]);
    },
  );

  it('简繁处理保留标签、引号原文和空白', () => {
    const query =
      '\t"異 世界?"$ 異世界$ author:"龍 王" "異 世界" 異なる 異한\n';
    expect(
      convertSearchQuery(query, (text) =>
        text.replaceAll('異', '异').replaceAll('龍', '龙'),
      ),
    ).toBe(query);
  });

  it('未引用中文保留原有简繁扩展及全文运算符', () => {
    expect(
      convertSearchQuery('異世界|龍+主人公 -異世界', (text) =>
        text.replaceAll('異', '异').replaceAll('龍', '龙'),
      ),
    ).toBe('(異世界|异世界)|(龍|龙)+主人公 -(異世界|异世界)');
  });

  it('历史完整保存并复用混合标签，不收录短语内的美元符号', () => {
    setActivePinia(createPinia());
    const store = useWebSearchHistoryStore();
    const query = '"西洋"$ "ＥＳＮ大賞６受賞作"$ 女主人公$ -"AA BB?"$';
    store.addHistory(query);
    store.addHistory(query);
    const fullText = '"AA$ BB" author:"CC DD 女主人公$';
    store.addHistory(fullText);

    expect(store.searchHistory.queries).toEqual([fullText, query]);
    expect(store.searchHistory.tags).toEqual([
      { tag: '"西洋"$', used: 2 },
      { tag: '"ＥＳＮ大賞６受賞作"$', used: 2 },
      { tag: '女主人公$', used: 2 },
      { tag: '-"AA BB?"$', used: 2 },
    ]);
    expect(parseSearchQuery(store.searchHistory.tags[3].tag)[0]).toEqual({
      raw: '-"AA BB?"$',
      tag: 'AA BB?',
      excluded: true,
    });
  });
});
