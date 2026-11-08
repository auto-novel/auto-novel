import type { Glossary } from '@/types';

/** 预置短占位符，避免与原文中的单词碰撞。 */
const PRESET_TOKENS = [
  'kie',
  'rgx',
  'wfv',
  'oyg',
  'yhs',
  'rvy',
  'dpt',
  'wkj',
  'gzg',
  'xef',
  'efx',
  'ugx',
  'woz',
  'peh',
  'rjp',
  'eon',
  'ayj',
  'gkp',
  'wie',
  'yla',
];

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/**
 * 有道无法通过提示词使用术语表，改为把术语替换成占位符再还原。
 * 术语值中 `#` 之后是备注，替换进正文会污染译文，因此只保留前半段。
 */
export function createGlossaryCodec(glossary: Glossary) {
  const words = Object.keys(glossary).sort((a, b) => b.length - a.length);
  const wordToToken: Record<string, string> = {};
  const tokenToWord: Record<string, string> = {};
  const usedTokens: string[] = [];
  let presetIndex = 0;

  const nextToken = (): string => {
    const preset = PRESET_TOKENS[presetIndex++];
    if (preset !== undefined) {
      usedTokens.push(preset);
      return preset;
    }
    for (;;) {
      const token = Array.from(
        { length: 4 },
        () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
      ).join('');
      // 连续重复或包含已用占位符都跳过，避免替换互相干扰。
      if (/(.)\1/.test(token)) continue;
      if (usedTokens.some((used) => token.includes(used))) continue;
      usedTokens.push(token);
      return token;
    }
  };

  for (const word of words) {
    const token = nextToken();
    wordToToken[word] = token;
    tokenToWord[token] = glossary[word].split('#')[0].trim();
  }
  const tokens = Object.keys(tokenToWord).sort((a, b) => b.length - a.length);

  return {
    /** 把术语换成 `$占位符`，长的术语优先。 */
    encode(lines: readonly string[]): string[] {
      return lines.map((line) => {
        let encoded = line;
        for (const word of words) {
          encoded = encoded.replaceAll(word, `$${wordToToken[word]}`);
        }
        return encoded;
      });
    },

    /** 把占位符还原成术语译名，容忍译文里多余的 `$ ` 或丢失 `$`。 */
    decode(lines: readonly string[]): string[] {
      return lines.map((line) => {
        let decoded = line;
        for (const token of tokens) {
          decoded = decoded
            .replaceAll(`$${token}`, tokenToWord[token])
            .replaceAll(`$ ${token}`, tokenToWord[token])
            .replaceAll(token, tokenToWord[token]);
        }
        return decoded;
      });
    },
  };
}
