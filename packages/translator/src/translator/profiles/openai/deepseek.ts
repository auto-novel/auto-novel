import { defineProfile } from '../types';

export const profile = defineProfile({
  id: 'deepseek',
  apiFormat: 'openai',
  label: 'DeepSeek',
  fields: [
    {
      key: 'reasoning_effort',
      label: '思考强度',
      type: 'select',
      options: [
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
