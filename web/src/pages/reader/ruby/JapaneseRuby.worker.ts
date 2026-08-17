import initLindera, {
  type Token,
  type Tokenizer,
  TokenizerBuilder,
} from 'lindera-wasm-ipadic';

import { buildRubySegments } from './JapaneseRubyTokens';
import type { RubyRequest, RubyResponse } from './types';

interface WorkerScope {
  onmessage: ((event: MessageEvent<RubyRequest>) => void) | null;
  postMessage(message: RubyResponse): void;
}

const workerScope = globalThis as unknown as WorkerScope;
let tokenizerPromise: Promise<Tokenizer> | undefined;

workerScope.onmessage = async ({ data }) => {
  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(data.text).map(toSourceToken);
    workerScope.postMessage({
      id: data.id,
      segments: buildRubySegments(tokens, data.text),
    });
  } catch (error) {
    workerScope.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

function getTokenizer(): Promise<Tokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      await initLindera();
      const builder = new TokenizerBuilder();
      builder.setDictionary('embedded://ipadic');
      builder.setMode('normal');
      builder.appendCharacterFilter('unicode_normalize', { kind: 'nfkc' });
      builder.appendTokenFilter('lowercase', {});
      builder.appendTokenFilter('japanese_compound_word', {
        kind: 'ipadic',
        tags: ['名詞,数'],
        new_tag: '名詞,数',
      });
      return builder.build();
    })();
  }
  return tokenizerPromise;
}

function toSourceToken(token: Token) {
  return {
    byteStart: token.byte_start,
    byteEnd: token.byte_end,
    text: token.surface,
    reading: token.details[7] ?? '*',
  };
}
