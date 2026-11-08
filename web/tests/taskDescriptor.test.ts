import { describe, expect, it } from 'vitest';
import {
  TranslateTaskDescriptor,
  type TranslateTaskParams,
} from '../src/domain/translator/tasks/task-descriptor';

const params: TranslateTaskParams = {
  level: 'all',
  forceMetadata: true,
  useBrowserCrawler: true,
  startIndex: 2,
  endIndex: 10,
};

describe('TranslateTaskDescriptor', () => {
  it.each([
    {
      task: TranslateTaskDescriptor.web('provider', 'novel', params),
      desc: { type: 'web', providerId: 'provider', novelId: 'novel' },
    },
    {
      task: TranslateTaskDescriptor.wenku('novel', '卷 /?中文', params),
      desc: { type: 'wenku', novelId: 'novel', volumeId: '卷 /?中文' },
    },
    {
      task: TranslateTaskDescriptor.local('卷 /?中文', params),
      desc: { type: 'local', volumeId: '卷 /?中文' },
    },
  ])('round-trips $desc.type tasks and parameters', ({ task, desc }) => {
    expect(TranslateTaskDescriptor.parse(task)).toEqual({ desc, params });
  });

  it('preserves the serialized format used as the queue key', () => {
    expect(TranslateTaskDescriptor.web('provider', 'novel', params)).toBe(
      'web/provider/novel?level=all&forceMetadata=true&useBrowserCrawler=true&startIndex=2&endIndex=10',
    );
  });

  it.each(['personal', 'personal2'])(
    'preserves the legacy %s local task prefix',
    (prefix) => {
      expect(TranslateTaskDescriptor.parse(`${prefix}/volume`).desc).toEqual({
        type: 'local',
        volumeId: 'volume',
      });
    },
  );

  it('uses safe defaults only for missing parameters', () => {
    expect(TranslateTaskDescriptor.parse('web/provider/novel').params).toEqual({
      level: 'normal',
      forceMetadata: false,
      useBrowserCrawler: false,
      startIndex: 0,
      endIndex: 65535,
    });
  });

  it('fills omitted ranges when building tasks without changing the queue key format', () => {
    const options = {
      level: 'normal' as const,
      forceMetadata: false,
      useBrowserCrawler: false,
    };
    const task = TranslateTaskDescriptor.local('volume', options);
    expect(task).toBe(
      'local/volume?level=normal&forceMetadata=false&useBrowserCrawler=false&startIndex=0&endIndex=65535',
    );
    expect(TranslateTaskDescriptor.parse(task).params).toEqual({
      ...options,
      startIndex: 0,
      endIndex: 65535,
    });
    expect(
      TranslateTaskDescriptor.parse(
        TranslateTaskDescriptor.web('provider', 'novel', {
          ...options,
          endIndex: 5,
        }),
      ).params,
    ).toEqual({ ...options, startIndex: 0, endIndex: 5 });
  });

  it.each([
    [0, 65535, ''],
    [0, 65536, ''],
    [2, 65535, '[2,Inf)'],
    [0, 5, '[0,5)'],
  ])(
    'formats the range [%s,%s) without exposing its default',
    (startIndex, endIndex, label) => {
      expect(
        TranslateTaskDescriptor.formatRange({
          ...params,
          startIndex,
          endIndex,
        }),
      ).toBe(label);
    },
  );

  it('preserves explicit legacy ranges instead of rewriting queue keys', () => {
    const task =
      'local/volume?level=expire&forceMetadata=false&useBrowserCrawler=false&startIndex=0&endIndex=65536';
    const parsed = TranslateTaskDescriptor.parse(task);
    expect(parsed.params.endIndex).toBe(65536);
    expect(TranslateTaskDescriptor.local('volume', parsed.params)).toBe(task);
  });

  it.each([
    'unknown/volume',
    'web/provider',
    'web//novel',
    'wenku/novel/',
    'local/volume/extra',
    'local/%20',
    'local/%ZZ',
  ])('rejects malformed task paths: %s', (task) => {
    expect(() => TranslateTaskDescriptor.parse(task)).toThrow();
  });

  it.each([
    'level=invalid',
    'forceMetadata=1',
    'startIndex=-1',
    'startIndex=1.5',
    'startIndex=2abc',
    'startIndex=',
    'endIndex=9007199254740992',
    'startIndex=10&endIndex=2',
  ])('rejects explicitly invalid parameters: %s', (query) => {
    expect(() =>
      TranslateTaskDescriptor.parse(`local/volume?${query}`),
    ).toThrow();
  });

  it('validates newly built tasks and permits an empty chapter range', () => {
    expect(() => TranslateTaskDescriptor.web('', 'novel', params)).toThrow();
    expect(() =>
      TranslateTaskDescriptor.local('volume', { ...params, startIndex: -1 }),
    ).toThrow('无效的章节范围');
    expect(
      TranslateTaskDescriptor.parse(
        TranslateTaskDescriptor.local('volume', { ...params, endIndex: 2 }),
      ).params,
    ).toEqual({ ...params, endIndex: 2 });
  });
});
