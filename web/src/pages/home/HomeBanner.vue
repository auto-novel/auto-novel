<script lang="ts" setup>
import { RefreshOutlined } from '@vicons/material';

import { WebUtil } from '@/util/web';

import { useBannerImage } from './useBannerImage';

const {
  container,
  imageUrl,
  imagePosition,
  loading,
  switching,
  canSwitch,
  switchError,
  nextBanner,
  imageLoaded,
  showFallback,
} = useBannerImage();

const router = useRouter();

const url = ref('');
const query = (url: string) => {
  if (url.length === 0) return;
  const parseResult = WebUtil.parseUrl(url);
  if (parseResult !== undefined) {
    const { providerId, novelId } = parseResult;
    router.push({ path: `/novel/${providerId}/${novelId}` });
  } else {
    router.push({ path: '/novel', query: { query: url } });
  }
};
</script>

<template>
  <div
    ref="container"
    class="relative h-56.25 overflow-hidden bg-border max-[600px]:h-50"
    :aria-busy="loading"
  >
    <img
      v-if="imageUrl"
      v-show="!loading"
      :src="imageUrl"
      :style="{ objectPosition: imagePosition }"
      alt=""
      class="absolute inset-0 h-full w-full object-cover"
      @load="imageLoaded"
      @error="showFallback"
    />
    <div class="relative z-10 h-full bg-black/10">
      <div
        class="mx-auto w-full max-w-200! px-3 pt-5 pb-12.5 sm:px-8 max-[600px]:pt-2.5 max-[600px]:pb-8.75"
      >
        <h1
          class="banner-title mt-7 mb-5 text-center text-[clamp(1.5rem,7vw,3em)] font-semibold text-white"
        >
          轻小说机翻机器人
        </h1>
        <UFieldGroup size="xl" class="w-full">
          <UInput
            v-model="url"
            placeholder="输入网络小说链接直接跳转，或搜索本站缓存..."
            :spellcheck="false"
            @keyup.enter="query(url)"
            class="min-w-0 flex-1"
            :ui="{ base: 'bg-default' }"
          />
          <UButton
            color="primary"
            class="shrink-0 justify-center"
            @click="query(url)"
          >
            搜索
          </UButton>
        </UFieldGroup>
      </div>
      <button
        v-if="canSwitch"
        type="button"
        class="absolute right-3 bottom-2 flex h-8 w-8 items-center justify-center rounded bg-black/15 text-white/70 transition-colors hover:bg-black/35 hover:text-white focus-visible:bg-black/35 focus-visible:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait motion-reduce:transition-none"
        :disabled="loading || switching"
        :aria-busy="switching"
        :title="switchError || '切换下一张背景'"
        aria-label="切换下一张背景"
        @click="nextBanner"
      >
        <RefreshOutlined
          class="size-4.5 shrink-0"
          :class="{ 'animate-spin motion-reduce:animate-none': switching }"
          aria-hidden="true"
        />
      </button>
      <span class="sr-only" role="status">{{ switchError }}</span>
    </div>
  </div>
</template>

<style scoped>
.banner-title {
  -webkit-text-stroke: 0.5px rgb(0 0 0 / 35%);
  paint-order: stroke fill;
  text-shadow:
    0 1px 1px rgb(0 0 0 / 85%),
    0 2px 4px rgb(0 0 0 / 55%);
}
</style>
