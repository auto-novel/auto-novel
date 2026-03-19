import type {
  ListOptions,
  ListSelectOption,
  ListTextOption,
  ListValue,
} from '@/components/list/types';
import router from '@/router';
import { parseWebListValueProvider } from '../list/option';

export interface WebFavoredListOptions extends ListOptions {
  搜索: ListTextOption;
  来源: ListSelectOption;
  类型: ListSelectOption;
  分级: ListSelectOption;
  翻译: ListSelectOption;
  排序: ListSelectOption;
}

export type WebFavoredListValue = ListValue<WebFavoredListOptions>;

export function getWebFavoredListOptions(
  allowNsfw: boolean,
  favoriteCreateTimeFirst: boolean,
): WebFavoredListOptions {
  return {
    搜索: {
      type: 'text',
      history: 'web',
      placeholder: '请输入中/日标题或作者',
    },
    来源: {
      type: 'select',
      tags: [
        'Kakuyomu',
        '成为小说家吧',
        'Novelup',
        'Hameln',
        'Pixiv',
        'Alphapolis',
      ],
      multiple: true,
    },
    类型: {
      type: 'select',
      tags: ['全部', '连载中', '已完结', '短篇'],
    },
    分级: {
      type: 'select',
      tags: ['全部', '一般向', 'R18'],
      hide: !allowNsfw,
    },
    翻译: {
      type: 'select',
      tags: ['全部', 'GPT', 'Sakura', 'Murasaki'],
    },
    排序: {
      type: 'select',
      tags: favoriteCreateTimeFirst
        ? ['收藏时间', '更新时间']
        : ['更新时间', '收藏时间'],
    },
  };
}

export const parseWebFavoredListValueProvider = parseWebListValueProvider;

export function parseFavoredListValueSort(
  option: ListSelectOption,
  v: number,
): string {
  const tag = option.tags[v];
  if (tag === '收藏时间') return 'create';
  return 'update';
}

export interface WenkuFavoredListOptions extends ListOptions {
  排序: ListSelectOption;
}

export type WenkuFavoredListValue = ListValue<WenkuFavoredListOptions>;

export function getWenkuFavoredListOptions(
  favoriteCreateTimeFirst: boolean,
): WenkuFavoredListOptions {
  return {
    排序: {
      type: 'select',
      tags: favoriteCreateTimeFirst
        ? ['收藏时间', '更新时间']
        : ['更新时间', '收藏时间'],
    },
  };
}
