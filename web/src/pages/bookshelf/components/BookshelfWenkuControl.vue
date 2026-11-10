<script lang="ts" setup>
import { Toast, XDialog } from '@novelia/web-kit';

import type { WenkuNovelOutlineDto } from '@/model/WenkuNovel';
import { FavoredRepo } from '@/stores';

const props = defineProps<{
  selectedNovels: WenkuNovelOutlineDto[];
  favoredId: string;
}>();
defineEmits<{
  selectAll: [];
  invertSelection: [];
}>();

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

// 删除小说
const showDeleteModal = ref(false);

const openDeleteModal = () => {
  const novels = props.selectedNovels;
  if (novels.length === 0) {
    Toast.info('没有选中小说');
    return;
  }
  showDeleteModal.value = true;
};

const deleteSelected = async () => {
  const novels = props.selectedNovels;
  let failed = 0;
  for (const { id } of novels) {
    try {
      await FavoredRepo.unfavoriteNovel(props.favoredId, {
        type: 'wenku',
        novelId: id,
      });
    } catch (e) {
      failed += 1;
    }
  }
  const success = novels.length - failed;

  Toast.info(`${success}本小说被删除，${failed}本失败`);
};

// 移动小说
const targetFavoredId = ref(props.favoredId);
watch(
  () => props.favoredId,
  (favoredId) => {
    targetFavoredId.value = favoredId;
    showDeleteModal.value = false;
  },
);

const moveToFavored = async () => {
  const novels = props.selectedNovels;
  if (novels.length === 0) {
    Toast.info('没有选中小说');
    return;
  }

  if (targetFavoredId.value === props.favoredId) {
    Toast.info('无需移动');
    return;
  }

  const { success, failed, refreshFailed } = await FavoredRepo.moveNovels(
    targetFavoredId.value,
    novels.map(({ id }) => ({ type: 'wenku', novelId: id })),
  );

  Toast.info(`${success}本小说已移动，${failed}本失败`);
  if (refreshFailed) {
    Toast.warning('移动结果已保存，但列表刷新失败，请刷新页面');
  }
};
</script>

<template>
  <n-list bordered>
    <n-list-item>
      <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
        <div
          class="flex flex-wrap justify-start items-baseline gap-x-3 gap-y-2"
        >
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
          <XDialog
            :title="`确定删除 ${
              selectedNovels.length === 1
                ? selectedNovels[0].titleZh ?? selectedNovels[0].title
                : `${selectedNovels.length}本小说`
            }？`"
            v-model:open="showDeleteModal"
            class="w-[600px]"
          >
            <template #footer>
              <c-button label="确定" type="primary" @action="deleteSelected" />
            </template>
          </XDialog>
        </div>
        <n-text depth="3">已选择{{ selectedNovels.length }}本小说</n-text>
      </div>
    </n-list-item>

    <n-list-item v-if="favoreds.wenku.length > 1">
      <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
        <b>移动小说（低配版，很慢，等到显示移动完成）</b>

        <n-radio-group v-model:value="targetFavoredId">
          <div
            class="flex flex-wrap justify-start items-center gap-x-3 gap-y-2"
          >
            <c-button
              label="移动"
              size="small"
              :round="false"
              @action="moveToFavored"
            />

            <n-radio
              v-for="favored in favoreds.wenku"
              :key="favored.id"
              :value="favored.id"
            >
              {{ favored.title }}
            </n-radio>
          </div>
        </n-radio-group>
      </div>
    </n-list-item>
  </n-list>
</template>
