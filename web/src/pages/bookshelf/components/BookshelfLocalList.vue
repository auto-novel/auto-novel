<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';

import { Setting, useSettingStore } from '@/stores';
import {
  BookshelfLocalUtil,
  useBookshelfLocalStore,
} from '../BookshelfLocalStore';

const props = defineProps<{
  selectable?: boolean;
  favoredId: string;
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const store = useBookshelfLocalStore();
const { volumes, loading, loadError } = storeToRefs(store);

// 列表用状态展示错误；保留 store 的 rejection 供导入等调用方处理。
const loadVolumes = () => store.loadVolumes().catch(() => {});
void loadVolumes();

const search = reactive({
  query: '',
  enableRegexMode: false,
});

const sortedVolumes = computed(() => {
  return BookshelfLocalUtil.filterAndSortVolumes(volumes.value, {
    ...search,
    favoredId: props.favoredId,
    order: setting.value.localVolumeOrder,
  });
});

const selectedIds = ref<string[]>([]);

watch(
  () => props.favoredId,
  () => {
    selectedIds.value = [];
  },
);

watch(
  () => props.selectable,
  (selectable) => {
    if (selectable !== false) {
      selectedIds.value = [];
    }
  },
);

const toggleSelect = (id: string, selected: boolean) => {
  if (selected) {
    selectedIds.value.push(id);
  } else {
    selectedIds.value = selectedIds.value.filter((it) => it != id);
  }
};

defineExpose({
  selectedIds,
  selectAll: () => {
    selectedIds.value = sortedVolumes.value.map((it) => it.id);
  },
  invertSelection: () => {
    selectedIds.value = sortedVolumes.value
      .map((it) => it.id)
      .filter((it) => !selectedIds.value.includes(it));
  },
});
</script>

<template>
  <div class="flex flex-col gap-y-2">
    <c-action-wrapper title="搜索">
      <search-input
        class="max-w-[400px]"
        v-model:value="search"
        placeholder="搜索文件名"
      />
    </c-action-wrapper>

    <c-action-wrapper title="排序" align="center">
      <order-sort
        v-model:value="setting.localVolumeOrder"
        :options="Setting.localVolumeOrderOptions"
      />
    </c-action-wrapper>
  </div>

  <USeparator class="mx-0 mt-4 mb-2" />

  <n-spin class="mt-5" v-if="loading" description="正在加载" />

  <UAlert
    class="mt-5"
    v-else-if="loadError !== null"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    title="加载失败"
    :ui="{ description: 'break-words' }"
    role="alert"
  >
    <template #description>
      <div class="flex flex-col gap-y-2">
        <span>{{ loadError }}</span>
        <ActionButton :action="loadVolumes">重试</ActionButton>
      </div>
    </template>
  </UAlert>

  <CEmpty
    class="mt-5"
    inline
    v-else-if="sortedVolumes.length === 0"
    title="没有文件"
  />

  <UScrollArea class="flex-auto" v-else>
    <n-list class="pb-12! pr-3!">
      <n-list-item v-for="volume of sortedVolumes" :key="volume.id">
        <bookshelf-local-list-item :volume="volume" />
        <c-select-overlay
          v-if="selectable"
          :checked="selectedIds.includes(volume.id)"
          @update:checked="
            (checked: boolean) => toggleSelect(volume.id, checked)
          "
        />
      </n-list-item>
    </n-list>
  </UScrollArea>
</template>
