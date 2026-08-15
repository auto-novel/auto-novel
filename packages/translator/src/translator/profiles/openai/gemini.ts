import { defineProfile } from '../types';

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
        { label: 'none', value: 'none' },
        { label: 'minimal', value: 'minimal' },
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
      ],
    },
  ],
});
