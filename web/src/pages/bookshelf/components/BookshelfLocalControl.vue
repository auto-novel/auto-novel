<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';

import { FavoredRepo, useLocalVolumeStore, useSettingStore } from '@/stores';
import { useShouldTopJob } from '@/util';
import { useBookshelfLocalStore } from '../BookshelfLocalStore';

const props = defineProps<{
  selectedIds: string[];
  favoredId: string;
}>();
defineEmits<{
  selectAll: [];
  invertSelection: [];
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const store = useBookshelfLocalStore();

// 删除小说
const showDeleteModal = ref(false);

const openDeleteModal = () => {
  const ids = props.selectedIds;
  if (ids.length === 0) {
    Toast.info('没有选中小说');
    return;
  }
  showDeleteModal.value = true;
};

const deleteSelected = async () => {
  const ids = props.selectedIds;
  const { success, failed } = await store.deleteVolumes(ids);
  Toast.info(`${success}本小说被删除，${failed}本失败`);
};

const downloadSelected = async () => {
  const ids = props.selectedIds;
  if (ids.length === 0) {
    Toast.info('没有选中小说');
    return;
  }
  const { success, failed } = await store.downloadVolumes(ids);
  Toast.info(`${success}本小说机翻被打包，${failed}本失败`);
};

const downloadRawSelected = async () => {
  const ids = props.selectedIds;
  if (ids.length === 0) {
    Toast.info('没有选中小说');
    return;
  }
  const { success, failed } = await store.downloadRawVolumes(ids);
  Toast.info(`${success}本小说原文被打包，${failed}本失败`);
};

// 移动小说
const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const targetFavoredId = ref(props.favoredId);
watch(
  () => props.favoredId,
  (favoredId) => {
    targetFavoredId.value = favoredId;
    showDeleteModal.value = false;
  },
);

const moveToFavored = async () => {
  const novels = props.selectedIds;
  if (novels.length === 0) {
    Toast.info('没有选中小说');
    return;
  }

  if (targetFavoredId.value === props.favoredId) {
    Toast.info('无需移动');
    return;
  }

  const favoredId = targetFavoredId.value;
  const localVolumeRepository = await useLocalVolumeStore();

  let failed = 0;
  for (const volumeId of novels) {
    try {
      await localVolumeRepository.updateFavoredId(volumeId, favoredId);
    } catch (e) {
      failed += 1;
    }
  }
  const success = novels.length - failed;

  Toast.info(`${success}本小说已移动，${failed}本失败`);
  await store.loadVolumes();
};

// 生成翻译任务
const translateLevel = ref<'expire' | 'all'>('expire');
const reverseOrder = ref(false);
const shouldTopJob = useShouldTopJob();

const queueJobs = (type: 'gpt' | 'sakura') => {
  let ids = props.selectedIds;
  if (ids.length === 0) {
    Toast.info('没有选中小说');
    return;
  }

  if (reverseOrder.value) {
    ids = ids.slice().reverse();
  }

  const { success, failed } = store.queueJobsToWorkspace(ids, {
    level: translateLevel.value,
    type,
    shouldTop: shouldTopJob.value ?? false,
  });
  Toast.info(`${success}本小说已排队，${failed}本失败`);
};
</script>

<template>
  <div
    class="divide-y divide-default leading-[1.6] text-default text-sm rounded-[3px] border border-default"
  >
    <div class="relative min-w-0 py-3 px-5">
      <div class="flex flex-col gap-y-2">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <UFieldGroup size="sm">
            <UButton
              color="neutral"
              variant="outline"
              @click="$emit('selectAll')"
              class="text-sm/4"
            >
              全选
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              @click="$emit('invertSelection')"
              class="text-sm/4"
            >
              反选
            </UButton>
          </UFieldGroup>

          <UFieldGroup size="sm">
            <ActionButton
              class="rounded-md text-sm/4"
              :action="downloadRawSelected"
            >
              下载原文
            </ActionButton>
            <ActionButton
              class="rounded-md text-sm/4"
              :action="downloadSelected"
            >
              下载机翻
            </ActionButton>
            <DownloadOptionsButton size="sm" class="rounded-md text-sm/4" />
          </UFieldGroup>

          <UButton
            size="sm"
            color="error"
            @click="openDeleteModal"
            variant="soft"
            class="text-sm/4"
          >
            删除
          </UButton>
          <UModal
            :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
            :title="`确定删除 ${
              selectedIds.length === 1
                ? selectedIds[0]
                : `${selectedIds.length}本小说`
            }？`"
            v-model:open="showDeleteModal"
            class="w-150"
          >
            <template #footer>
              <ActionButton
                color="primary"
                :action="deleteSelected"
                variant="solid"
              >
                确定
              </ActionButton>
            </template>
          </UModal>
        </div>

        <span class="text-muted">已选择{{ selectedIds.length }}本小说</span>
      </div>
    </div>

    <div class="relative min-w-0 py-3 px-5" v-if="favoreds.local.length > 1">
      <div class="flex flex-col gap-y-2">
        <b>移动小说</b>

        <n-radio-group v-model:value="targetFavoredId">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <ActionButton
              class="rounded-md text-sm/4"
              size="sm"
              :action="moveToFavored"
            >
              移动
            </ActionButton>

            <n-radio
              v-for="favored in favoreds.local"
              :key="favored.id"
              :value="favored.id"
            >
              {{ favored.title }}
            </n-radio>
          </div>
        </n-radio-group>
      </div>
    </div>

    <div
      class="relative min-w-0 py-3 px-5"
      v-if="
        setting.enabledTranslator.includes('gpt') ||
        setting.enabledTranslator.includes('sakura')
      "
    >
      <div class="flex flex-col gap-y-2">
        <b>生成翻译任务</b>

        <c-action-wrapper title="选项">
          <div class="flex flex-wrap gap-x-2 gap-y-1">
            <UTooltip>
              <div class="flex">
                <tag-button
                  label="过期"
                  :checked="translateLevel === 'expire'"
                  @update:checked="translateLevel = 'expire'"
                />
                <tag-button
                  label="重翻"
                  type="warning"
                  :checked="translateLevel === 'all'"
                  @update:checked="translateLevel = 'all'"
                />
              </div>

              <template #content>
                过期：翻译术语表过期的章节
                <br />
                重翻：重翻全部章节
                <br />
              </template>
            </UTooltip>

            <tag-button label="倒序添加" v-model:checked="reverseOrder" />
          </div>
        </c-action-wrapper>

        <c-action-wrapper title="操作">
          <UFieldGroup size="sm">
            <ActionButton
              class="rounded-md text-sm/4"
              v-if="setting.enabledTranslator.includes('gpt')"
              :action="() => queueJobs('gpt')"
            >
              排队GPT
            </ActionButton>
            <ActionButton
              class="rounded-md text-sm/4"
              v-if="setting.enabledTranslator.includes('sakura')"
              :action="() => queueJobs('sakura')"
            >
              排队Sakura
            </ActionButton>
          </UFieldGroup>
        </c-action-wrapper>
      </div>
    </div>
  </div>
</template>
