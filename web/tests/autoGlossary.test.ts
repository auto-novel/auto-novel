import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalTranslationTask } from '../src/domain/translator/tasks/local-task';
import { WorkPreparer } from '../src/domain/translator/prepare-work';
import type {
  PreparedUnit,
  TranslationTask,
} from '../src/domain/translator/tasks/task';

const mocks = vi.hoisted(() => ({
  store: {
    getVolume: vi.fn(),
    getChapter: vi.fn(),
    updateTranslation: vi.fn(),
  },
}));
vi.mock('@/stores', () => ({ useLocalVolumeStore: async () => mocks.store }));
const params = {
  level: 'normal' as const,
  forceMetadata: false,
  useBrowserCrawler: false,
  startIndex: 0,
  endIndex: 10,
};
const sample = ['アルテは歩いた。', 'アルテが止まった。'];
const result = JSON.stringify([
  { source: 'アルテ', target: '阿尔蒂', kind: 'person', important: true },
]);
const context = () => ({
  signal: new AbortController().signal,
  onLog: vi.fn(),
});
const unit = {
  kind: 'chapter' as const,
  chapterId: '1',
  title: 'chapter',
  order: 0,
  status: 'pending' as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.store.getVolume.mockResolvedValue({
    toc: [{ chapterId: '1' }, { chapterId: '2', gpt: 'old-version' }],
    glossary: {},
    glossaryId: 'old-version',
  });
  mocks.store.getChapter.mockResolvedValue({ paragraphs: sample });
});

describe('本地自动术语任务', () => {
  it('默认关闭、Sakura 和已有术语表均沿用正文流程', async () => {
    for (const [translator, enabled, glossary] of [
      ['gpt', false, {}],
      ['sakura', true, {}],
      ['gpt', true, { アルテ: '已有译名' }],
    ] as const) {
      mocks.store.getVolume.mockResolvedValue({
        toc: [{ chapterId: '1' }],
        glossary,
        glossaryId: 'old-version',
      });
      const task = new LocalTranslationTask('volume', translator, params, {
        autoGlossary: () => enabled,
      });
      await task.initialize(context());
      expect((await task.prepareUnit(unit, context())).purpose).toBeUndefined();
      expect(task.preparing).toBe(false);
    }
  });
  it('只分析一次并仅影响当前任务，原有术语版本和已完成章节不变', async () => {
    const task = new LocalTranslationTask('volume', 'gpt', params, {
      autoGlossary: () => true,
    });
    await task.initialize(context());
    expect(task.chapters.map((chapter) => chapter.chapterId)).toEqual(['1']);
    const analysis = await task.prepareUnit(unit, context());
    expect(analysis.purpose).toBe('glossary');
    expect(task.preparing).toBe(true);
    await analysis.save([result]);
    analysis.finalize?.(false);
    const chapter = await task.prepareUnit(unit, context());
    expect(chapter.purpose).toBeUndefined();
    expect(chapter.glossary).toEqual({ アルテ: '阿尔蒂' });
    await chapter.save(['译文一', '译文二']);
    expect(mocks.store.updateTranslation).toHaveBeenCalledWith(
      'volume',
      '1',
      'gpt',
      {
        glossaryId: 'old-version',
        glossary: { アルテ: '阿尔蒂' },
        paragraphs: ['译文一', '译文二'],
      },
      expect.any(Function),
    );
    expect(task.chapters.map((chapter) => chapter.chapterId)).toEqual(['1']);
    expect(Object.keys(mocks.store)).toEqual([
      'getVolume',
      'getChapter',
      'updateTranslation',
    ]);
  });
  it('分析过程中关闭开关丢弃结果，取消则允许下次重试', async () => {
    let enabled = true;
    const task = new LocalTranslationTask('volume', 'gpt', params, {
      autoGlossary: () => enabled,
    });
    await task.initialize(context());
    const first = await task.prepareUnit(unit, context());
    first.finalize?.(true);
    expect((await task.prepareUnit(unit, context())).purpose).toBe('glossary');
    const pending = await task.prepareUnit(unit, context());
    enabled = false;
    await pending.save([result]);
    pending.finalize?.(false);
    expect((await task.prepareUnit(unit, context())).glossary).toEqual({});
  });
});

describe('术语准备单元的结算', () => {
  it.each(['success', 'failure', 'abort'] as const)(
    '分析%s后章节仍待翻译，不保存候选为正文',
    async (outcome) => {
      const finalize = vi.fn();
      const save = vi.fn();
      const task: TranslationTask = {
        type: 'local',
        initialized: true,
        chapters: [{ ...unit, completed: false }],
        initialize: vi.fn(),
        prepareUnit: vi.fn().mockResolvedValue({
          lines: [JSON.stringify(sample)],
          glossary: {},
          purpose: 'glossary',
          save,
          finalize,
        } satisfies PreparedUnit),
      };
      const tracker = {
        onUnitStatus: vi.fn(),
        onLog: vi.fn(),
        onChapterSaved: vi.fn(),
      };
      const work = (await new WorkPreparer(task).prepareUnit(
        unit,
        tracker,
        context().signal,
      ))!;
      expect(work.purpose).toBe('glossary');
      if (outcome === 'abort') await work.onAbort();
      else
        await work.onComplete({
          lines: [result],
          failed:
            outcome === 'failure'
              ? [{ order: 0, error: new Error('failed') }]
              : [],
        });
      expect(save).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0);
      expect(finalize).toHaveBeenCalledExactlyOnceWith(outcome === 'abort');
      expect(tracker.onUnitStatus).toHaveBeenLastCalledWith('1', 'pending');
      expect(tracker.onChapterSaved).not.toHaveBeenCalled();
    },
  );
});
