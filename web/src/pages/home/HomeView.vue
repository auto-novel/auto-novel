<script lang="ts" setup>
import {
  BookOutlined,
  ForumOutlined,
  LanguageOutlined,
  ReadMoreOutlined,
  StarBorderOutlined,
} from '@vicons/material';
import { XDialog } from '@novelia/web-kit';

import { FavoredApi } from '@/api';
import { forumPostUrls, forumUrl, siteUrls } from '@/config';
import { WebNovelRepo, WenkuNovelRepo } from '@/repos';
import type { WebNovelOutlineDto } from '@/model/WebNovel';
import { useWhoamiStore } from '@/stores';

import HomeBanner from './HomeBanner.vue';
import PanelWebNovel from './PanelWebNovel.vue';
import PanelWenkuNovel from './PanelWenkuNovel.vue';

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const favoriteList = ref<{
  data?: WebNovelOutlineDto[];
  error: Error | null;
}>({ error: null });
const loadFavorite = async () => {
  try {
    const data = await FavoredApi.listFavoredWebNovel('default', {
      page: 0,
      pageSize: 8,
      query: '',
      provider: 'kakuyomu,syosetu,novelup,hameln,pixiv,alphapolis',
      type: 0,
      level: 0,
      translate: 0,
      sort: 'update',
    }).then((it) => it.items);
    favoriteList.value = { data, error: null };
  } catch (e) {
    favoriteList.value = { error: e as Error };
  }
};
watch(
  () => whoami.value.isSignedIn,
  (isSignedIn) => {
    if (isSignedIn) {
      loadFavorite();
    }
  },
  { immediate: true },
);

const { data: mostVisitedWeb, error: mostVisitedWebError } =
  WebNovelRepo.useWebNovelList(1, {
    provider: 'kakuyomu,syosetu,novelup,hameln,pixiv,alphapolis',
    sort: 1,
    level: 1,
  });

const { data: latestUpdateWenku, error: latestUpdateWenkuError } =
  WenkuNovelRepo.useWenkuNovelList(1, { level: 0 });

const showHowToUseModal = ref(false);
const linkExample = [
  ['Kakuyomu', 'https://kakuyomu.jp/works/16817139555217983105'],
  [
    '成为小说家吧',
    'https://ncode.syosetu.com/n0833hi <br /> https://novel18.syosetu.com/n3192gh',
  ],
  ['Novelup', 'https://novelup.plus/story/206612087'],
  ['Hameln', 'https://syosetu.org/novel/297874/'],
  [
    'Pixiv系列/短篇',
    'https://www.pixiv.net/novel/series/9406879 <br/> https://www.pixiv.net/novel/show.php?id=18304868',
  ],
  ['Alphapolis', 'https://www.alphapolis.co.jp/novel/638978238/525733370'],
];

const showQQModal = ref(false);
</script>

