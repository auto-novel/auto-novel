import type {
  ListOptions,
  ListSelectOption,
  ListTextOption,
  ListValue,
} from '@/components/list/types';
import router from '@/router';

export const onUpdatePage = (page: number) => {
  const route = router.currentRoute.value;
  const query = { ...route.query, page };
  router.push({ path: route.path, query });
};

export function onUpdateListValue(
  listOptions: ListOptions,
  listFilter: ListValue<ListOptions>,
) {
  const route = router.currentRoute.value;
  router.push({
    path: route.path,
    query: {
      ...route.query,
      page: 1,
      query: listFilter.搜索,
      selected: Object.entries(listOptions)
        .filter(([, option]) => option.type === 'select')
        .map(([label]) => listFilter[label] as number),
    },
  });
}

export interface WebListOptions extends ListOptions {
  搜索: ListTextOption;
  来源: ListSelectOption;
  类型: ListSelectOption;
  分级: ListSelectOption;
  翻译: ListSelectOption;
  排序: ListSelectOption;
}

export type WebListValue = ListValue<WebListOptions>;

export function getWebListOptions(allowNsfw: boolean): WebListOptions {
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
      tags: ['全部', 'GPT', 'Sakura'],
    },
    排序: {
      type: 'select',
      tags: ['更新', '点击', '相关'],
    },
  };
}

export function parseWebListValueProvider(v: number): string {
  const tags = [
    'kakuyomu',
    'syosetu',
    'novelup',
    'hameln',
    'pixiv',
    'alphapolis',
  ];

  return tags.filter((_, index) => (v & (1 << index)) !== 0).join();
}

export interface WenkuListOptions extends ListOptions {
  搜索: ListTextOption;
  分级: ListSelectOption;
}

export type WenkuListValue = ListValue<WenkuListOptions>;

export function getWenkuListOptions(allowNsfw: boolean): WenkuListOptions {
  const levels = ['全部小说', '轻小说', '轻文学', '文学', '非小说'];
  const levelsNsfw = ['R18男性向', 'R18女性向'];
  return {
    搜索: {
      type: 'text',
      history: 'wenku',
    },
    分级: {
      type: 'select',
      tags: allowNsfw ? [...levels, ...levelsNsfw] : levels,
    },
  };
}

type Descriptor = {
  title: string;
  listOptions: ListOptions;
};

const descriptorsKakuyomu: Record<string, Descriptor> = {
  '1': {
    title: 'Kakuyomu：流派',
    listOptions: {
      流派: {
        type: 'select',
        tags: [
          '综合',
          '异世界幻想',
          '现代幻想',
          '科幻',
          '恋爱',
          '浪漫喜剧',
          '现代戏剧',
          '恐怖',
          '推理',
          '散文·纪实',
          '历史·时代·传奇',
          '创作论·评论',
          '诗·童话·其他',
        ],
      },
      范围: {
        type: 'select',
        tags: ['总计', '每年', '每月', '每周', '每日'],
      },
      状态: {
        type: 'select',
        tags: ['全部', '长篇', '短篇'],
      },
    },
  },
};

const commonOptionsSyosetu: ListOptions = {
  范围: {
    type: 'select',
    tags: ['总计', '每年', '季度', '每月', '每周', '每日'],
  },
  状态: {
    type: 'select',
    tags: ['全部', '短篇', '连载', '完结'],
  },
};

const descriptorsSyosetu: Record<string, Descriptor> = {
  '1': {
    title: '成为小说家：流派',
    listOptions: {
      流派: {
        type: 'select',
        tags: [
          '恋爱：异世界',
          '恋爱：现实世界',
          '幻想：高幻想',
          '幻想：低幻想',
          '文学：纯文学',
          '文学：人性剧',
          '文学：历史',
          '文学：推理',
          '文学：恐怖',
          '文学：动作',
          '文学：喜剧',
          '科幻：VR游戏',
          '科幻：宇宙',
          '科幻：空想科学',
          '科幻：惊悚',
          '其他：童话',
          '其他：诗',
          '其他：散文',
          '其他：其他',
        ],
      },
      ...commonOptionsSyosetu,
    },
  },
  '2': {
    title: '成为小说家：综合',
    listOptions: commonOptionsSyosetu,
  },
  '3': {
    title: '成为小说家：异世界转移/转生',
    listOptions: {
      流派: {
        type: 'select',
        tags: ['恋爱', '幻想', '文学/科幻/其他'],
      },
      ...commonOptionsSyosetu,
    },
  },
};

const descriptiors: Record<string, Record<string, Descriptor>> = {
  syosetu: descriptorsSyosetu,
  kakuyomu: descriptorsKakuyomu,
};

export function getWebRankListOptions(providerId: string, typeId: string) {
  return descriptiors[providerId]?.[typeId];
}

export function parseRankListValue(
  providerId: string,
  typeId: string,
  page: number,
  value: ListValue<ListOptions>,
): Record<string, string> {
  const descriptior = getWebRankListOptions(providerId, typeId);

  function get(key: string): string {
    const option = descriptior.listOptions[key];
    if (option.type === 'select') {
      return option.tags[value[key] as number];
    }
    return '';
  }

  if (providerId == 'syosetu') {
    if (typeId === '1') {
      return {
        type: '流派',
        genre: get('流派'),
        range: get('范围'),
        status: get('状态'),
        page: page.toString(),
      };
    } else if (typeId === '2') {
      return {
        type: '综合',
        range: get('范围'),
        status: get('状态'),
        page: page.toString(),
      };
    } else if (typeId === '3') {
      return {
        type: '异世界转生/转移',
        genre: get('流派'),
        range: get('范围'),
        status: get('状态'),
        page: page.toString(),
      };
    } else {
      return {};
    }
  } else if (providerId == 'kakuyomu') {
    return {
      genre: get('流派'),
      range: get('范围'),
      status: get('状态'),
    };
  } else {
    return {};
  }
}
