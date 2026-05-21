import type { PromptBuilder, SegmentContext } from '@/types';

import type { SakuraVersion } from './sakura-translator';

export type ModelMeta = Record<string, number>;

export const allowModels: {
  [key: string]: { repo: string; meta: ModelMeta };
} = {
  'sakura-14b-qwen2.5-v1.0-iq4xs': {
    repo: 'SakuraLLM/Sakura-14B-Qwen2.5-v1.0-GGUF',
    meta: {
      vocab_type: 2,
      n_vocab: 152064,
      n_ctx_train: 131072,
      n_embd: 5120,
      n_params: 14770033664,
      size: 8180228096,
    },
  },
  'sakura-14b-qwen2.5-v1.0-q6k': {
    repo: 'SakuraLLM/Sakura-14B-Qwen2.5-v1.0-GGUF',
    meta: {
      vocab_type: 2,
      n_vocab: 152064,
      n_ctx_train: 131072,
      n_embd: 5120,
      n_params: 14770033664,
      size: 12118716416,
    },
  },
  'sakura-14b-qwen2beta-v0.9.2-iq4xs': {
    repo: 'SakuraLLM/Sakura-14B-Qwen2beta-v0.9.2-GGUF',
    meta: {
      vocab_type: 2,
      n_vocab: 152064,
      n_ctx_train: 32768,
      n_embd: 5120,
      n_params: 14167290880,
      size: 7908392960,
    },
  },
  'sakura-32b-qwen2beta-v0.9-iq4xs': {
    repo: 'SakuraLLM/Sakura-32B-Qwen2beta-v0.9-GGUF',
    meta: {
      vocab_type: 2,
      n_vocab: 152064,
      n_ctx_train: 32768,
      n_embd: 5120,
      n_params: 32512218112,
      size: 17728790528,
    },
  },
};

export const createSakuraPromptBuilder = (
  version: SakuraVersion,
): PromptBuilder => {
  const build = (lines: string[], context?: SegmentContext) => {
    const glossary = context?.glossary ?? {};
    const prevSegs = context?.prevSegs;
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];

    // Normalize full-width digits to half-width
    const normalizedLines = lines.map((line) =>
      line.replace(/[\uff10-\uff19]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
      ),
    );
    const text = normalizedLines.join('\n');

    const prevText =
      prevSegs && prevSegs.length > 0 ? prevSegs.flat().join('\n') : '';

    if (version === '1.0') {
      messages.push({
        role: 'system',
        content:
          '你是一个轻小说翻译模型，可以流畅通顺地以日本轻小说的风格将日文翻译成简体中文，并联系上下文正确使用人称代词，不擅自添加原文中没有的代词。',
      });
      if (prevText) {
        messages.push({ role: 'assistant', content: prevText });
      }
      if (Object.keys(glossary).length === 0) {
        messages.push({
          role: 'user',
          content: `将下面的日文文本翻译成中文：${text}`,
        });
      } else {
        const glossaryHint = Object.entries(glossary)
          .map(([jp, zh]) => `${jp}->${zh}`)
          .join('\n');
        messages.push({
          role: 'user',
          content: `根据以下术语表（可以为空）：\n${glossaryHint}\n将下面的日文文本根据对应关系和备注翻译成中文：${text}`,
        });
      }
    } else if (version === '0.10') {
      messages.push({
        role: 'system',
        content:
          '你是一个轻小说翻译模型，可以流畅通顺地使用给定的术语表以日本轻小说的风格将日文翻译成简体中文，并联系上下文正确使用人称代词，注意不要混淆使役态和被动态的主语和宾语，不要擅自添加原文中没有的代词，也不要擅自增加或减少换行。',
      });
      if (prevText) {
        messages.push({ role: 'assistant', content: prevText });
      }
      const glossaryHint = Object.entries(glossary)
        .map(([jp, zh]) => `${jp}->${zh}`)
        .join('\n');
      messages.push({
        role: 'user',
        content: `根据以下术语表（可以为空）：\n${glossaryHint}\n\n将下面的日文文本根据上述术语表的对应关系和备注翻译成中文：${text}`,
      });
    } else {
      // v0.8 / v0.9
      messages.push({
        role: 'system',
        content:
          '你是一个轻小说翻译模型，可以流畅通顺地以日本轻小说的风格将日文翻译成简体中文，并联系上下文正确使用人称代词，不擅自添加原文中没有的代词。',
      });
      if (prevText) {
        messages.push({ role: 'assistant', content: prevText });
      }
      // 对于术语表直接替换
      let replacedText = text;
      for (const wordJp of Object.keys(glossary).sort(
        (a, b) => b.length - a.length,
      )) {
        replacedText = replacedText.replaceAll(wordJp, glossary[wordJp]);
      }
      messages.push({
        role: 'user',
        content: `将下面的日文文本翻译成中文：${replacedText}`,
      });
    }

    return messages;
  };

  const parseAnswer = (answer: string, _originalLines: string[]): string[] => {
    const splitText = answer.replaceAll('<|im_end|>', '').split('\n');
    return splitText;
  };

  return { build, parseAnswer };
};
