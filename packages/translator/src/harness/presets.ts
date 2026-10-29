import type { PiAiProtocol } from '../translator/pi-ai-api';
import type { ModelCost } from '@earendil-works/pi-ai';
import { deepseekPresets } from './presets/deepseek';

export type HarnessOutputFormat = 'json' | 'paragraph-id' | 'lines';

/** 每个模型独立声明协议、翻译准则、输出格式和 API 参数。 */
export interface HarnessPreset {
  model: string;
  endpoint: string;
  protocol: PiAiProtocol;
  outputFormat: HarnessOutputFormat;
  rules: string;
  requestParams: Record<string, unknown>;
  /** 每百万 token 的人民币参考单价，仅用于费用估算。 */
  cost: ModelCost;
}

export interface HarnessPresetGroup {
  id: string;
  label: string;
  mode: 'harness';
  models: HarnessPreset[];
}

/** 工作区入口和表单共用的预设目录；目前仅注册 DeepSeek。 */
export const harnessPresets = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    mode: 'harness',
    models: deepseekPresets,
  },
] as const satisfies readonly HarnessPresetGroup[];

export type HarnessPresetId = (typeof harnessPresets)[number]['id'];

export function findHarnessPresetGroup(
  id: string | undefined,
): HarnessPresetGroup | undefined {
  return harnessPresets.find((preset) => preset.id === id);
}

export function getHarnessModelPreset(
  group: HarnessPresetGroup,
  model: string,
): HarnessPreset {
  const preset = group.models.find((preset) => preset.model === model);
  if (!preset)
    throw new Error(`Harness 预设 ${group.label} 中没有模型 ${model}`);
  return preset;
}
