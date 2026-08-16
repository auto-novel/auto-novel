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
  let message = await formatError(error.value);
  if (message.includes('该小说包含法西斯内容，不予显示')) {
    message = '该小说不符合国家法律法规相关规定，已被屏蔽';
  }
  return message;
});

watch(formatedError, async (errorMessage) => {
  if (errorMessage.includes('小说ID不合适，应当使用：')) {
    const targetNovelPath = errorMessage
      .split('小说ID不合适，应当使用：')[1]
      .trim();
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

    <CResultX v-else :error="formatedError" title="加载错误" />
  </div>
</template>
