<script lang="ts" setup>
import { computedAsync } from '@vueuse/core';

import { formatError } from '@/api';
import { CrawlerService } from '@/domain/crawler';
import { useIsWideScreen } from '@/pages/util';
import { WebNovelRepo } from '@/repos';
import { useWhoamiStore } from '@/stores';

const { providerId, novelId } = defineProps<{
  providerId: string;
  novelId: string;
}>();

const isWideScreen = useIsWideScreen();
const router = useRouter();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const { data: novel, error } = WebNovelRepo.useWebNovel(providerId, novelId);

watch(novel, async (novel) => {
  if (novel) {
    document.title = novel.titleJp;
    if (!whoami.value.hasNovelAccess) return;

    const sinceLastSyncMs = Date.now() - novel.syncAt * 1000;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (sinceLastSyncMs < ONE_DAY_MS) return;

    try {
      await CrawlerService.updateWebNovel(providerId, novelId, novel);
    } catch (error) {
      console.error('自动更新目录失败：', error);
    }
  }
});

const formatedError = computedAsync(async () => {
  if (!error.value) return '';
  const message = await formatError(error.value);
  return message;
});

watch(formatedError, async (error) => {
  if (error.includes('小说ID不合适，应当使用：')) {
    const targetNovelPath = error.split('小说ID不合适，应当使用：')[1];
    router.push({ path: `/novel${targetNovelPath}` });
  }
});
</script>

<template>
  <div class="layout-content">
    <template v-if="novel">
      <web-novel-wide
        v-if="isWideScreen"
        :provider-id="providerId"
        :novel-id="novelId"
        :novel="novel"
      />
      <web-novel-narrow
        v-else
        :provider-id="providerId"
        :novel-id="novelId"
        :novel="novel"
      />
    </template>

    <CResultX v-else :error="error" title="加载错误" />
  </div>
</template>
