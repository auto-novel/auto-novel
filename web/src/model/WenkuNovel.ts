export interface WenkuNovelOutlineDto {
  id: string;
  title: string;
  titleZh: string;
  cover: string;
  favored?: string;
}

export interface WenkuNovelDto {
  title: string;
  titleZh: string;
  cover?: string;
  authors: string[];
  artists: string[];
  keywords: string[];
  publisher?: string;
  imprint?: string;
  latestPublishAt?: number;
  level: '一般向' | '轻文学' | '严肃向' | '非小说' | '成人向' | '成人向女';
  introduction: string;
  webIds: string[];
  volumes: WenkuVolumeDto[];
  glossary: { [key: string]: string };
  visited: number;
  favored?: string;
  volumeZh: string[];
  volumeJp: VolumeJpDto[];
}

export interface WenkuVolumeDto {
  asin: string;
  title: string;
  titleZh?: string;
  cover: string;
  coverHires?: string;
  publisher?: string;
  imprint?: string;
  publishAt?: number;
}

export interface VolumeJpDto {
  volumeId: string;
  total: number;
  baidu: number;
  youdao: number;
  gpt: number;
  sakura: number;
}

export interface AmazonNovel {
  title: string;
  titleZh?: string;
  r18: boolean;
  authors: string[];
  artists: string[];
  introduction: string;
  volumes: Array<WenkuVolumeDto>;
}

type PresetKeywordsGroup = {
  title: string;
  presetKeywords: string[];
};

type PresetKeywordsExplanation = {
  word: string;
  explanation: string;
};

type PresetKeywords = {
  groups: PresetKeywordsGroup[];
  explanations: PresetKeywordsExplanation[];
};

const groupsNonR18: PresetKeywordsGroup[] = [
  {
    title: '视角',
    presetKeywords: ['男主视角', '女主视角', 'TS视角', '群像'],
  },
  {
    title: '人物',
    presetKeywords: [
      '青梅竹马',
      '兄妹',
      '姐弟',
      '亲子',
      '师生',
      '萝莉',
      '人外',
      '伪娘',
      '龙傲天',
      '傲娇',
      '病娇',
      '恶役',
    ],
  },
  {
    title: '世界',
    presetKeywords: [
      '现代',
      '科幻',
      '奇幻',
      '历史',
      '末日',
      '校园',
      '游戏',
      '职场',
      '中华',
      '和风',
    ],
  },
  {
    title: '氛围',
    presetKeywords: ['治愈', '欢乐', '扭曲', '残酷', '致郁', '猎奇', '悬疑'],
  },
  {
    title: '主题',
    presetKeywords: [
      '纯爱',
      '后宫',
      '逆后宫',
      '百合',
      '耽美',
      'NTR',
      '战斗',
      '冒险',
      '异能',
      '机战',
      '战争',
      '经营',
      '日常',
      '推理',
      '竞技',
      '旅行',
      '穿越',
      '复仇',
      '误解系',
      '活该系',
    ],
  },
  {
    title: '其他',
    presetKeywords: ['动画化', '漫画化', '衍生作'],
  },
];

const explanationsNonR18: PresetKeywordsExplanation[] = [
  {
    word: '男主视角, 女主视角, TS视角, 群像',
    explanation:
      '小说的主视角，绝大多数情况只选择其中一个。单纯双主角不要添加“群像”。',
  },
  {
    word: '龙傲天',
    explanation: '不分男女，但必须得是主视角。',
  },
  {
    word: '科幻',
    explanation: '科幻风格的世界观，例如近未来的地球、空想科学的异世界、宇宙。',
  },
  {
    word: '奇幻',
    explanation: '奇幻风格的世界观，例如常见的异世界。',
  },
  {
    word: '游戏',
    explanation:
      '小说的主要场地在游戏中，包括现实游戏和穿越到游戏世界，注意并不是有状态面板就算是游戏世界。',
  },
  {
    word: '治愈',
    explanation: '“治愈”表示剧情轻松，例如慢生活系。',
  },
  {
    word: '扭曲, 残酷, 致郁, 猎奇',
    explanation:
      '“扭曲”表示存在情感纠葛的剧情，简单的多角恋党争不算。“残酷”表示存在黑暗的设定或情节，例如死亡游戏或大逃杀。“致郁”表示存在让人郁闷的情节，注意致郁不一定意味着角色死亡。“猎奇”表示存在重口或血腥描写。',
  },
  {
    word: '后宫, 逆后宫, 百合, 耽美',
    explanation: '这几个标签都采用广义解释。伪后宫、伪百合都可以使用。',
  },
  {
    word: '穿越',
    explanation: '转生和穿越都可以使用这个标签。',
  },
  {
    word: '动画化, 漫画化, 衍生作',
    explanation:
      '只有小说是本体的情况，才可以添加“动画化”和“漫画化”标签。如果本体是其他类型的作品，请添加“衍生作”。',
  },
];

export const presetKeywordsNonR18: PresetKeywords = {
  groups: groupsNonR18,
  explanations: explanationsNonR18,
};

const groupsR18: PresetKeywordsGroup[] = [];

const explanationsR18: PresetKeywordsExplanation[] = [];

export const presetKeywordsR18: PresetKeywords = {
  groups: groupsR18,
  explanations: explanationsR18,
};
