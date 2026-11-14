import { MyStrikeListView, restoreScrollPosition } from '@novelia/web-kit';
import type { LocationQuery } from 'vue-router';
import { createRouter, createWebHistory } from 'vue-router';

import MainLayout from './pages/MainLayout.vue';
import BookshelfView from './pages/bookshelf/BookshelfView.vue';
import ReadHistoryView from './pages/history/ReadHistoryView.vue';
import HomeView from './pages/home/HomeView.vue';
import WebNovelList from './pages/list/WebNovelList.vue';
import WebNovelRank from './pages/list/WebNovelRank.vue';
import WenkuNovelList from './pages/list/WenkuNovelList.vue';
import WebNovel from './pages/novel/WebNovel.vue';
import WebNovelEdit from './pages/novel/WebNovelEdit.vue';
import WenkuNovel from './pages/novel/WenkuNovel.vue';
import WenkuNovelEdit from './pages/novel/WenkuNovelEdit.vue';
import NotFound from './pages/other/NotFound.vue';
import Setting from './pages/other/Setting.vue';
import Reader from './pages/reader/Reader.vue';
import ReaderLayout from './pages/reader/ReaderLayout.vue';
import ProcessView from './pages/toolbox/process/ProcessView.vue';
import WorkspaceView from './pages/workspace/WorkspaceView.vue';

const parseSelected = (q: LocationQuery) => {
  const selected = <number[]>[];
  if (typeof q.selected === 'string') {
    selected[0] = Number(q.selected) || 0;
  } else if (q.selected) {
    q.selected.forEach((it, index) => {
      selected[index] = Number(it) || 0;
    });
  }
  return selected;
};

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/*',
      meta: { isReader: true },
      component: ReaderLayout,
      children: [
        {
          path: '/novel/:providerId/:novelId/:chapterId',
          components: {
            reader: Reader,
          },
        },
        {
          path: '/workspace/reader/:novelId/:chapterId',
          components: {
            reader: Reader,
          },
        },
      ],
    },

    {
      path: '/*',
      component: MainLayout,
      children: [
        {
          path: '/strikes',
          name: 'strikes',
          meta: { title: '处罚记录' },
          component: MyStrikeListView,
        },
        {
          path: '/',
          meta: { title: '首页' },
          component: HomeView,
        },

        {
          path: '/favorite',
          redirect: '/favorite/local/default',
        },
        {
          path: '/favorite/:type(web|wenku|local)/:favoredId?',
          component: BookshelfView,
          meta: { title: '我的收藏' },
          props: (route) => ({
            type: route.params.type,
            favoredId: route.params.favoredId || 'default',
            page: Number(route.query.page) || 1,
            query: route.query.query || '',
            selected: parseSelected(route.query),
          }),
        },

        {
          path: '/read-history',
          meta: { title: '阅读历史' },
          component: ReadHistoryView,
          props: (route) => ({
            page: Number(route.query.page) || 1,
          }),
        },

        {
          path: '/novel',
          meta: { title: '网络小说' },
          component: WebNovelList,
          props: (route) => ({
            page: Number(route.query.page) || 1,
            query: route.query.query || '',
            selected: parseSelected(route.query),
          }),
        },
        {
          path: '/novel/:providerId/:novelId',
          component: WebNovel,
          props: (route) => ({
            providerId: route.params.providerId,
            novelId: route.params.novelId,
            key: route.path,
          }),
        },
        {
          path: '/novel-edit/:providerId/:novelId',
          meta: { title: '编辑网络小说' },
          component: WebNovelEdit,
          props: (route) => ({
            providerId: route.params.providerId,
            novelId: route.params.novelId,
            key: route.path,
          }),
        },

        {
          path: '/wenku',
          meta: { title: '文库小说' },
          component: WenkuNovelList,
          props: (route) => ({
            page: Number(route.query.page) || 1,
            query: route.query.query || '',
            selected: parseSelected(route.query),
          }),
        },
        {
          path: '/wenku/:novelId',
          component: WenkuNovel,
          props: (route) => ({
            novelId: route.params.novelId,
            key: route.path,
          }),
        },
        {
          path: '/wenku-edit',
          meta: { title: '新建文库小说' },
          component: WenkuNovelEdit,
          props: (route) => ({
            key: route.path,
          }),
        },
        {
          path: '/wenku-edit/:novelId',
          meta: { title: '编辑文库小说' },
          component: WenkuNovelEdit,
          props: (route) => ({
            novelId: route.params.novelId,
            key: route.path,
          }),
        },

        {
          path: '/rank/web/:providerId/:typeId',
          meta: { title: '小说排行' },
          component: WebNovelRank,
          props: (route) => ({
            providerId: route.params.providerId as string,
            typeId: route.params.typeId as string,
            page: Number(route.query.page) || 1,
            selected: parseSelected(route.query),
          }),
        },

        {
          path: '/workspace',
          redirect: '/workspace/sakura-pipeline',
          children: [
            {
              path: 'gpt',
              redirect: '/workspace/gpt-pipeline',
            },
            {
              path: 'sakura',
              redirect: '/workspace/sakura-pipeline',
            },
            {
              path: 'gpt-pipeline',
              meta: { title: 'GPT工作区' },
              component: WorkspaceView,
              props: { translatorId: 'gpt', key: 'gpt-pipeline' },
            },
            {
              path: 'sakura-pipeline',
              meta: { title: 'Sakura工作区' },
              component: WorkspaceView,
              props: { translatorId: 'sakura', key: 'sakura-pipeline' },
            },
            {
              path: 'toolbox',
              meta: { title: '处理' },
              component: ProcessView,
            },
          ],
        },

        {
          path: '/setting',
          meta: { title: '设置' },
          component: Setting,
        },

        // 兼容旧路由
        { path: '/novel-list', redirect: '/novel' }, // 2024-06-25
        { path: '/wenku-list', redirect: '/wenku' }, // 2024-06-25
        { path: '/sakura-workspace', redirect: '/workspace/sakura' },

        // 404
        {
          path: '/:pathMatch(.*)',
          component: NotFound,
        },
      ],
    },
  ],

  scrollBehavior(to, from, savedPosition) {
    if (to.meta.isReader && from.meta.isReader) return;

    if (to.hash) {
      const decodedHash = encodeURIComponent(to.hash.substring(1));
      const element = document.getElementById(decodedHash);
      if (element) {
        const top = element.getBoundingClientRect().top + window.scrollY - 58; // 50 是 navbar 的高度
        setTimeout(() => window.scrollTo({ top }));
        return { top };
      }
    }
    if (savedPosition) {
      return restoreScrollPosition(
        savedPosition,
        () => router.currentRoute.value === to,
      );
    }
    return { top: 0 };
  },
});

router.afterEach((to, from) => {
  // 章节之间标题依靠手动切换，这里跳过
  if (!(to.meta.isReader && from.meta.isReader)) {
    const titleParts = [];

    if (to.meta.title) {
      titleParts.push(to.meta.title);
    }
    if (to.query.query) {
      titleParts.push(`搜索:${to.query.query}`);
    }
    if (titleParts.length > 0) {
      titleParts.push('|');
    }

    titleParts.push('轻小说机翻机器人');

    document.title = titleParts.join(' ');
  }
});

export default router;
