import { afterEach, expect, it, vi } from 'vitest';
import { translateChapter } from '../src/harness';
import { harnessPresets } from '../src/harness/presets';
import { createPiAiCompletion } from '../src/translator/llm-client';

vi.mock('../src/translator/llm-client', () => ({
  createPiAiCompletion: vi.fn(),
}));

const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const preset = {
  ...harnessPresets[0].models[0],
  outputFormat: 'paragraph-id' as const,
};

afterEach(() => vi.resetAllMocks());

it('keeps whole-chapter context, batch numbering, blank lines and indentation', async () => {
  const source = Array.from({ length: 22 }, (_, index) => `source-${index}`);
  source[0] = '  source-0';
  source[1] = '';
  vi.mocked(createPiAiCompletion).mockImplementation(async (request) => {
    const prompt = request.messages[1].content;
    const batch = prompt.match(
      /<current_batch>\n([\s\S]*?)\n<\/current_batch>/,
    )![1];
    request.onUsage?.(usage);
    return {
      text: batch
        .split('\n')
        .map((line) => {
          const id = line.split('#')[0];
          return `${id}#translation-${Number(id.slice(1))}`;
        })
        .join('\n'),
      usage,
    };
  });
  const onUsage = vi.fn();
  const onBatchesReady = vi.fn();
  const result = await translateChapter({
    source,
    glossary: {},
    preset,
    apiKey: 'key',
    onUsage,
    onBatchesReady,
  });
  expect(result).toEqual(
    source.map((line, index) =>
      !line ? '' : `${index === 0 ? '  ' : ''}translation-${index}`,
    ),
  );
  expect(onBatchesReady).toHaveBeenCalledWith([
    { index: 0, start: 0, end: 20 },
    { index: 1, start: 20, end: 22 },
  ]);
  expect(createPiAiCompletion).toHaveBeenCalledTimes(2);
  expect(
    vi.mocked(createPiAiCompletion).mock.calls[0][0].messages[1].content,
  ).toContain('p0021#source-21');
  expect(
    vi.mocked(createPiAiCompletion).mock.calls[1][0].messages[1].content,
  ).toContain('p0000#  translation-0');
  expect(onUsage).toHaveBeenCalledTimes(2);
});

it('keeps the existing correction budget and binary split recovery', async () => {
  const completion = vi.mocked(createPiAiCompletion);
  for (let index = 0; index < 4; index++) {
    completion.mockResolvedValueOnce({ text: 'invalid', usage });
  }
  completion.mockResolvedValueOnce({ text: 'p0000#left', usage });
  completion.mockResolvedValueOnce({ text: 'p0001#right', usage });
  const onBatchComplete = vi.fn();
  await expect(
    translateChapter({
      source: ['one', 'two'],
      glossary: {},
      preset,
      apiKey: 'key',
      onBatchComplete,
    }),
  ).resolves.toEqual(['left', 'right']);
  expect(completion).toHaveBeenCalledTimes(6);
  expect(onBatchComplete).toHaveBeenCalledExactlyOnceWith(
    { index: 0, start: 0, end: 2 },
    ['left', 'right'],
  );
});

it('does not accept a response after cancellation', async () => {
  const controller = new AbortController();
  vi.mocked(createPiAiCompletion).mockImplementationOnce(async () => {
    controller.abort();
    return { text: 'p0000#late', usage };
  });
  const onBatchComplete = vi.fn();
  await expect(
    translateChapter({
      source: ['one'],
      glossary: {},
      preset,
      apiKey: 'key',
      signal: controller.signal,
      onBatchComplete,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(onBatchComplete).not.toHaveBeenCalled();
});
