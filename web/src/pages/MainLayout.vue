<script lang="ts" setup>
import {
  WebKitLayout,
  XButton,
  useWebKitViewport,
  type WebKitMenuOption,
} from '@novelia/web-kit';
import {
  AndroidOutlined,
  BookOutlined,
  ForumOutlined,
  HistoryOutlined,
  HomeOutlined,
  LanguageOutlined,
  LocalFireDepartmentOutlined,
  SettingsOutlined,
  StarBorderOutlined,
  WorkspacesOutlined,
} from '@vicons/material';
import { forumCommunityUrl, siteUrls } from '@/config';
import { useWhoamiStore } from '@/stores';

const route = useRoute();
const { isMobile } = useWebKitViewport();
const { whoami } = storeToRefs(useWhoamiStore());
const favoriteTo = computed(() =>
  whoami.value.isSignedIn ? '/favorite/web' : '/favorite/local',
);
const navigationOptions = computed<WebKitMenuOption[]>(() => [
  { key: '/', label: '首页', icon: HomeOutlined, to: '/' },
  {
    key: '/favorite',
    label: '我的收藏',
    icon: StarBorderOutlined,
    to: favoriteTo.value,
  },
  ...(whoami.value.isSignedIn
    ? [
        {
          key: '/read-history',
          label: '阅读历史',
          icon: HistoryOutlined,
          to: '/read-history',
        },
      ]
    : []),
  { key: '/novel', label: '网络小说', icon: LanguageOutlined, to: '/novel' },
  { key: '/wenku', label: '文库小说', icon: BookOutlined, to: '/wenku' },
  {
    type: 'group',
    key: '/rank',
    label: '小说排行',
    icon: LocalFireDepartmentOutlined,
    children: [
      {
        key: '/rank/web/syosetu/1',
        label: '成为小说家：流派',
        to: '/rank/web/syosetu/1',
      },
      {
        key: '/rank/web/syosetu/2',
        label: '成为小说家：综合',
        to: '/rank/web/syosetu/2',
      },
      {
        key: '/rank/web/syosetu/3',
        label: '成为小说家：异世界转移/转生',
        to: '/rank/web/syosetu/3',
      },
      {
        key: '/rank/web/kakuyomu/1',
        label: 'Kakuyomu：流派',
        to: '/rank/web/kakuyomu/1',
      },
    ],
  },
  { type: 'divider', key: 'divider' },
  {
    type: 'group',
    key: '/workspace',
    label: '工具箱',
    icon: WorkspacesOutlined,
    children: [
      {
        key: '/workspace/toolbox',
        label: '小说处理',
        to: '/workspace/toolbox',
      },
      {
        key: '/workspace/gpt-pipeline',
        label: 'GPT工作区',
        to: '/workspace/gpt-pipeline',
      },
      {
        key: '/workspace/sakura-pipeline',
        label: 'Sakura工作区',
        to: '/workspace/sakura-pipeline',
      },
      {
        key: '/workspace/sakura',
        label: 'Sakura工作区（待废弃）',
        to: '/workspace/sakura',
      },
    ],
  },
  {
    type: 'external',
    key: 'forum',
    label: '论坛',
    icon: ForumOutlined,
    href: forumCommunityUrl,
  },
  {
    type: 'external',
    key: 'android-app',
    label: '安卓 App',
    icon: AndroidOutlined,
    href: siteUrls.androidApp,
  },
  { key: '/setting', label: '设置', icon: SettingsOutlined, to: '/setting' },
]);
const menuKey = computed(() => {
  for (const key of ['/novel', '/wenku', '/favorite']) {
    if (route.path.startsWith(key)) return key;
  }
  return route.path;
});
</script>

<template>
  <WebKitLayout
    :navigation-options="navigationOptions"
    :account-options="[]"
    :selected-navigation-key="menuKey"
  >
    <template v-if="isMobile" #header-actions>
      <RouterLink :to="favoriteTo" aria-label="我的收藏">
        <XButton
          size="icon"
          color="neutral"
          variant="ghost"
          class="text-ink hover:bg-divider/40 hover:text-ink"
          aria-label="我的收藏"
        >
          <StarBorderOutlined class="size-5" aria-hidden="true" />
        </XButton>
      </RouterLink>
    </template>
    <div class="novel-page-content">
      <router-view v-slot="{ Component }">
        <keep-alive
          :include="[
            'Forum',
            'Index',
            'BookshelfWeb',
            'BookshelfWenku',
            'ReadHistoryList',
            'WebNovelList',
            'WebNovelRank',
            'WenkuNovelList',
          ]"
        >
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>
  </WebKitLayout>
</template>

<style scoped>
.novel-page-content {
  min-height: calc(100vh - 50px);
  padding-bottom: 64px;
}
</style>
