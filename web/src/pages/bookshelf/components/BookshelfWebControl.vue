<script lang="ts" setup>
import { useKeyModifier } from '@vueuse/core';

import { TranslateTaskDescriptor } from '@/model/Translator';
import type { WebNovelOutlineDto } from '@/model/WebNovel';
import { FavoredRepo, useSettingStore, useWorkspaceStore } from '@/stores';

const props = defineProps<{
  selectedNovels: WebNovelOutlineDto[];
  favoredId: string;
}>();
defineEmits<{
  selectAll: [];
  invertSelection: [];
}>();

const message = useMessage();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

// 删除小说
const showDeleteModal = ref(false);

const openDeleteModal = () => {
  const novels = props.selectedNovels;
  if (novels.length === 0) {
    message.info('没有选中小说');
    return;
  }
  showDeleteModal.value = true;
};

const deleteSelected = async () => {
  const novels = props.selectedNovels;
  let failed = 0;
  for (const { providerId, novelId } of novels) {
    try {
      await FavoredRepo.unfavoriteNovel(props.favoredId, {
        type: 'web',
        providerId,
        novelId,
      });
    } catch (e) {
      failed += 1;
    }
  }
  const success = novels.length - failed;

  message.info(`${success}本小说被删除，${failed}本失败`);
};

// 移动小说
const targetFavoredId = ref(props.favoredId);

const moveToFavored = async () => {
  const novels = props.selectedNovels;
  if (novels.length === 0) {
    message.info('没有选中小说');
    return;
  }

  if (targetFavoredId.value === props.favoredId) {
    message.info('无需移动');
    return;
  }

  let failed = 0;
  for (const { providerId, novelId } of novels) {
    try {
      await FavoredRepo.unfavoriteNovel(targetFavoredId.value, {
        type: 'web',

        providerId,
        novelId,
      });
    } catch (e) {
      failed += 1;
    }
  }
  const success = novels.length - failed;

  message.info(`${success}本小说已移动，${failed}本失败`);
  window.location.reload();
};

// 生成翻译任务
const translateLevel = ref<'normal' | 'expire' | 'all'>('normal');
const forceMetadata = ref(false);
const first5 = ref(false);
const reverseOrder = ref(false);
const shouldTopJob = useKeyModifier('Control');

const queueJobs = (type: 'gpt' | 'sakura' | 'murasaki') => {
  let novels = props.selectedNovels;
  if (novels.length === 0) {
    message.info('没有选中小说');
    return;
  }

  const workspace = useWorkspaceStore(type);

  if (reverseOrder.value) {
    novels = novels.slice().reverse();
  }

  let failed = 0;
  novels.forEach(({ providerId, novelId, titleJp }) => {
    const task = TranslateTaskDescriptor.web(providerId, novelId, {
      level: translateLevel.value,
      forceMetadata: forceMetadata.value,
      startIndex: 0,
      endIndex: first5.value ? 5 : 65535,
    });
    const job = {
      task,
      description: titleJp,
      createAt: Date.now(),
    };
    const success = workspace.addJob(job);
    if (success && shouldTopJob.value) {
      workspace.topJob(job);
    }
    if (!success) {
      failed += 1;
    }
  });
  const success = novels.length - failed;
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
              selectedNovels.length === 1
                ? selectedNovels[0].titleZh ?? selectedNovels[0].titleJp
                : `${selectedNovels.length}本小说`
            }？`"
            v-model:show="showDeleteModal"
          >
            <template #action>
              <c-button label="确定" type="primary" @action="deleteSelected" />
            </template>
          </c-modal>
        </n-flex>

        <n-text depth="3">已选择{{ selectedNovels.length }}本小说</n-text>
      </n-flex>
    </n-list-item>

    <n-list-item v-if="favoreds.web.length > 1">
      <n-p>移动小说功能暂时关闭</n-p>
      <n-flex v-if="false" vertical>
        <b>移动小说（低配版，很慢，等到显示移动完成）</b>

        <n-radio-group v-model:value="targetFavoredId">
          <n-flex align="center">
            <c-button
              label="移动"
              size="small"
              :round="false"
              @action="moveToFavored"
            />

            <n-radio
              v-for="favored in favoreds.web"
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

        <n-flex size="small">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-flex :size="0" :wrap="false">
                <tag-button
                  label="常规"
                  :checked="translateLevel === 'normal'"
                  @update:checked="translateLevel = 'normal'"
                />
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
            常规：只翻译未翻译的章节
            <br />
            过期：翻译术语表过期的章节
            <br />
            重翻：重翻全部章节
            <br />
          </n-tooltip>

          <tag-button label="重翻目录" v-model:checked="forceMetadata" />
          <tag-button label="前5话" v-model:checked="first5" />
          <tag-button label="倒序添加" v-model:checked="reverseOrder" />

          <n-text
            v-if="translateLevel === 'all'"
            type="warning"
            style="font-size: 12px; flex-basis: 100%"
          >
            <b>* 请确保你知道自己在干啥，不要随便使用危险功能</b>
          </n-text>
        </n-flex>

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
      </n-flex>
    </n-list-item>
  </n-list>
</template>
