import {
  DEFAULT_FIELD_VALUE,
  type ProfileValues,
  type TranslatorProfile,
} from '../types';
import { profile as deepSeek } from './deepseek';
import { profile as gemini } from './gemini';
import { profile as openAi } from './openai';

export const openAiProfiles = [openAi, deepSeek, gemini] as const;

export type openAiProfileId = (typeof openAiProfiles)[number]['id'];

const stripDefault = (values: ProfileValues): ProfileValues => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (
      value === undefined ||
      value === null ||
      value === DEFAULT_FIELD_VALUE
    ) {
      continue;
    }
    result[key] = value;
  }
  return result as ProfileValues;
};

export const buildOpenAiProfileParams = (
  id: openAiProfileId | undefined,
  values: ProfileValues = {},
): Record<string, unknown> => {
  if (!id) return {};

  const profile: TranslatorProfile | undefined = openAiProfiles.find(
    (profile) => profile.id === id,
  );

  if (!profile) return {};

  const _values = stripDefault(values);
  return profile.buildRequestParams?.(_values) ?? _values;
};
