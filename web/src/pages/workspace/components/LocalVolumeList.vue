<script lang="ts" setup>
import { FileDownloadOutlined, MoreVertOutlined } from '@vicons/material';

import type { LocalVolumeMetadata } from '@/model/LocalVolume';
import {
  BookshelfLocalUtil,
  useBookshelfLocalStore,
} from '@/pages/bookshelf/BookshelfLocalStore';
import { FavoredRepo, Setting, useSettingStore } from '@/stores';

const props = defineProps<{
  options?: { [key: string]: (volumes: LocalVolumeMetadata[]) => void };
  filter?: (volume: LocalVolumeMetadata) => boolean;
}>();

const emit = defineEmits<{
  volumeAdd: [File];
}>();

const message = useMessage();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const themeVars = useThemeVars();

const store = useBookshelfLocalStore();
const { volumes } = storeToRefs(store);

store.loadVolumes();

const options = computed(() => {
  return [...Object.keys(props.options ?? {}), '批量删除'].map((it) => ({
    label: it,
    key: it,
  }));
});
const handleSelect = (key: string) => {
  switch (key) {
    case '批量删除':
      openDeleteModal();
      break;
    default:
      props.options?.[key]?.(volumes.value ?? []);
      break;
  }
};

const downloadVolumes = async () => {
  if (sortedVolumes.value.length === 0) {
    message.info('没有选中小说');
    return;
  }
  const ids = sortedVolumes.value.map((it) => it.id);
  const { success, failed } = await store.downloadVolumes(ids);
  message.info(`${success}本小说被打包，${failed}本失败`);
};

const showDeleteModal = ref(false);

const openDeleteModal = () => {
  if (sortedVolumes.value.length === 0) {
    message.info('没有选中小说');
    return;
  }
  showDeleteModal.value = true;
};

const deleteAllVolumes = async () => {
  const ids = sortedVolumes.value.map((it) => it.id);
  const { success, failed } = await store.deleteVolumes(ids);
  showDeleteModal.value = false;
  message.info(`${success}本小说被删除，${failed}本失败`);
};

const search = reactive({
  query: '',
  enableRegexMode: false,
});

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const selectedFavored = ref<string | undefined>(favoreds.value.local[0]?.id);
const favoredsOptions = computed(() => {
  return favoreds.value.local.map(({ id, title }) => ({
    label: title,
    value: id,
  }));
});

const sortedVolumes = computed(() => {
  const filteredVolumes =
    props.filter === undefined
      ? volumes.value
      : volumes.value.filter(props.filter);
  return BookshelfLocalUtil.filterAndSortVolumes(filteredVolumes, {
    ...search,
    favoredId: selectedFavored.value,
    order: setting.value.localVolumeOrder,
  });
});
</script>

<template>
  <c-drawer-right title="本地小说">
    <template #action>
      <bookshelf-local-add-button
        :favored-id="selectedFavored"
        @done="emit('volumeAdd', $event)"
      />
      <c-button
        label="下载"
        :icon="FileDownloadOutlined"
        @click="downloadVolumes"
      />
      <n-dropdown
        trigger="click"
        :options="options"
        :keyboard="false"
        @select="handleSelect"
      >
        <n-button circle>
          <n-icon :component="MoreVertOutlined" />
        </n-button>
      </n-dropdown>
    </template>

    <div style="padding: 24px 16px">
      <n-flex vertical>
        <c-action-wrapper title="搜索">
          <search-input
            v-model:value="search"
            placeholder="搜索文件名"
            style="max-width: 400px"
          />
        </c-action-wrapper>

        <c-action-wrapper v-if="favoreds.local.length > 1" title="收藏">
          <n-select
            v-model:value="selectedFavored"
            :options="favoredsOptions"
            style="max-width: 400px"
          />
        </c-action-wrapper>

        <c-action-wrapper title="排序" align="center">
          <order-sort
            v-model:value="setting.localVolumeOrder"
            :options="Setting.localVolumeOrderOptions"
          />
        </c-action-wrapper>
        <slot name="extra" />
      </n-flex>

      <n-divider style="margin: 16px 0 8px" />

      <n-spin v-if="sortedVolumes === undefined" style="margin-top: 20px" />

      <n-empty
        v-else-if="sortedVolumes.length === 0"
        description="没有文件"
        style="margin-top: 20px"
      />

      <n-scrollbar v-else trigger="none" :size="24" style="flex: auto">
        <div class="volume-list">
          <div
            v-for="volume of sortedVolumes ?? []"
            :key="volume.id"
            class="volume-list__item"
            :style="{ borderTopColor: themeVars.dividerColor }"
          >
            <slot name="volume" v-bind="volume" />
          </div>
        </div>
      </n-scrollbar>

      <c-modal title="清空所有文件" v-model:show="showDeleteModal">
        <n-p>
          这将清空你的浏览器里面保存的所有EPUB/TXT文件，包括已经翻译的章节和术语表，无法恢复。
          你确定吗？
        </n-p>

        <template #action>
          <c-button label="确定" type="primary" @action="deleteAllVolumes" />
        </template>
      </c-modal>
    </div>
  </c-drawer-right>
</template>

<style scoped>
.volume-list {
  padding-bottom: 48px;
  padding-right: 12px;
}
.volume-list__item {
  padding: 10px 0;
  border-top: 1px solid;
}
</style>
