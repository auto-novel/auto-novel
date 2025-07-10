<script lang="ts" setup generic="T extends any">
import { v4 as uuidv4 } from 'uuid';
import { useThrottleFn } from '@vueuse/core';

import { Page } from '@/model/Page';
import { Result } from '@/util/result';

import { onKeyDown } from '@/pages/util';
import { Locator } from '@/data';

export type Loader<T> = (page: number) => Promise<Result<Page<T>>>;

const route = useRoute();
const router = useRouter();

const props = defineProps<{
  page: number;
  loader: Loader<T>;
}>();

const { setting } = Locator.settingRepository();

const pageNumber = ref(1);
const pageContent = ref<Result<Page<T>>>();
const loading = ref(false);

const loadId = ref(uuidv4());

const loader = computed(() => {
  const loaderOut = props.loader;

  return async (page: number) => {
    const currentLoadId = uuidv4();
    loadId.value = currentLoadId;

    loading.value = true;
    const res = await loaderOut(page);

    if (loadId.value !== currentLoadId) return;

    loading.value = false;
    return res;
  };
});

const reload = async () => {
  pageContent.value = undefined;
  const result = await loader.value(props.page - 1);
  if (!result) return;

  pageContent.value = result;

  if (result.ok) {
    pageNumber.value = result.value.pageNumber;
  }
};

const onUpdatePage = (page: number) => {
  const query = { ...route.query, page };
  router.push({ path: route.path, query });
};

watch(
  () => props.page,
  async () => reload(),
  { immediate: true },
);

watch(
  () => props.loader,
  () => {
    pageNumber.value = 1;
    if (props.page > 1) {
      onUpdatePage(1);
    } else {
      reload();
    }
  },
);

onKeyDown('ArrowLeft', (e) => {
  if (pageContent.value === undefined) return;
  const page = props.page;
  if (page > 1) {
    // hacky:防止在编辑搜索栏时跳转
    if (e.target instanceof Element && e.target.tagName === 'INPUT') {
      return;
    }
    onUpdatePage(page - 1);
    e.preventDefault();
  }
});

onKeyDown('ArrowRight', (e) => {
  if (pageContent.value === undefined) return;
  const page = props.page;
  if (page < pageNumber.value) {
    // hacky:防止在编辑搜索栏时跳转
    if (e.target instanceof Element && e.target.tagName === 'INPUT') {
      return;
    }
    onUpdatePage(page + 1);
    e.preventDefault();
  }
});

// ===scroll===
const innerPage = ref(props.page);
watch(
  () => [props.page, props.loader],
  () => {
    innerPage.value = props.page;
  },
);
onActivated(() => {
  window.addEventListener('scroll', check);
});
onDeactivated(() => {
  window.removeEventListener('scroll', check);
});

const check = useThrottleFn(
  () => {
    if (
      setting.value.paginationMode !== 'scroll' ||
      !pageContent.value ||
      !pageContent.value.ok ||
      loading.value ||
      innerPage.value >= pageNumber.value
    )
      return;
    const dom = document.documentElement;
    const threshold = 250;

    if (dom.scrollHeight - dom.scrollTop - dom.clientHeight > threshold) return;
    loadMore();
  },
  100,
  true,
  true,
);

watch(
  pageContent,
  async () => {
    await nextTick();
    check();
  },
  { deep: true },
);

const loadMore = async () => {
  const nextPage = innerPage.value + 1;
  const result = await loader.value(nextPage - 1);
  if (!result) return;

  innerPage.value = nextPage;
  if (!result.ok) {
    pageContent.value = result;
  } else {
    if (!pageContent.value || !pageContent.value.ok) {
      pageContent.value = result;
    } else {
      pageContent.value.value.items.push(...result.value.items);
    }
  }
};
</script>

<template>
  <template v-if="setting.paginationMode === 'pagination'">
    <n-pagination
      v-if="pageNumber > 1"
      :page="page"
      @update-page="(page) => onUpdatePage(page)"
      :page-count="pageNumber"
      :page-slot="7"
      style="margin-top: 20px"
    />
    <n-divider />

    <div v-if="loading" class="app-loading-box">
      <n-spin />
    </div>
    <c-result
      v-else
      :result="pageContent"
      :show-empty="(it: Page<T>) => it.items.length === 0"
      v-slot="{ value: pageValue }"
    >
      <slot :items="pageValue.items" />
    </c-result>

    <n-divider />
    <n-pagination
      v-if="pageNumber > 1"
      :page="innerPage"
      @update-page="(page) => onUpdatePage(page)"
      :page-count="pageNumber"
      :page-slot="7"
    />
  </template>
  <template v-else>
    <div style="margin-top: 32px"></div>

    <c-result
      :result="pageContent"
      :show-empty="(it: Page<T>) => it.items.length === 0"
      v-slot="{ value: pageValue }"
    >
      <slot :items="pageValue.items" />
    </c-result>
    <div v-if="pageContent?.ok !== false" class="app-loading-box">
      <template v-if="loading">
        <n-spin />
      </template>
      <template v-else-if="innerPage >= pageNumber && pageNumber > 1">
        没有更多了
      </template>
    </div>
  </template>
</template>
