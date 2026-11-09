import { useLocalStorage } from '@/util';
import { parseSearchQuery } from '@/util/search-query';
import { LSKey } from './key';

interface SearchHistory {
  queries: string[];
  tags: { tag: string; used: number }[];
}

const useSearchHistoryStore = (key: string) => {
  return defineStore(key, () => {
    const ref = useLocalStorage<SearchHistory>(key, {
      queries: [],
      tags: [],
    });

    const addHistory = (query: string) => {
      query = query.trim();
      const parts = parseSearchQuery(query);

      if (query === '' || parts.length === 0) {
        return;
      }

      const tags = parts.filter((it) => it.tag !== null).map((it) => it.raw);
      tags.forEach((part) => {
        const inHistory = ref.value.tags.find((it) => it.tag === part);
        if (inHistory === undefined) {
          ref.value.tags.push({ tag: part, used: 1 });
        } else {
          inHistory.used += 1;
        }
      });

      const newQueries = ref.value.queries.filter((it) => it !== query);
      newQueries.unshift(query);
      ref.value.queries = newQueries.slice(0, 8);
    };

    const clear = () => {
      ref.value.queries = [];
      ref.value.tags = [];
    };

    return {
      searchHistory: ref,
      addHistory,
      clear,
    };
  })();
};

export const useWebSearchHistoryStore = () =>
  useSearchHistoryStore(LSKey.SearchHistoryWeb);

export const useWenkuSearchHistoryStore = () =>
  useSearchHistoryStore(LSKey.SearchHistoryWenku);
