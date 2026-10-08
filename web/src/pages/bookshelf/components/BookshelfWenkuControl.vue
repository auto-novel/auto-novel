<script lang="ts" setup>
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

const message = useMessage();

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
  for (const { id } of novels) {
    try {
      await FavoredRepo.favoriteNovel(targetFavoredId.value, {
        type: 'wenku',
        novelId: id,
      });
    } catch (e) {
      failed += 1;
    }
  }
  const success = novels.length - failed;

  message.info(`${success}本小说已移动，${failed}本失败`);
  window.location.reload();
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
                ? selectedNovels[0].titleZh ?? selectedNovels[0].title
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

    <n-list-item v-if="favoreds.wenku.length > 1">
      <n-flex vertical>
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
              v-for="favored in favoreds.wenku"
              :key="favored.id"
              :value="favored.id"
            >
              {{ favored.title }}
            </n-radio>
          </n-flex>
        </n-radio-group>
      </n-flex>
    </n-list-item>
  </n-list>
</template>
