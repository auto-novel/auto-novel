type SelectField = {
  key: string;
  label: string;
  type: 'select';
  options: readonly {
    label: string;
    value: string | number | boolean;
  }[];
};

type NumberField = {
  key: string;
  label: string;
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
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
  id: Id;
  apiFormat: 'openai';
  label: string;
  fields: Fields;

  buildRequestParams?(
    values: ProfileValues<NoInfer<Fields>>,
  ): Record<string, unknown>;
}

export const defineProfile = <
  const Fields extends readonly ProfileField[],
  const Id extends string,
>(
  profile: TranslatorProfile<Fields, Id>,
): TranslatorProfile<Fields, Id> => profile;
