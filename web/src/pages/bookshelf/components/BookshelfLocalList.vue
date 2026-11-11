<script lang="ts" setup>
import { XEmpty, XScrollArea, XSeparator } from '@novelia/web-kit';
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
  <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
    <c-action-wrapper title="搜索">
      <search-input
        v-model:value="search"
        placeholder="搜索文件名"
        style="max-width: 400px"
      />
    </c-action-wrapper>

    <c-action-wrapper title="排序" align="center">
      <order-sort
        v-model:value="setting.localVolumeOrder"
        :options="Setting.localVolumeOrderOptions"
      />
    </c-action-wrapper>
  </div>

  <XSeparator style="margin: 16px 0 8px" />

  <n-spin v-if="loading" description="正在加载" style="margin-top: 20px" />

  <n-alert
    v-else-if="loadError !== null"
    type="error"
    title="加载失败"
    style="margin-top: 20px"
  >
    <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
      <span>{{ loadError }}</span>
      <c-button label="重试" @action="loadVolumes" />
    </div>
  </n-alert>

  <XEmpty
    size="compact"
    class="min-h-0 p-0"
    v-else-if="sortedVolumes.length === 0"
    title="没有文件"
    style="margin-top: 20px"
  />

  <XScrollArea v-else style="flex: auto">
    <n-list style="padding-bottom: 48px; padding-right: 12px">
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
  </XScrollArea>
</template>
