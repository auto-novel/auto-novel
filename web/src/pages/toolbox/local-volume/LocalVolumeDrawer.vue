<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';
import { Toast } from '@novelia/web-kit';
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

const show = defineModel<boolean>('show', { default: false });

const emit = defineEmits<{
  volumeAdd: [File];
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

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
    Toast.info('没有选中小说');
    return;
  }
  const ids = sortedVolumes.value.map((it) => it.id);
  const { success, failed } = await store.downloadVolumes(ids);
  Toast.info(`${success}本小说被打包，${failed}本失败`);
};

const showDeleteModal = ref(false);

const openDeleteModal = () => {
  if (sortedVolumes.value.length === 0) {
    Toast.info('没有选中小说');
    return;
  }
  showDeleteModal.value = true;
};

const deleteAllVolumes = async () => {
  const ids = sortedVolumes.value.map((it) => it.id);
  const { success, failed } = await store.deleteVolumes(ids);
  showDeleteModal.value = false;
  Toast.info(`${success}本小说被删除，${failed}本失败`);
};

const search = reactive({
  query: '',
  enableRegexMode: false,
});

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const selectedFavored = ref(favoreds.value.local[0]?.id ?? 'default');
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
  <USlideover
    v-model:open="show"
    title="本地小说"
    :close="false"
    side="right"
    :content="{ onOpenAutoFocus: (event: Event) => event.preventDefault() }"
    :ui="{
      content: 'w-[clamp(280px,80vw,800px)] max-w-[calc(100vw-3rem)]',
      body: 'flex min-h-0 flex-1 flex-col overflow-hidden p-0 sm:p-0',
    }"
  >
    <template #actions>
      <bookshelf-local-add-button
        :favored-id="selectedFavored"
        @done="emit('volumeAdd', $event)"
      />
      <ActionButton
        :action="downloadVolumes"
        :icon="FileDownloadOutlined"
        :ui="{ leadingIcon: 'size-4.5' }"
      >
        下载
      </ActionButton>
      <UDropdownMenu
        :ui="{ content: 'w-40' }"
        :items="
          options.map((option) => ({
            label: option.label,
            onSelect: () => handleSelect(option.key),
          }))
        "
      >
        <UButton
          :icon="MoreVertOutlined"
          color="neutral"
          variant="ghost"
          size="md"
          square
          aria-label="更多操作"
          title="更多操作"
        />
      </UDropdownMenu>
    </template>

    <template #body>
      <UScrollArea class="min-h-0 flex-1">
        <div class="px-4 py-6">
          <div class="flex flex-col gap-y-2">
            <c-action-wrapper title="搜索">
              <search-input
                class="max-w-[400px]"
                v-model:value="search"
                placeholder="搜索文件名"
              />
            </c-action-wrapper>

            <c-action-wrapper v-if="favoreds.local.length > 1" title="收藏">
              <USelect
                class="w-full max-w-[400px]"
                v-model="selectedFavored"
                :items="favoredsOptions"
                aria-label="收藏夹"
              />
            </c-action-wrapper>

            <c-action-wrapper title="排序" align="center">
              <order-sort
                v-model:value="setting.localVolumeOrder"
                :options="Setting.localVolumeOrderOptions"
              />
            </c-action-wrapper>
            <slot name="extra" />
          </div>

          <USeparator class="mx-0 mt-4 mb-2" />

          <n-spin class="mt-5" v-if="sortedVolumes === undefined" />

          <CEmpty
            class="mt-5"
            inline
            v-else-if="sortedVolumes.length === 0"
            title="没有文件"
          />

          <template v-else>
            <n-list class="pb-12! pr-3!">
              <n-list-item
                v-for="volume of sortedVolumes ?? []"
                :key="volume.id"
              >
                <slot name="volume" v-bind="volume" />
              </n-list-item>
            </n-list>
          </template>

          <UModal
            title="清空所有文件"
            v-model:open="showDeleteModal"
            class="w-150"
            :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
          >
            <template #body>
              <p
                class="my-4 text-sm leading-[1.6] text-ink first:mt-0 last:mb-0"
              >
                这将清空你的浏览器里面保存的所有EPUB/TXT文件，包括已经翻译的章节和术语表，无法恢复。
                你确定吗？
              </p>
            </template>
            <template #footer>
              <ActionButton
                color="primary"
                :action="deleteAllVolumes"
                variant="solid"
              >
                确定
              </ActionButton>
            </template>
          </UModal>
        </div>
      </UScrollArea>
    </template>
  </USlideover>
</template>
