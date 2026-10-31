import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FIELD_VALUE,
  buildOpenAiProfileParams,
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
        buildOpenAiProfileParams(profile.id, {
          reasoning_effort: DEFAULT_FIELD_VALUE,
        }),
      ).toEqual({});
    }
  });

  // --- 场景 2：各协议特定参数映射 ---
  it('针对不同协议正确转换思考强度参数', () => {
    // OpenAI Completions: 标准 reasoning_effort
    expect(
      buildOpenAiProfileParams('openai', { reasoning_effort: 'high' }),
    ).toEqual({
      reasoning_effort: 'high',
    });

    // OpenAI Responses: 嵌套在 reasoning.effort
    expect(
      buildOpenAiProfileParams('openai-responses', {
        reasoning_effort: 'high',
      }),
    ).toEqual({ reasoning: { effort: 'high' } });

    // Anthropic Messages: adaptive thinking + output_config.effort
    expect(
      buildOpenAiProfileParams('anthropic', { reasoning_effort: 'high' }),
    ).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });

    // DeepSeek: none 映射为 thinking disabled
    expect(
      buildOpenAiProfileParams('deepseek', { reasoning_effort: 'none' }),
    ).toEqual({
      thinking: { type: 'disabled' },
    });

    // DeepSeek: low 映射为 thinking enabled + reasoning_effort
    expect(
      buildOpenAiProfileParams('deepseek', { reasoning_effort: 'low' }),
    ).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    });

    // Gemini: reasoning_effort
    expect(
      buildOpenAiProfileParams('gemini', { reasoning_effort: 'high' }),
    ).toEqual({ reasoning_effort: 'high' });
  });
});