<template>
  <HomeBanner />

  <div class="layout-content min-[540px]:pt-4">
    <div class="my-2 grid grid-cols-4 min-[540px]:hidden">
      <router-link
        :to="whoami.isSignedIn ? '/favorite/web' : '/favorite/local'"
      >
        <n-button quaternary block class="h-16!">
          <div class="flex flex-col items-center gap-2 text-xs">
            <n-icon size="24" :component="StarBorderOutlined" />
            我的收藏
          </div>
        </n-button>
      </router-link>

      <router-link to="/novel">
        <n-button quaternary block class="h-16!">
          <div class="flex flex-col items-center gap-2 text-xs">
            <n-icon size="24" :component="LanguageOutlined" />
            网络小说
          </div>
        </n-button>
      </router-link>

      <router-link to="/wenku">
        <n-button quaternary block class="h-16!">
          <div class="flex flex-col items-center gap-2 text-xs">
            <n-icon size="24" :component="BookOutlined" />
            文库小说
          </div>
        </n-button>
      </router-link>

      <n-a :href="forumUrl" target="_blank" rel="noopener noreferrer">
        <n-button quaternary block class="h-16!">
          <div class="flex flex-col items-center gap-2 text-xs">
            <n-icon size="24" :component="ForumOutlined" />
            论坛
          </div>
        </n-button>
      </n-a>
    </div>

    <bulletin>
      <div class="flex flex-wrap gap-x-3 gap-y-2">
        <n-button text type="primary" @click="showHowToUseModal = true">
          使用说明
        </n-button>
        /
        <n-button text type="primary" @click="showQQModal = true">
          QQ群
        </n-button>
        /
        <n-a :href="siteUrls.telegram" target="_blank">Telegram</n-a>
        /
        <n-a :href="siteUrls.repository" target="_blank">GitHub</n-a>
      </div>
      <p class="my-4 first:mt-0 last:mb-0">
        交互翻译已恢复，点击工作区翻译器上的「试译」按钮即可使用。
      </p>
      <p class="my-4 first:mt-0 last:mb-0">
        禁止使用脚本绕过翻译器提交翻译文本，哪怕你觉得自己提交的是正经翻译。
      </p>
      <p class="my-4 first:mt-0 last:mb-0">
        FishHawk长期996，网站开发速度大幅下降已成常态，论坛反馈目前没有精力维护，有问题加群@吧
      </p>
    </bulletin>

    <template v-if="whoami.isSignedIn">
      <section-header title="我的收藏">
        <router-link to="/favorite/web">
          <c-button label="更多" :icon="ReadMoreOutlined" />
        </router-link>
      </section-header>
      <PanelWebNovel
        :novels="favoriteList?.data?.slice(0, 8)"
        :error="favoriteList?.error"
      />
      <hr class="my-6 border-divider" />
    </template>

    <section-header title="网络小说-最多点击">
      <router-link to="/novel">
        <c-button label="更多" :icon="ReadMoreOutlined" />
      </router-link>
    </section-header>
    <PanelWebNovel
      :novels="mostVisitedWeb?.items?.slice(0, 8)"
      :error="mostVisitedWebError"
    />
    <hr class="my-6 border-divider" />

    <section-header title="文库小说-最新更新">
      <router-link to="/wenku">
        <c-button label="更多" :icon="ReadMoreOutlined" />
      </router-link>
    </section-header>
    <PanelWenkuNovel
      :novels="latestUpdateWenku?.items?.slice(0, 12)"
      :error="latestUpdateWenkuError"
    />
    <hr class="my-6 border-divider" />
  </div>

  <XDialog title="使用说明" v-model:open="showHowToUseModal" class="w-150">
    <p class="my-4 first:mt-0 last:mb-0">
      将小说链接复制到网站首页的输入框里，点击搜索，如果链接正确，将会跳转到小说页面。更高级的用法，例如生成机翻、高级搜索等，参见
      <n-a
        :href="forumPostUrls.usageGuide"
        target="_blank"
        rel="noopener noreferrer"
      >
        使用教程
      </n-a>
      。有什么问题和建议请在
      <n-a :href="forumUrl" target="_blank" rel="noopener noreferrer">论坛</n-a>
      中发帖讨论。
    </p>
    <p class="my-4 first:mt-0 last:mb-0">支持的小说站如下:</p>
    <p
      v-for="[name, link] of linkExample"
      :key="name"
      class="my-4 first:mt-0 last:mb-0"
    >
      <b>{{ name }}</b>
      <br />
      <!-- eslint-disable-next-line vue/no-v-html -->
      <span v-html="link" />
    </p>
  </XDialog>

  <XDialog title="QQ群No.2" v-model:open="showQQModal" class="w-150">
    <p class="my-4 first:mt-0 last:mb-0">
      交流群：
      <n-a :href="siteUrls.qqGroup" target="_blank">1131569744</n-a>
      ，验证答案是“绿色”。
      <br />
      <n-qr-code :size="150" :value="siteUrls.qqGroup" />
    </p>
  </XDialog>
</template>
