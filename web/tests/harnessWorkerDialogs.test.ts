import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import type { Component, EffectScope, Ref } from 'vue';
import type { GptPipelineWorker } from '../src/model/Translator';
import { harnessPresets } from '@auto-novel/translator/harness/presets';
import GptWorkerDialog from '../src/pages/workspace/worker/GptWorkerDialog.vue';
import TrialTranslationDialog from '../src/pages/workspace/worker/TrialTranslationDialog.vue';
import WorkerCard from '../src/pages/workspace/worker/WorkerCard.vue';

const mocks = vi.hoisted(() => ({
  store: null as unknown,
  translate: vi.fn(),
  createTranslator: vi.fn(),
  createHarnessMode: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>();
  return {
    ...vue,
    useTemplateRef: () =>
      vue.ref({
        validate: (done?: (errors?: unknown) => void) => {
          done?.();
          return Promise.resolve();
        },
      }),
    onMounted: vi.fn(),
    onUnmounted: vue.onScopeDispose,
    useSSRContext: () => ({ modules: new Set() }),
  };
});
vi.mock('@novelia/web-kit', () => ({
  Toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warning: mocks.warning,
    promise: (promise: Promise<unknown>) => promise,
  },
  useWebKitViewport: () => ({ isMobile: ref(false) }),
  copyToClipboard: vi.fn(),
  getApiErrorMessage: vi.fn(),
  XDialog: {},
  XSelect: {},
}));
vi.mock('@/stores', () => ({
  useGptPipelineWorkspaceStore: () => mocks.store,
}));
vi.mock('@/util', () => ({ downloadFile: vi.fn() }));
vi.mock('../src/pages/workspace/worker/SakuraWorkerDialog.vue', () => ({
  default: {},
}));
vi.mock('../src/pages/workspace/worker/TrialGlossaryPanel.vue', () => ({
  default: {},
}));
vi.mock('@/domain/translator/harness/HarnessMode', () => ({
  createHarnessMode: mocks.createHarnessMode,
}));
vi.mock('@auto-novel/translator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@auto-novel/translator')>();
  return {
    ...actual,
    createTranslator: mocks.createTranslator,
    TranslationPipeline: class {
      registerTranslator() {}
      translate = mocks.translate;
      dispose() {}
    },
  };
});

const scopes: EffectScope[] = [];
type Store = {
  ref: Ref<{ workers: GptPipelineWorker[] }>;
  addWorker: ReturnType<typeof vi.fn>;
};
interface FormBindings {
  formValue: Ref<{ preset?: string; profileId: string; endpoint: string }>;
  presetOptions: { label: string; value: string }[];
  keyText: Ref<string>;
  onPresetChange: (value: string) => void;
  onProfileChange: (value: string) => void;
  submit: () => Promise<void>;
  submitAndContinue: () => Promise<void>;
}
interface TrialBindings {
  textJp: Ref<string>;
  textZh: Ref<string>;
  translate: () => Promise<void>;
  cancel: () => void;
}

// Exercise the compiled setup bindings without adding test-only component APIs.
function setup<T>(component: Component, props: object): T {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() =>
    (
      component as unknown as {
        setup: (props: object, context: object) => T;
      }
    ).setup(props, { expose: vi.fn(), emit: vi.fn() }),
  )!;
}

const worker: GptPipelineWorker = {
  id: 'harness',
  preset: 'deepseek',
  model: 'deepseek-v4-pro',
  endpoint: 'https://api.deepseek.com',
  key: 'test-key',
  concurrency: 1,
};

