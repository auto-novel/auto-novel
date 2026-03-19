<script lang="ts" setup>
import { useKeyModifier } from '@vueuse/core';

import { useIsWideScreen } from '@/pages/util';
import {
  FavoredRepo,
  Setting,
  useLocalVolumeStore,
  useSettingStore,
} from '@/stores';
import { useBookshelfLocalStore } from '../BookshelfLocalStore';

const props = defineProps<{
  selectedIds: string[];
  favoredId: string;
}>();
defineEmits<{
  selectAll: [];
  invertSelection: [];
}>();

const message = useMessage();
const isWideScreen = useIsWideScreen(600);

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const store = useBookshelfLocalStore();

// 删除小说
const showDeleteModal = ref(false);

const openDeleteModal = () => {
  const ids = props.selectedIds;
  if (ids.length === 0) {
    message.info('没有选中小说');
    return;
  }
  showDeleteModal.value = true;
};

const deleteSelected = async () => {
  const ids = props.selectedIds;
  const { success, failed } = await store.deleteVolumes(ids);
  message.info(`${success}本小说被删除，${failed}本失败`);
};

// 下载小说
const showDownloadModal = ref(false);

const downloadSelected = async () => {
  const ids = props.selectedIds;
  if (ids.length === 0) {
    message.info('没有选中小说');
    return;
  }
  const { success, failed } = await store.downloadVolumes(ids);
  message.info(`${success}本小说机翻被打包，${failed}本失败`);
};

const downloadRawSelected = async () => {
  const ids = props.selectedIds;
  if (ids.length === 0) {
    message.info('没有选中小说');
    return;
  }
  const { success, failed } = await store.downloadRawVolumes(ids);
  message.info(`${success}本小说原文被打包，${failed}本失败`);
};

// 移动小说
const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const targetFavoredId = ref(props.favoredId);

const moveToFavored = async () => {
  const novels = props.selectedIds;
  if (novels.length === 0) {
    message.info('没有选中小说');
    return;
  }

  if (targetFavoredId.value === props.favoredId) {
    message.info('无需移动');
    return;
  }

  const localVolumeRepository = await useLocalVolumeStore();

  let failed = 0;
  for (const volumeId of novels) {
    try {
      await localVolumeRepository.updateFavoredId(
        volumeId,
        targetFavoredId.value,
      );
    } catch (e) {
      failed += 1;
    }
  }
  const success = novels.length - failed;

  message.info(`${success}本小说已移动，${failed}本失败`);
  await store.loadVolumes();
};

// 生成翻译任务
const translateLevel = ref<'expire' | 'all'>('expire');
const reverseOrder = ref(false);
const shouldTopJob = useKeyModifier('Control');

const queueJobs = (type: 'gpt' | 'sakura' | 'murasaki') => {
  let ids = props.selectedIds;
  if (ids.length === 0) {
    message.info('没有选中小说');
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
  message.info(`${success}本小说已排队，${failed}本失败`);
};
</script>

<template>
  <n-list bordered>
    <n-list-item>
      <n-flex vertical>
        <n-flex align="baseline">
          <n-button-group size="small">
            <c-button
              label="全选"
              :round="false"
              @action="$emit('selectAll')"
            />
            <c-button
              label="反选"
              :round="false"
              @action="$emit('invertSelection')"
            />
          </n-button-group>

          <n-button-group size="small">
            <c-button
              label="下载原文"
              :round="false"
              @action="downloadRawSelected"
            />
            <c-button
              label="下载机翻"
              :round="false"
              @action="downloadSelected"
            />
            <c-button
              label="下载设置"
              :round="false"
              @action="showDownloadModal = true"
            />
          </n-button-group>

          <c-button
            label="删除"
            secondary
            :round="false"
            size="small"
            type="error"
            @click="openDeleteModal"
          />
          <c-modal
            :title="`确定删除 ${
              selectedIds.length === 1
                ? selectedIds[0]
                : `${selectedIds.length}本小说`
            }？`"
            v-model:show="showDeleteModal"
          >
            <template #action>
              <c-button label="确定" type="primary" @action="deleteSelected" />
            </template>
          </c-modal>
        </n-flex>

        <n-text depth="3">已选择{{ selectedIds.length }}本小说</n-text>
      </n-flex>
    </n-list-item>

    <n-list-item v-if="favoreds.local.length > 1">
      <n-p>移动小说功能暂时关闭</n-p>
      <n-flex v-if="false" vertical>
        <b>移动小说</b>

        <n-radio-group v-model:value="targetFavoredId">
          <n-flex align="center">
            <c-button
              label="移动"
              size="small"
              :round="false"
              @action="moveToFavored"
            />

            <n-radio
              v-for="favored in favoreds.local"
              :key="favored.id"
              :value="favored.id"
            >
              {{ favored.title }}
            </n-radio>
          </n-flex>
        </n-radio-group>
      </n-flex>
    </n-list-item>

    <n-list-item
      v-if="
        setting.enabledTranslator.includes('gpt') ||
        setting.enabledTranslator.includes('sakura') ||
        setting.enabledTranslator.includes('murasaki')
      "
    >
      <n-flex vertical>
        <b>生成翻译任务</b>

        <c-action-wrapper title="选项">
          <n-flex size="small">
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-flex :size="0" :wrap="false">
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
                </n-flex>
              </template>
              过期：翻译术语表过期的章节
              <br />
              重翻：重翻全部章节
              <br />
            </n-tooltip>

            <tag-button label="倒序添加" v-model:checked="reverseOrder" />
          </n-flex>
        </c-action-wrapper>

        <c-action-wrapper title="操作">
          <n-button-group size="small">
            <c-button
              v-if="setting.enabledTranslator.includes('gpt')"
              label="排队GPT"
              :round="false"
              @action="queueJobs('gpt')"
            />
            <c-button
              v-if="setting.enabledTranslator.includes('sakura')"
              label="排队Sakura"
              :round="false"
              @action="queueJobs('sakura')"
            />
            <c-button
              v-if="setting.enabledTranslator.includes('murasaki')"
              label="排队Murasaki"
              :round="false"
              @action="queueJobs('murasaki')"
            />
          </n-button-group>
        </c-action-wrapper>
      </n-flex>
    </n-list-item>
  </n-list>

  <c-modal title="下载设置" v-model:show="showDownloadModal">
    <n-flex vertical size="large">
      <c-action-wrapper title="语言">
        <c-radio-group
          v-model:value="setting.downloadFormat.mode"
          :options="Setting.downloadModeOptions"
        />
      </c-action-wrapper>

      <c-action-wrapper title="翻译">
        <n-flex>
          <c-radio-group
            v-model:value="setting.downloadFormat.translationsMode"
            :options="Setting.downloadTranslationModeOptions"
          />
          <translator-check
            v-model:value="setting.downloadFormat.translations"
            show-order
            :two-line="!isWideScreen"
          />
        </n-flex>
      </c-action-wrapper>

      <n-text depth="3" style="font-size: 12px">
        # 某些EPUB阅读器无法正确显示日文段落的浅色字体
      </n-text>
    </n-flex>
  </c-modal>
</template>
