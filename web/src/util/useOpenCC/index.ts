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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opencc: any = await import('opencc-js');
    const ccLocale = opencc.Locale;
    const customDict = [
      ['托', '託'],
      ['娘', '孃'],
    ];
    return {
      toView: opencc.ConverterFactory(ccLocale.from.tw, ccLocale.to.cn, [
        customDict,
      ]),
      toData: (text: string) => text,
    };
  } else if (locale === 'zh-tw') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
