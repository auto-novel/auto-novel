<script lang="ts" setup>
import { FavoriteBorderOutlined, FavoriteOutlined } from '@vicons/material';
import { XDialog, getApiErrorMessage, Toast } from '@novelia/web-kit';

import { FavoredRepo } from '@/stores';

const props = defineProps<{
  favored: string | undefined;
  novel:
    | { type: 'web'; providerId: string; novelId: string }
    | { type: 'wenku'; novelId: string };
}>();

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds: favoredFull } = storeToRefs(favoredStore);

const favoreds = computed(() => favoredFull.value[props.novel.type]);
const favoredTitle = computed(
  () => favoreds.value.find((it) => it.id === props.favored)?.title,
);

const favoriteNovel = (favoredId: string) =>
  Toast.promise(FavoredRepo.favoriteNovel(favoredId, props.novel), {
    success: '收藏成功',
    error: (reason) => getApiErrorMessage(reason, '收藏失败'),
  })
    .then(() => {
      showFavoredModal.value = false;
    })
    .catch(() => {});

const unfavoriteNovel = async () => {
  if (props.favored === undefined) return;
  await Toast.promise(FavoredRepo.unfavoriteNovel(props.favored, props.novel), {
    success: '取消收藏成功',
    error: (reason) => getApiErrorMessage(reason, '取消收藏失败'),
  })
    .then(() => {
      showFavoredModal.value = false;
    })
    .catch(() => {});
};

const showFavoredModal = ref(false);
const selectedFavoredId = ref(props.favored ?? 'default');
</script>

<template>
  <template v-if="favoreds.length <= 1">
    <c-button
      v-if="favored && favoredTitle"
      label="已收藏"
      :round="false"
      :icon="FavoriteOutlined"
      require-login
      @action="unfavoriteNovel"
    />
    <c-button
      v-else
      label="收藏"
      :round="false"
      :icon="FavoriteBorderOutlined"
      require-login
      @action="favoriteNovel(favoreds[0].id)"
    />
  </template>

  <template v-else>
    <c-button
      :label="favored && favoredTitle ? '已收藏:' + favoredTitle : '收藏'"
      :round="false"
      :icon="favored ? FavoriteOutlined : FavoriteBorderOutlined"
      require-login
      @action="showFavoredModal = true"
    />
  </template>

  <XDialog v-model:open="showFavoredModal" title="收藏到..." class="w-[600px]">
    <n-radio-group v-model:value="selectedFavoredId">
      <div class="flex flex-col flex-nowrap justify-start gap-x-4 gap-y-3">
        <n-radio
          v-for="favoredItem in favoreds"
          :key="favoredItem.id"
          :value="favoredItem.id"
        >
          {{ favoredItem.title }}
        </n-radio>
        <n-radio key="deleted" value="deleted">取消收藏</n-radio>
      </div>
    </n-radio-group>
    <template #footer>
      <c-button
        label="确定"
        require-login
        type="primary"
        @action="
          selectedFavoredId === 'deleted'
            ? unfavoriteNovel()
            : favoriteNovel(selectedFavoredId)
        "
      />
    </template>
  </XDialog>
</template>
