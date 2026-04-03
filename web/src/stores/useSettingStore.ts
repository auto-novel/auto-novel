import type { TranslatorId } from '@/model/Translator';
import { defaultConverter, useLocalStorage, useOpenCC } from '@/util';
import { LSKey } from './key';

const ensureTranslatorLast = (
  translators: TranslatorId[],
  target: TranslatorId,
): TranslatorId[] => [...translators.filter((item) => item !== target), target];

export interface Setting {
  theme: 'light' | 'dark' | 'system';
  enabledTranslator: TranslatorId[];
  tocSortReverse: boolean;
  //
  tocCollapseInNarrowScreen: boolean;
  tocExpandAll: boolean;
  hideCommmentWebNovel: boolean;
  hideCommmentWenkuNovel: boolean;
  showTagInWebFavored: boolean;
  favoriteCreateTimeFirst: boolean;
  //
  autoTopJobWhenAddTask: boolean;
  //
  menuCollapsed: boolean;
  //
  downloadFilenameType: 'jp' | 'zh';
  downloadFormat: {
    mode: 'zh' | 'zh-jp' | 'jp-zh';
    translationsMode: 'parallel' | 'priority';
    translations: TranslatorId[];
    type: 'epub' | 'txt';
  };
  workspaceSound: boolean;
  paginationMode: 'pagination' | 'scroll';
  localVolumeOrder: {
    value: 'byCreateAt' | 'byReadAt' | 'byId';
    desc: boolean;
  };
  //
  locale: 'zh-cn' | 'zh-tw';
  searchLocaleAware: boolean;
}

export namespace Setting {
  const defaultTranslationOrder: TranslatorId[] = [
    'sakura',
    'gpt',
    'youdao',
    'baidu',
    'murasaki',
  ];

  export const defaultValue: Setting = {
    theme: 'system',
    enabledTranslator: ['baidu', 'youdao', 'gpt', 'sakura', 'murasaki'],
    tocSortReverse: false,
    //
    tocCollapseInNarrowScreen: true,
    tocExpandAll: true,
    hideCommmentWebNovel: false,
    hideCommmentWenkuNovel: false,
    showTagInWebFavored: false,
    favoriteCreateTimeFirst: false,
    //
    autoTopJobWhenAddTask: false,
    //
    menuCollapsed: false,
    //
    downloadFilenameType: 'zh',
    downloadFormat: {
      mode: 'zh-jp',
      translationsMode: 'priority',
      translations: [...defaultTranslationOrder],
      type: 'epub',
    },
    workspaceSound: false,
    paginationMode: 'pagination',
    localVolumeOrder: {
      value: 'byCreateAt',
      desc: true,
    },
    //
    locale: 'zh-cn',
    searchLocaleAware: false,
  };

  export const migrate = (setting: Setting) => {
    if ('isDark' in setting && typeof setting.isDark !== undefined) {
      if (setting.isDark === true) {
        setting.theme = 'dark';
      }
      delete setting.isDark;
    }
    if (setting.enabledTranslator === undefined) {
      setting.enabledTranslator = [
        'baidu',
        'youdao',
        'gpt',
        'sakura',
        'murasaki',
      ];
    }
    setting.enabledTranslator = ensureTranslatorLast(
      setting.enabledTranslator,
      'murasaki',
    );
    if (setting.downloadFormat === undefined) {
      setting.downloadFormat = {
        mode: 'zh-jp',
        translationsMode: 'priority',
        translations: [...defaultTranslationOrder],
        type: 'epub',
      };
    }
    if (setting.downloadFormat?.translations === undefined) {
      setting.downloadFormat.translations = [...defaultTranslationOrder];
    }
    setting.downloadFormat.translations = ensureTranslatorLast(
      setting.downloadFormat.translations,
      'murasaki',
    );
    if ((setting.downloadFormat.mode as string) === 'mix') {
      setting.downloadFormat.mode = 'zh-jp';
    } else if ((setting.downloadFormat.mode as string) === 'mix-reverse') {
      setting.downloadFormat.mode = 'jp-zh';
    } else if ((setting.downloadFormat.mode as string) === 'jp') {
      setting.downloadFormat.mode = 'zh';
    }
    // 2024-03-05
    if (setting.workspaceSound === undefined) {
      setting.workspaceSound = false;
    }
    // 2024-05-28
    if ((setting.paginationMode as unknown) === 'auto') {
      setting.paginationMode = 'pagination';
    }
  };

  export const downloadModeOptions = [
    { label: '中文', value: 'zh' },
    { label: '中日', value: 'zh-jp' },
    { label: '日中', value: 'jp-zh' },
  ];
  export const downloadTranslationModeOptions = [
    { label: '优先', value: 'priority' },
    { label: '并列', value: 'parallel' },
  ];
  export const downloadTypeOptions = [
    { label: 'EPUB', value: 'epub' },
    { label: 'TXT', value: 'txt' },
  ];

  export const themeOptions = [
    { label: '亮色主题', value: 'light' },
    { label: '暗色主题', value: 'dark' },
    { label: '跟随系统', value: 'system' },
  ];
  export const paginationModeOptions = [
    { label: '分页', value: 'pagination' },
    { label: '滚动', value: 'scroll' },
  ];
  export const localVolumeOrderOptions = [
    { value: 'byCreateAt', label: '添加时间' },
    { value: 'byReadAt', label: '阅读时间' },
    { value: 'byId', label: '标题' },
  ];
  export const localeOptions = [
    { label: '简体中文', value: 'zh-cn' },
    { label: '繁体中文', value: 'zh-tw' },
  ];
}

