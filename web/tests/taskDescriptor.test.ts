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

  it.each(['personal', 'personal2'])(
    'preserves the legacy %s local task prefix',
    (prefix) => {
      expect(TranslateTaskDescriptor.parse(`${prefix}/volume`).desc).toEqual({
        type: 'local',
        volumeId: 'volume',
      });
    },
  );

  it('preserves defaults for missing flags and invalid chapter indices', () => {
    expect(
      TranslateTaskDescriptor.parse(
        'web/provider/novel?level=normal&startIndex=invalid',
      ).params,
    ).toEqual({
      level: 'normal',
      forceMetadata: false,
      useBrowserCrawler: false,
      startIndex: 0,
      endIndex: 65535,
    });
  });

  it('rejects unknown task prefixes', () => {
    expect(() => TranslateTaskDescriptor.parse('unknown/volume')).toThrow(
      'quit',
    );
  });
});
