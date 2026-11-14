<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';

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
              selectedNovels.length === 1
                ? selectedNovels[0].titleZh ?? selectedNovels[0].title
                : `${selectedNovels.length}本小说`
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
        <span class="text-muted">已选择{{ selectedNovels.length }}本小说</span>
      </div>
    </div>

    <div class="relative min-w-0 py-3 px-5" v-if="favoreds.wenku.length > 1">
      <div class="flex flex-col gap-y-2">
        <b>移动小说（低配版，很慢，等到显示移动完成）</b>

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
              v-for="favored in favoreds.wenku"
              :key="favored.id"
              :value="favored.id"
            >
              {{ favored.title }}
            </n-radio>
          </div>
        </n-radio-group>
      </div>
    </div>
  </div>
</template>
