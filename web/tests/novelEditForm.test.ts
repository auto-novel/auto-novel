// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
} from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import WenkuNovelEdit from '../src/pages/novel/WenkuNovelEdit.vue';

const mocks = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue('saved'),
  refresh: vi.fn(),
  warning: vi.fn(),
  list: vi.fn().mockResolvedValue({ items: [] }),
}));
const session = reactive({
  whoami: ref({ isSignedIn: true, hasNsfwAccess: false, isAdmin: false }),
});
const passthrough = vi.hoisted(() => ({
  inheritAttrs: false,
  setup:
    (_props: unknown, { slots }: { slots: { default?: () => unknown } }) =>
    () =>
      slots.default?.(),
}));
vi.mock('@/stores', () => ({ useWhoamiStore: () => session }));
vi.mock('@/pages/util', () => ({ useIsWideScreen: () => ref(false) }));
vi.mock('@/repos', () => ({
  WenkuNovelRepo: {
    useWenkuNovel: () => ({ refresh: mocks.refresh }),
    createNovel: mocks.save,
    updateNovel: mocks.save,
  },
}));
vi.mock('@/api', () => ({ WenkuNovelApi: { listNovel: mocks.list } }));
vi.mock('@/domain/smart-import', () => ({
  prettyCover: (value: string) => value,
  smartImport: vi.fn(),
}));
vi.mock('@novelia/web-kit', () => ({
  XPage: passthrough,
  XTime: passthrough,
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
  Toast: {
    info: vi.fn(),
    warning: mocks.warning,
    error: vi.fn(),
    promise: (promise: Promise<unknown>) => promise,
  },
}));
vi.mock('naive-ui', () => ({
  NImage: passthrough,
  NTag: passthrough,
}));
vi.mock('@nuxt/ui/components/PageHeader.vue', () => ({
  default: { render: () => null },
}));
vi.mock('@nuxt/ui/components/Card.vue', () => ({ default: passthrough }));
vi.mock('@nuxt/ui/components/Modal.vue', () => ({
  default: { render: () => null },
}));
vi.mock('@nuxt/ui/components/Button.vue', () => ({
  default: defineComponent({
    props: ['loading', 'disabled', 'icon', 'to', 'href'],
    setup:
      (props, { attrs, slots }) =>
      () =>
        h(
          'button',
          {
            ...attrs,
            type: 'button',
            disabled: props.loading || props.disabled,
          },
          slots.default?.(),
        ),
  }),
}));
vi.mock('../src/components/ActionButton.vue', () => ({
  default: { render: () => null },
}));

const apps: App[] = [];
const validNovel = () => ({
  title: '日文标题',
  titleZh: '中文标题',
  cover: 'https://example.com/cover.jpg',
  authors: [],
  artists: [],
  level: '一般向',
  keywords: [],
  introduction: '',
  volumes: [],
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await nextTick();
};
async function mount({ novelId }: { novelId?: string } = { novelId: 'test' }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/wenku/test/edit');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(WenkuNovelEdit, { novelId });
  app.use(router);
  app.mount(host);
  apps.push(app);
  await flush();
  return host;
}
async function input(host: HTMLElement, name: string, value: string) {
  const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  )!;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}
const save = async (host: HTMLElement) => {
  const button = [...host.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === '提交',
  )!;
  button.click();
  await flush();
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ data: validNovel() });
  session.whoami.isSignedIn = true;
  session.whoami.hasNsfwAccess = false;
});
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  document.body.replaceChildren();
});

describe('Wenku edit UForm', () => {
  it('requires search and both confirmations before creation, and supports going back', async () => {
    const host = await mount({});
    await input(host, 'title', '日文标题');
    await input(host, 'titleZh', '中文标题');
    await input(host, 'cover', 'https://example.com/cover.jpg');
    const steps = host.querySelector('ol[aria-label="创建文库小说步骤"]')!;
    expect(steps.children).toHaveLength(3);
    expect(
      [...steps.querySelectorAll('h3')].map((title) =>
        title.textContent?.trim(),
      ),
    ).toEqual([
      '检查小说是否已经存在',
      '检查小说文件是否可以上传',
      '创建文库小说',
    ]);
    const currentStep = () => steps.querySelector('[aria-current="step"]');
    const button = (label: string) =>
      [...steps.querySelectorAll('button')].find(
        (element) => element.textContent?.trim() === label,
      )!;
    expect(currentStep()).toBe(steps.children[0]);
    expect(button('我确定小说不存在').disabled).toBe(true);
    expect(button('提交')).toBeUndefined();
    button('自动搜索相似小说').click();
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(button('我确定小说不存在').disabled).toBe(false);
    button('我确定小说不存在').click();
    await flush();
    expect(currentStep()).toBe(steps.children[1]);
    expect(button('提交')).toBeUndefined();
    button('上一步').click();
    await flush();
    expect(currentStep()).toBe(steps.children[0]);
    button('我确定小说不存在').click();
    await flush();
    button('我确定我有可以上传的文件').click();
    await flush();
    expect(currentStep()).toBe(steps.children[2]);
    button('提交').click();
    await flush();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: '日文标题', titleZh: '中文标题' }),
    );
  });

  it('resets the creation checks when the title changes', async () => {
    const host = await mount({});
    await input(host, 'title', '日文标题');
    const steps = host.querySelector('ol[aria-label="创建文库小说步骤"]')!;
    const click = async (label: string) => {
      [...steps.querySelectorAll('button')]
        .find((element) => element.textContent?.trim() === label)!
        .click();
      await flush();
    };
    await click('自动搜索相似小说');
    await click('我确定小说不存在');
    await click('我确定我有可以上传的文件');
    expect(steps.querySelector('[aria-current="step"]')).toBe(
      steps.children[2],
    );
    await input(host, 'title', '另一标题');
    expect(steps.querySelector('[aria-current="step"]')).toBe(
      steps.children[0],
    );
    const confirm = [...steps.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === '我确定小说不存在',
    )!;
    expect(confirm.disabled).toBe(true);
    expect(steps.textContent).not.toContain('没有相似的小说');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('shows and clears field errors on input without requiring blur', async () => {
    const host = await mount();
    await input(host, 'titleZh', 'かな');
    expect(host.textContent).toContain('不要使用日文当作中文标题');
    await input(host, 'titleZh', '中文标题');
    expect(host.textContent).not.toContain('不要使用日文当作中文标题');
    await input(host, 'cover', 'https://example.com/page');
    expect(host.textContent).toContain('封面链接必须是图片链接');
    await input(host, 'cover', 'https://example.com/cover.jpg');
    expect(host.textContent).not.toContain('封面链接必须是图片链接');
  });

  it('blocks a silent validation failure and allows a corrected resubmission', async () => {
    const host = await mount();
    await input(host, 'title', ' ');
    await save(host);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain('标题不能为空');
    await input(host, 'title', '日文标题');
    await save(host);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
      'test',
      expect.objectContaining({ title: '日文标题' }),
    );
  });

  it('validates adult classification immediately and clears the error on switching back', async () => {
    const host = await mount();
    host
      .querySelector<HTMLButtonElement>('[role="radio"][value="成人向"]')!
      .click();
    await flush();
    expect(host.textContent).toContain('你太年轻了，无法创建成人向页面');
    await save(host);
    expect(mocks.save).not.toHaveBeenCalled();
    host
      .querySelector<HTMLButtonElement>('[role="radio"][value="一般向"]')!
      .click();
    await flush();
    expect(host.textContent).not.toContain('你太年轻了，无法创建成人向页面');
    await save(host);
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
