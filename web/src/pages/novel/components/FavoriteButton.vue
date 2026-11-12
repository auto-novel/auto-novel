<script lang="ts" setup>
import { useRequireLogin } from '@/util/useRequireLogin';
import { FavoriteBorderOutlined, FavoriteOutlined } from '@vicons/material';
import { getApiErrorMessage, Toast } from '@novelia/web-kit';

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
const requireLogin = useRequireLogin();
</script>

<template>
  <template v-if="favoreds.length <= 1">
    <ActionButton
      v-if="favored && favoredTitle"
      class="rounded-md"
      :action="requireLogin(unfavoriteNovel)"
      :icon="FavoriteOutlined"
      :ui="{ leadingIcon: 'size-4.5' }"
    >
      已收藏
    </ActionButton>
    <ActionButton
      v-else
      class="rounded-md"
      :action="requireLogin(() => favoriteNovel(favoreds[0].id))"
      :icon="FavoriteBorderOutlined"
      :ui="{ leadingIcon: 'size-4.5' }"
    >
      收藏
    </ActionButton>
  </template>

  <template v-else>
    <UButton
      :icon="favored ? FavoriteOutlined : FavoriteBorderOutlined"
      color="neutral"
      variant="outline"
      @click="requireLogin(() => (showFavoredModal = true))()"
    >
      {{ favored && favoredTitle ? '已收藏:' + favoredTitle : '收藏' }}
    </UButton>
  </template>

  <UModal
    v-model:open="showFavoredModal"
    title="收藏到..."
    class="w-150"
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
  >
    <template #body>
      <n-radio-group v-model:value="selectedFavoredId">
        <div class="flex flex-col gap-y-3">
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
    </template>
    <template #footer>
      <ActionButton
        color="primary"
        :action="
          requireLogin(() =>
            selectedFavoredId === 'deleted'
              ? unfavoriteNovel()
              : favoriteNovel(selectedFavoredId),
          )
        "
        variant="solid"
      >
        确定
      </ActionButton>
    </template>
  </UModal>
</template>