beforeEach(() => {
  mocks.store = { ref: ref({ workers: [] }), addWorker: vi.fn() };
  mocks.createTranslator.mockResolvedValue({ trusted: true });
  mocks.translate.mockImplementation(async (input) => ({
    lines: input.lines.map(() => 'translation'),
    failed: [],
  }));
  mocks.createHarnessMode.mockReturnValue(mocks.translate);
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('restores a saved Harness preset and saves it without generic profile settings', async () => {
  const store = mocks.store as Store;
  store.ref.value.workers = [worker];
  const form = setup<FormBindings>(GptWorkerDialog, { show: true, worker });
  expect(form.formValue.value.preset).toBe('deepseek');
  await form.submit();
  expect(store.ref.value.workers[0]).toMatchObject({
    preset: 'deepseek',
    model: worker.model,
    key: worker.key,
  });
  expect(store.ref.value.workers[0].profile).toBeUndefined();
});

it('creates preset workers through the existing batch form', async () => {
  const form = setup<FormBindings>(GptWorkerDialog, { show: true });
  expect(form.presetOptions).toEqual(
    expect.arrayContaining([{ label: 'DeepSeek', value: 'deepseek' }]),
  );
  form.onPresetChange('deepseek');
  form.keyText.value = 'test-key';
  await form.submitAndContinue();
  expect(
    (mocks.store as { addWorker: ReturnType<typeof vi.fn> }).addWorker,
  ).toHaveBeenCalledWith(
    expect.objectContaining({
      preset: 'deepseek',
      model: harnessPresets[0].models[0].model,
      key: 'test-key',
      profile: undefined,
    }),
  );
});

it('keeps generic profile validation when no Harness preset is selected', async () => {
  const form = setup<FormBindings>(GptWorkerDialog, {
    show: true,
    worker: { ...worker, preset: 'general' },
  });
  form.formValue.value.profileId = 'invalid-profile';
  await form.submit();
  expect(mocks.warning).toHaveBeenCalledOnce();
});

it('uses the whole-input Harness adapter for trial translation', async () => {
  const trial = setup<TrialBindings>(TrialTranslationDialog, {
    show: true,
    translatorId: 'gpt',
    worker,
    running: false,
  });
  trial.textJp.value = 'first\nsecond';
  await trial.translate();
  expect(mocks.createHarnessMode).toHaveBeenCalledWith(
    expect.objectContaining({ model: worker.model }),
    worker.key,
    worker.id,
  );
  expect(mocks.createTranslator).not.toHaveBeenCalled();
  expect(trial.textZh.value).toBe('translation\ntranslation');
});

it('keeps generic trial translation on the upstream pipeline', async () => {
  const trial = setup<TrialBindings>(TrialTranslationDialog, {
    show: true,
    translatorId: 'gpt',
    worker: { ...worker, preset: 'general' },
    running: false,
  });
  trial.textJp.value = 'source';
  await trial.translate();
  expect(mocks.createTranslator).toHaveBeenCalledOnce();
  expect(mocks.createHarnessMode).not.toHaveBeenCalled();
  expect(trial.textZh.value).toBe('translation');
});

it('uses the selected Harness preset when testing a worker', async () => {
  const card = setup<{ testWorker: () => Promise<void> }>(WorkerCard, {
    translatorId: 'gpt',
    worker,
    running: false,
    currentConcurrency: 0,
    errorCount: 0,
  });
  await card.testWorker();
  expect(mocks.createHarnessMode).toHaveBeenCalledWith(
    expect.objectContaining({ model: worker.model }),
    worker.key,
    worker.id,
    expect.any(Function),
  );
  expect(mocks.createTranslator).not.toHaveBeenCalled();
});

it('keeps a manually configured generic endpoint when changing protocol', () => {
  const endpoint = 'https://custom.example.test';
  const form = setup<FormBindings>(GptWorkerDialog, {
    show: true,
    worker: { ...worker, preset: 'general', endpoint },
  });
  form.onProfileChange('anthropic');
  expect(form.formValue.value.endpoint).toBe(endpoint);
});

it('ignores a late Harness trial result after the dialog is cancelled', async () => {
  let finish!: (result: { lines: string[]; failed: [] }) => void;
  mocks.translate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const trial = setup<TrialBindings>(TrialTranslationDialog, {
    show: true,
    translatorId: 'gpt',
    worker,
    running: false,
  });
  trial.textJp.value = 'source';
  const translation = trial.translate();
  await vi.waitFor(() => expect(mocks.translate).toHaveBeenCalledOnce());
  trial.cancel();
  finish({ lines: ['late'], failed: [] });
  await translation;
  expect(trial.textZh.value).toBe('');
});
