import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FIELD_VALUE,
  resolveOpenAiProfile,
  openAiProfiles,
} from '../src/translator/llm-profiles';

// ============================================================
// 模型配置预设测试
// ============================================================
describe('模型配置预设', () => {
  // --- 场景 1：默认参数过滤 ---
  it('当思考强度选择服务端默认值时，应省略参数不发送', () => {
    for (const profile of openAiProfiles) {
      expect(
        resolveOpenAiProfile({
          id: profile.id,
          values: { reasoning_effort: DEFAULT_FIELD_VALUE },
        }).requestParams,
      ).toEqual({});
    }
  });

  // --- 场景 2：各协议特定参数映射 ---
  it('针对不同协议正确转换思考强度参数', () => {
    // OpenAI Completions: 标准 reasoning_effort
    expect(
      resolveOpenAiProfile({
        id: 'openai',
        values: { reasoning_effort: 'high' },
      }).requestParams,
    ).toEqual({
      reasoning_effort: 'high',
    });

    // OpenAI Responses: 嵌套在 reasoning.effort
    expect(
      resolveOpenAiProfile({
        id: 'openai-responses',
        values: { reasoning_effort: 'high' },
      }).requestParams,
    ).toEqual({ reasoning: { effort: 'high' } });

    // Anthropic Messages: adaptive thinking + output_config.effort
    expect(
      resolveOpenAiProfile({
        id: 'anthropic',
        values: { reasoning_effort: 'high' },
      }).requestParams,
    ).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });

    // DeepSeek: none 映射为 thinking disabled
    expect(
      resolveOpenAiProfile({
        id: 'deepseek',
        values: { reasoning_effort: 'none' },
      }).requestParams,
    ).toEqual({
      thinking: { type: 'disabled' },
    });

    // DeepSeek: low 映射为 thinking enabled + reasoning_effort
    expect(
      resolveOpenAiProfile({
        id: 'deepseek',
        values: { reasoning_effort: 'low' },
      }).requestParams,
    ).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    });

    // Gemini: reasoning_effort
    expect(
      resolveOpenAiProfile({
        id: 'gemini',
        values: { reasoning_effort: 'high' },
      }).requestParams,
    ).toEqual({ reasoning_effort: 'high' });
  });
});
