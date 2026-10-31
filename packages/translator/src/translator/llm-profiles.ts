// 配置字段与类型。
type SelectField = {
  readonly key: string;
  readonly label: string;
  readonly type: 'select';
  readonly options: readonly {
    readonly label: string;
    readonly value: string | number;
  }[];
};

type NumberField = {
  readonly key: string;
  readonly label: string;
  readonly type: 'number';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
};

export type ProfileField = SelectField | NumberField;

type FieldValue<Field extends ProfileField> = Field extends SelectField
  ? Field['options'][number]['value']
  : Field extends NumberField
    ? number
    : never;

export type ProfileValues<
  Fields extends readonly ProfileField[] = readonly ProfileField[],
> = {
  [Field in Fields[number] as Field['key']]?: FieldValue<Field>;
};

export interface TranslatorProfile<
  Fields extends readonly ProfileField[] = readonly ProfileField[],
  Id extends string = string,
> {
  readonly id: Id;
  readonly apiFormat: 'openai' | 'openai-responses' | 'anthropic-messages';
  readonly label: string;
  readonly fields: Fields;

  readonly buildRequestParams?: (
    values: ProfileValues<NoInfer<Fields>>,
  ) => Record<string, unknown>;
}

export const defineProfile = <
  const Fields extends readonly ProfileField[],
  const Id extends string,
>(
  profile: TranslatorProfile<Fields, Id>,
): TranslatorProfile<Fields, Id> => profile;

// 公共选项。
export const DEFAULT_FIELD_VALUE = '__default__' as const;

export const reasoningFields = [
  {
    key: 'reasoning_effort',
    label: '思考强度',
    type: 'select',
    options: [
      { label: '默认', value: DEFAULT_FIELD_VALUE },
      { label: 'none', value: 'none' },
      { label: 'minimal', value: 'minimal' },
      { label: 'low', value: 'low' },
      { label: 'medium', value: 'medium' },
      { label: 'high', value: 'high' },
      { label: 'xhigh', value: 'xhigh' },
      { label: 'max', value: 'max' },
    ],
  },
] as const;

export const resolveReasoningEffort = (
  values: ProfileValues<typeof reasoningFields>,
): string | undefined => {
  const effort = values.reasoning_effort;
  if (!effort || effort === DEFAULT_FIELD_VALUE) return undefined;
  return effort;
};

// 各服务商配置。
const deepSeekProfile = defineProfile({
  id: 'deepseek',
  apiFormat: 'openai',
  label: 'DeepSeek',
  fields: [
    {
      key: 'reasoning_effort',
      label: '思考强度',
      type: 'select',
      options: [
        { label: '默认', value: DEFAULT_FIELD_VALUE },
        { label: 'none', value: 'none' },
        { label: 'low', value: 'low' },
        { label: 'high', value: 'high' },
        { label: 'max', value: 'max' },
      ],
    },
  ],
  buildRequestParams: ({ reasoning_effort }) => {
    if (!reasoning_effort) return {};

    if (reasoning_effort === 'none') {
      return {
        thinking: {
          type: 'disabled',
        },
      };
    }

    return {
      thinking: {
        type: 'enabled',
      },
      reasoning_effort,
    };
  },
});

const openAiProfile = defineProfile({
  id: 'openai',
  apiFormat: 'openai',
  label: 'OpenAI Chat Completions',
  fields: reasoningFields,
  buildRequestParams: (values) => {
    const effort = resolveReasoningEffort(values);
    return effort ? { reasoning_effort: effort } : {};
  },
});

const responsesProfile = defineProfile({
  id: 'openai-responses',
  apiFormat: 'openai-responses',
  label: 'OpenAI Responses',
  fields: reasoningFields,
  buildRequestParams: (values) => {
    const effort = resolveReasoningEffort(values);
    return effort ? { reasoning: { effort } } : {};
  },
});

const anthropicProfile = defineProfile({
  id: 'anthropic',
  apiFormat: 'anthropic-messages',
  label: 'Anthropic Messages',
  fields: [
    {
      key: 'reasoning_effort',
      label: '思考强度',
      type: 'select',
      options: [
        { label: '默认', value: DEFAULT_FIELD_VALUE },
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
        { label: 'xhigh', value: 'xhigh' },
        { label: 'max', value: 'max' },
      ],
    },
  ],
  buildRequestParams: ({ reasoning_effort }) =>
    reasoning_effort
      ? {
          thinking: { type: 'adaptive' },
          output_config: { effort: reasoning_effort },
        }
      : {},
});

const geminiProfile = defineProfile({
  id: 'gemini',
  apiFormat: 'openai',
  label: 'Gemini',
  fields: [
    {
      key: 'reasoning_effort',
      label: '思考强度',
      type: 'select',
      options: [
        { label: '默认', value: DEFAULT_FIELD_VALUE },
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
      ],
    },
  ],
});

// 注册顺序与请求参数转换。
export const openAiProfiles = [
  deepSeekProfile,
  openAiProfile,
  responsesProfile,
  anthropicProfile,
  geminiProfile,
] as const;

export type openAiProfileId = (typeof openAiProfiles)[number]['id'];

/** 已确认的配置；每个 id 只接受其注册字段和选项。 */
export type OpenAiProfileSelection = {
  [Profile in (typeof openAiProfiles)[number] as Profile['id']]: {
    readonly id: Profile['id'];
    readonly values?: Readonly<ProfileValues<Profile['fields']>>;
  };
}[openAiProfileId];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 校验动态/持久化配置；旧数据中的 null、undefined 参数仍按未设置处理。 */
export function parseOpenAiProfileSelection(
  value: unknown,
): OpenAiProfileSelection {
  if (!isRecord(value)) throw new TypeError('模型配置必须是对象');
  const profile: TranslatorProfile | undefined = openAiProfiles.find(
    (profile) => profile.id === value.id,
  );
  if (!profile) throw new TypeError(`未知的模型配置：${String(value.id)}`);

  const values = isRecord(value.values)
    ? Object.fromEntries(
        Object.entries(value.values).filter(([, item]) => item != null),
      )
    : value.values;
  if (values !== undefined && !isRecord(values)) {
    throw new TypeError('模型配置参数必须是对象');
  }

  for (const [key, fieldValue] of Object.entries(values ?? {})) {
    const field = profile.fields.find((field) => field.key === key);
    if (!field) throw new TypeError(`模型配置 ${profile.id} 不支持参数 ${key}`);
    const valid =
      field.type === 'select'
        ? field.options.some((option) => option.value === fieldValue)
        : typeof fieldValue === 'number' &&
          Number.isFinite(fieldValue) &&
          (field.min === undefined || fieldValue >= field.min) &&
          (field.max === undefined || fieldValue <= field.max);
    if (!valid)
      throw new TypeError(`模型配置 ${profile.id} 的参数 ${key} 无效`);
  }

  return { id: profile.id, values } as OpenAiProfileSelection;
}

const stripDefault = (values: ProfileValues): ProfileValues => {
  const result: ProfileValues = {};
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
  return result;
};

export const buildOpenAiProfileParams = (
  id: openAiProfileId | undefined,
  values: ProfileValues = {},
): Record<string, unknown> => {
  if (!id) return {};

  const selection = parseOpenAiProfileSelection({ id, values });
  const profile: TranslatorProfile | undefined = openAiProfiles.find(
    (profile) => profile.id === selection.id,
  );

  if (!profile) return {};

  const _values = stripDefault(selection.values ?? {});
  return profile.buildRequestParams?.(_values) ?? _values;
};
