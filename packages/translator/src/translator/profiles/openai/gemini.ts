import { defineProfile, DEFAULT_FIELD_VALUE } from '../types';

export const profile = defineProfile({
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
        { label: 'none', value: 'none' },
        { label: 'minimal', value: 'minimal' },
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
      ],
    },
  ],
});
