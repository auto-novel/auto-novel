import type { ProfileValues, TranslatorProfile } from '../types';

import { profile as deepSeek } from './deepseek';
import { profile as gemini } from './gemini';
import { profile as openAi } from './openai';

export const openAiProfies = [openAi, deepSeek, gemini] as const;

export type openAiProfileId = (typeof openAiProfies)[number]['id'];

export const buildOpenAiProfileParams = (
  id: openAiProfileId | undefined,
  values: ProfileValues = {},
): Record<string, unknown> => {
  if (!id) return {};

  const profile: TranslatorProfile | undefined = openAiProfies.find(
    (profile) => profile.id === id,
  );

  if (!profile) return {};

  return profile.buildRequestParams?.(values) ?? values;
};
