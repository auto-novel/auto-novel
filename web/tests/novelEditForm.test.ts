// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import {
  enableAutoUnmount,
  flushPromises,
  mount as mountComponent,
  type VueWrapper,
} from '@vue/test-utils';
import { defineComponent, h, reactive, ref } from 'vue';
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
vi.mock('@nuxt/ui/components/Badge.vue', () => ({ default: passthrough }));
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

enableAutoUnmount((unmount) => {
  afterEach(() => {
    unmount();
    document.body.replaceChildren();
  });
});
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
async function mount({ novelId }: { novelId?: string } = { novelId: 'test' }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/wenku/test/edit');
  const wrapper = mountComponent(WenkuNovelEdit, {
    props: { novelId },
    attachTo: document.body,
    global: { plugins: [router] },
  });
  await flushPromises();
  return wrapper;
}
async function input(wrapper: VueWrapper, name: string, value: string) {
  await wrapper.get(`[name="${name}"]`).setValue(value);
  await flushPromises();
}
const save = async (wrapper: VueWrapper) => {
  await wrapper
    .findAll('button')
    .find((button) => button.text().trim() === '提交')!
    .trigger('click');
  await flushPromises();
};
beforeEach(() => {
  mocks.refresh.mockResolvedValue({ data: validNovel() });
  session.whoami.isSignedIn = true;
  session.whoami.hasNsfwAccess = false;
});

describe('Wenku edit UForm', () => {
  it('requires search and both confirmations before creation, and supports going back', async () => {
    const wrapper = await mount({});
    await input(wrapper, 'title', '日文标题');
    await input(wrapper, 'titleZh', '中文标题');
    await input(wrapper, 'cover', 'https://example.com/cover.jpg');
    const steps = wrapper.get('ol[aria-label="创建文库小说步骤"]');
    expect(steps.element.children).toHaveLength(3);
    expect(steps.findAll('h3').map((title) => title.text().trim())).toEqual([
      '检查小说是否已经存在',
      '检查小说文件是否可以上传',
      '创建文库小说',
    ]);
    const currentStep = () => steps.get('[aria-current="step"]').element;
    const button = (label: string) =>
      steps
        .findAll('button')
        .find((element) => element.text().trim() === label)!;
    expect(currentStep()).toBe(steps.element.children[0]);
    expect(
      button('我确定小说不存在').attributes('disabled') !== undefined,
    ).toBe(true);
    expect(button('提交')).toBeUndefined();
    await button('自动搜索相似小说').trigger('click');
    await flushPromises();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(
      button('我确定小说不存在').attributes('disabled') !== undefined,
    ).toBe(false);
    await button('我确定小说不存在').trigger('click');
    await flushPromises();
    expect(currentStep()).toBe(steps.element.children[1]);
    expect(button('提交')).toBeUndefined();
    await button('上一步').trigger('click');
    await flushPromises();
    expect(currentStep()).toBe(steps.element.children[0]);
    await button('我确定小说不存在').trigger('click');
    await flushPromises();
    await button('我确定我有可以上传的文件').trigger('click');
    await flushPromises();
    expect(currentStep()).toBe(steps.element.children[2]);
    await button('提交').trigger('click');
    await flushPromises();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: '日文标题', titleZh: '中文标题' }),
    );
  });

  it('resets the creation checks when the title changes', async () => {
    const wrapper = await mount({});
    await input(wrapper, 'title', '日文标题');
    const steps = wrapper.get('ol[aria-label="创建文库小说步骤"]');
    const click = async (label: string) => {
      await steps
        .findAll('button')
        .find((element) => element.text().trim() === label)!
        .trigger('click');
      await flushPromises();
    };
    await click('自动搜索相似小说');
    await click('我确定小说不存在');
    await click('我确定我有可以上传的文件');
    expect(steps.get('[aria-current="step"]').element).toBe(
      steps.element.children[2],
    );
    await input(wrapper, 'title', '另一标题');
    expect(steps.get('[aria-current="step"]').element).toBe(
      steps.element.children[0],
    );
    const confirm = steps
      .findAll('button')
      .find((element) => element.text().trim() === '我确定小说不存在')!;
    expect(confirm.attributes('disabled')).toBeDefined();
    expect(steps.text()).not.toContain('没有相似的小说');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('shows and clears field errors on input without requiring blur', async () => {
    const wrapper = await mount();
    await input(wrapper, 'titleZh', 'かな');
    expect(wrapper.text()).toContain('不要使用日文当作中文标题');
    await input(wrapper, 'titleZh', '中文标题');
    expect(wrapper.text()).not.toContain('不要使用日文当作中文标题');
    await input(wrapper, 'cover', 'https://example.com/page');
    expect(wrapper.text()).toContain('封面链接必须是图片链接');
    await input(wrapper, 'cover', 'https://example.com/cover.jpg');
    expect(wrapper.text()).not.toContain('封面链接必须是图片链接');
  });

  it('blocks a silent validation failure and allows a corrected resubmission', async () => {
    const wrapper = await mount();
    await input(wrapper, 'title', ' ');
    await save(wrapper);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('标题不能为空');
    await input(wrapper, 'title', '日文标题');
    await save(wrapper);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
      'test',
      expect.objectContaining({ title: '日文标题' }),
    );
  });

  it('validates adult classification immediately and clears the error on switching back', async () => {
    const wrapper = await mount();
    await wrapper.get('[role="radio"][value="成人向"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('你太年轻了，无法创建成人向页面');
    await save(wrapper);
    expect(mocks.save).not.toHaveBeenCalled();
    await wrapper.get('[role="radio"][value="一般向"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('你太年轻了，无法创建成人向页面');
    await save(wrapper);
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
