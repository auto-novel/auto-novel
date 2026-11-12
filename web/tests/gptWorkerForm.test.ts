// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, computed, h, nextTick, reactive, ref, type App } from 'vue';
import UForm from '@nuxt/ui/components/Form.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import type { Form, FormSchema } from '@nuxt/ui';

import {
  validateGptWorker,
  validateGptWorkerBatch,
} from '../src/pages/workspace/worker/gptWorkerForm';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.replaceChildren();
});

const worker = {
  id: 'worker',
  model: 'model',
  key: 'sk-key',
  endpoint: 'https://api.deepseek.com',
  concurrency: 1,
};

describe('GPT worker validation', () => {
  it('keeps required, unique-name, endpoint and integer concurrency checks', () => {
    expect(validateGptWorker(worker, [])).toEqual([]);
    expect(
      validateGptWorker({ ...worker, id: ' ', model: '', key: '' }, []).map(
        (error) => error.name,
      ),
    ).toEqual(['id', 'model', 'key']);
    expect(validateGptWorker(worker, [{ id: worker.id }])).toContainEqual({
      name: 'id',
      message: '名字不能重复',
    });
    for (const concurrency of [0, 101, 1.5, NaN]) {
      expect(validateGptWorker({ ...worker, concurrency }, [])).toContainEqual({
        name: 'concurrency',
        message: '并发数需为 1~100 的整数',
      });
    }
    for (const endpoint of ['', 'not a URL', 'ftp://example.com']) {
      expect(
        validateGptWorker({ ...worker, endpoint }, []).some(
          (error) => error.name === 'endpoint',
        ),
      ).toBe(true);
    }
    expect(
      validateGptWorker(
        { ...worker, concurrency: 100, endpoint: 'http://localhost:8080' },
        [],
      ),
    ).toEqual([]);
  });

  it('validates non-empty and duplicate batch lines after trimming', () => {
    const state = {
      endpoint: worker.endpoint,
      models: ' model-a\n\nmodel-b ',
      keys: ' sk-a\nsk-b ',
    };
    expect(validateGptWorkerBatch(state)).toEqual([]);
    expect(
      validateGptWorkerBatch({ ...state, models: ' \n', keys: '' }).map(
        (error) => error.name,
      ),
    ).toEqual(['models', 'keys']);
    expect(
      validateGptWorkerBatch({
        ...state,
        models: 'model\n model ',
        keys: 'key\nkey',
      }),
    ).toEqual([
      { name: 'models', message: '存在重复的模型名' },
      { name: 'keys', message: '存在重复的Key' },
    ]);
  });

  it('uses native field events with current computed state and blocks invalid submits', async () => {
    const input = reactive({ models: '', keys: '' });
    const state = computed(() => ({ endpoint: worker.endpoint, ...input }));
    const form = ref<Form<FormSchema> | null>(null);
    const saved = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    app = createApp({
      setup: () => () =>
        h(
          UForm,
          {
            ref: form,
            state: state.value,
            validate: () => validateGptWorkerBatch(state.value),
            validateOn: ['input', 'change'],
            validateOnInputDelay: 0,
            onSubmit: saved,
          },
          () =>
            ['models', 'keys'].map((name) =>
              h(
                UFormField,
                {
                  name,
                  label: name,
                  eagerValidation: true,
                },
                () =>
                  h(UTextarea, {
                    modelValue: input[name as keyof typeof input],
                    'onUpdate:modelValue': (value: string) => {
                      input[name as keyof typeof input] = value;
                    },
                  }),
              ),
            ),
        ),
    });
    app.mount(host);
    await nextTick();

    const fields = host.querySelectorAll('textarea');
    async function type(index: number, value: string) {
      fields[index].value = value;
      fields[index].dispatchEvent(new Event('input', { bubbles: true }));
      await vi.waitFor(() =>
        expect(input[index === 0 ? 'models' : 'keys']).toBe(value),
      );
      await nextTick();
    }
    await type(0, 'model\n model');
    await vi.waitFor(() =>
      expect(host.textContent).toContain('存在重复的模型名'),
    );
    expect(host.textContent).not.toContain('请至少输入一个Key');

    expect(await form.value!.validate({ silent: true })).toBe(false);
    await form.value!.submit();
    expect(saved).not.toHaveBeenCalled();

    await type(0, 'model');
    await type(1, 'sk-key');
    await vi.waitFor(() =>
      expect(host.textContent).not.toMatch(/存在重复|请至少输入/),
    );
    await form.value!.submit();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0][0].data).toEqual({
      endpoint: worker.endpoint,
      models: 'model',
      keys: 'sk-key',
    });
  });
});
