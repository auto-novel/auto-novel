type Locale = 'origin' | 'zh-cn' | 'zh-tw';

type Converter = {
  toView: (text: string) => string;
  toData: (text: string) => string;
};

export const defaultConverter: Converter = {
  toView: (text: string) => text,
  toData: (text: string) => text,
};

export async function useOpenCC(locale: Locale) {
  if (locale === 'origin') {
    return defaultConverter;
  } else if (locale === 'zh-cn') {
    const opencc: any = await import('opencc-js');
    const ccLocale = opencc.Locale;
    return {
      toView: opencc.ConverterFactory(ccLocale.from.tw, ccLocale.to.cn),
      toData: (text: string) => text,
    };
  } else if (locale === 'zh-tw') {
    const opencc: any = await import('opencc-js');
    const ccLocale = opencc.Locale;
    const customDict = [
      ['託', '托'],
      ['孃', '娘'],
    ];
    return {
      toView: opencc.ConverterFactory(ccLocale.from.cn, ccLocale.to.tw, [
        customDict,
      ]),
      toData: opencc.ConverterFactory(ccLocale.from.tw, ccLocale.to.cn),
    };
  }
  return locale satisfies never;
}