export interface ReaderSetting {
  mode: 'jp' | 'zh' | 'zh-jp' | 'jp-zh';
  translationsMode: 'parallel' | 'priority';
  translations: TranslatorId[];
  clickArea: 'default' | 'left-right' | 'up-down' | 'none';
  speakLanguages: string[];
  pageTurnMode: 'page' | 'scroll';
  enableClickAnimition: boolean;
  indentSize?: number;
  enableSourceLabel: boolean;
  //
  fontWeight: number;
  fontSize: number;
  lineSpace: number;
  pageWidth: number;
  theme: {
    mode: 'light' | 'dark' | 'system' | 'custom';
    bodyColor: string;
    fontColor: string;
  };
  mixJpOpacity: number;
  mixZhOpacity: number;
  textUnderline: 'none' | 'solid' | 'dashed' | 'dotted';
}

export namespace ReaderSetting {
  const defaultTranslationOrder: TranslatorId[] = [
    'sakura',
    'gpt',
    'youdao',
    'baidu',
    'murasaki',
  ];

  export const defaultValue: ReaderSetting = {
    mode: 'zh-jp',
    translationsMode: 'priority',
    translations: [...defaultTranslationOrder],
    clickArea: 'default',
    speakLanguages: ['jp'],
    pageTurnMode: 'page',
    enableClickAnimition: true,
    enableSourceLabel: false,
    //
    fontWeight: 400,
    fontSize: 14,
    lineSpace: 1.0,
    pageWidth: 800,
    theme: {
      mode: 'system',
      bodyColor: '#FFFFFF',
      fontColor: '#000000',
    },
    mixJpOpacity: 0.4,
    mixZhOpacity: 0.75,
    textUnderline: 'none',
  };

  export const migrate = (setting: ReaderSetting) => {
    if (typeof setting.fontSize === 'string') {
      setting.fontSize = Number(
        (setting.fontSize as string).replace(/[^0-9]/g, ''),
      );
    }
    if ((setting.mode as unknown) === 'mix') {
      setting.mode = 'zh-jp';
    } else if ((setting.mode as unknown) === 'mix-reverse') {
      setting.mode = 'jp-zh';
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const theme = setting.theme as any;
    if (theme.isDark !== undefined) {
      if (theme.bodyColor === '#272727' && theme.fontColor === undefined) {
        setting.theme = {
          mode: 'dark',
          bodyColor: '#FFFFFF',
          fontColor: '#000000',
        };
      } else {
        setting.theme = {
          mode: 'light',
          bodyColor: '#FFFFFF',
          fontColor: '#000000',
        };
      }
    }
    if ('trimLeadingSpaces' in setting) {
      if (setting.trimLeadingSpaces) {
        setting.indentSize = 0;
      }
      delete setting.trimLeadingSpaces;
    }
    if (setting.translations === undefined) {
      setting.translations = [...defaultTranslationOrder];
    }
    setting.translations = ensureTranslatorLast(
      setting.translations,
      'murasaki',
    );
  };

  export const modeOptions = [
    { label: '日文', value: 'jp' },
    { label: '中文', value: 'zh' },
    { label: '中日', value: 'zh-jp' },
    { label: '日中', value: 'jp-zh' },
  ];
  export const translationModeOptions = [
    { label: '优先', value: 'priority' },
    { label: '并列', value: 'parallel' },
  ];

  export const clickAreaOptions = [
    { label: '默认', value: 'default' },
    { label: '左右', value: 'left-right' },
    { label: '上下', value: 'up-down' },
    { label: '关闭', value: 'none' },
  ];

  export const speakLanguagesOptions = [
    { label: '中文', value: 'zh' },
    { label: '日文', value: 'jp' },
  ];

  export const pageTurnModeOptions = [
    { label: '章节翻页', value: 'page' },
    { label: '滚动翻页', value: 'scroll' },
  ];

  export const fontWeightOptions = [
    { label: '正常', value: 400 },
    { label: '加粗', value: 600 },
  ];

  export const textUnderlineOptions = [
    { label: '关闭', value: 'none' },
    { label: '实线', value: 'solid' },
    { label: '虚线', value: 'dashed' },
    { label: '点状', value: 'dotted' },
  ];

  export const themeModeOptions = [
    { label: '浅色', value: 'light' },
    { label: '深色', value: 'dark' },
    { label: '跟随系统', value: 'system' },
    { label: '自定义', value: 'custom' },
  ];
  export const themeOptions = [
    { bodyColor: '#FFFFFF', fontColor: '#000000' },
    { bodyColor: '#FFF2E2', fontColor: '#000000' },
    { bodyColor: '#E3EDCD', fontColor: '#000000' },
    { bodyColor: '#E9EBFE', fontColor: '#000000' },
    { bodyColor: '#EAEAEF', fontColor: '#000000' },

    { bodyColor: '#000000', fontColor: '#FFFFFF' },
    { bodyColor: '#272727', fontColor: '#FFFFFF' },
  ];
}

export const useSettingStore = defineStore(LSKey.Setting, () => {
  const setting = useLocalStorage<Setting>(LSKey.Setting, Setting.defaultValue);
  Setting.migrate(setting.value);

  const cc = ref(defaultConverter);

  watch(
    () => setting.value.locale,
    async (locale) => {
      cc.value = await useOpenCC(locale);
    },
    { immediate: true },
  );

  return { setting, cc };
});

export const useReaderSettingStore = defineStore(LSKey.SettingReader, () => {
  const readerSetting = useLocalStorage<ReaderSetting>(
    LSKey.SettingReader,
    ReaderSetting.defaultValue,
  );
  ReaderSetting.migrate(readerSetting.value);
  return { readerSetting };
});
