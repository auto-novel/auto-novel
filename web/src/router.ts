import type { LocationQuery } from 'vue-router';
import { createRouter, createWebHistory } from 'vue-router';

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
      children: [
        {
          path: '/auth',
          name: 'auth',
          meta: { title: '统一身份认证' },
          component: () => import('./pages/Auth.vue'),
          props: (route) => ({ from: route.query.from }),
        },
      ],
    },

    {
      path: '/*',
      meta: { isReader: true },
      component: () => import('./pages/reader/ReaderLayout.vue'),
      children: [
        {
          path: '/novel/:providerId/:novelId/:chapterId',
          components: {
            reader: () => import('./pages/reader/Reader.vue'),
          },
        },
        {
          path: '/workspace/reader/:novelId/:chapterId',
          components: {
            reader: () => import('./pages/reader/Reader.vue'),
          },
        },
      ],
    },

    {
      path: '/*',
      component: () => import('./pages/MainLayout.vue'),
      children: [
        {
          path: '/',
          meta: { title: '首页' },
          component: () => import('./pages/home/Home.vue'),
        },

        {
          path: '/favorite',
          redirect: '/favorite/local/default',
          children: [
            {
              path: 'web/:favoredId?',
              meta: { title: '我的收藏' },
              component: () => import('./pages/bookshelf/BookshelfWeb.vue'),
              props: (route) => ({
                page: Number(route.query.page) || 1,
                query: route.query.query || '',
                selected: parseSelected(route.query),
                favoredId: route.params.favoredId || 'default',
              }),
            },
            {
              path: 'wenku/:favoredId?',
              meta: { title: '我的收藏' },
              component: () => import('./pages/bookshelf/BookshelfWenku.vue'),
              props: (route) => ({
                page: Number(route.query.page) || 1,
                selected: parseSelected(route.query),
                favoredId: route.params.favoredId || 'default',
              }),
            },
            {
              path: 'local/:favoredId?',
              meta: { title: '我的收藏' },
              component: () => import('./pages/bookshelf/BookshelfLocal.vue'),
              props: (route) => ({
                favoredId: route.params.favoredId || 'default',
              }),
            },
          ],
        },

        {
          path: '/read-history',
          meta: { title: '阅读历史' },
          component: () => import('./pages/list/ReadHistoryList.vue'),
          props: (route) => ({
            page: Number(route.query.page) || 1,
          }),
        },

        {
          path: '/novel',
          meta: { title: '网络小说' },
          component: () => import('./pages/list/WebNovelList.vue'),
          props: (route) => ({
            page: Number(route.query.page) || 1,
            query: route.query.query || '',
            selected: parseSelected(route.query),
          }),
        },
        {
          path: '/novel/:providerId/:novelId',
          component: () => import('./pages/novel/WebNovel.vue'),
          props: (route) => ({
            providerId: route.params.providerId,
            novelId: route.params.novelId,
            key: route.path,
          }),
        },
        {
          path: '/novel-edit/:providerId/:novelId',
          meta: { title: '编辑网络小说' },
          component: () => import('./pages/novel/WebNovelEdit.vue'),
          props: (route) => ({
            providerId: route.params.providerId,
            novelId: route.params.novelId,
            key: route.path,
          }),
        },

        {
          path: '/wenku',
          meta: { title: '文库小说' },
          component: () => import('./pages/list/WenkuNovelList.vue'),
          props: (route) => ({
            page: Number(route.query.page) || 1,
            query: route.query.query || '',
            selected: parseSelected(route.query),
          }),
        },
        {
          path: '/wenku/:novelId',
          component: () => import('./pages/novel/WenkuNovel.vue'),
          props: (route) => ({
            novelId: route.params.novelId,
            key: route.path,
          }),
        },
        {
          path: '/wenku-edit',
          meta: { title: '新建文库小说' },
          component: () => import('./pages/novel/WenkuNovelEdit.vue'),
          props: (route) => ({
            key: route.path,
          }),
        },
        {
          path: '/wenku-edit/:novelId',
          meta: { title: '编辑文库小说' },
          component: () => import('./pages/novel/WenkuNovelEdit.vue'),
          props: (route) => ({
            novelId: route.params.novelId,
            key: route.path,
          }),
        },

        {
          path: '/rank/web/:providerId/:typeId',
          meta: { title: '小说排行' },
          component: () => import('./pages/list/WebNovelRank.vue'),
          props: (route) => ({
            providerId: route.params.providerId as string,
            typeId: route.params.typeId as string,
            page: Number(route.query.page) || 1,
            selected: parseSelected(route.query),
          }),
        },

        {
          path: '/workspace',
          redirect: '/workspace/sakura',
          children: [
            {
              path: 'gpt',
              meta: { title: 'GPT工作区' },
              component: () => import('./pages/workspace/GptWorkspaceX.vue'),
            },
            {
              path: 'sakura',
              meta: { title: 'Sakura工作区' },
              component: () => import('./pages/workspace/SakuraWorkspaceX.vue'),
            },
            {
              path: 'interactive',
              meta: { title: '交互翻译' },
              component: () => import('./pages/workspace/Interactive.vue'),
            },
            {
              path: 'toolbox',
              meta: { title: '小说工具箱' },
              component: () => import('./pages/workspace/Toolbox.vue'),
            },
          ],
        },

        {
          path: '/forum',
          meta: { title: '论坛' },
          component: () => import('./pages/forum/Forum.vue'),
          props: (route) => ({
            page: Number(route.query.page) || 1,
            category: route.query.category || 'General',
          }),
        },
        {
          path: '/forum/:articleId',
          component: () => import('./pages/forum/ForumArticle.vue'),
          props: (route) => ({
            articleId: route.params.articleId,
            key: route.path,
          }),
        },
        {
          path: '/forum-edit',
          meta: { title: '发布文章' },
          component: () => import('./pages/forum/ForumArticleEdit.vue'),
          props: (route) => ({
            key: route.path,
          }),
        },
        {
          path: '/forum-edit/:articleId',
          meta: { title: '编辑文章' },
          component: () => import('./pages/forum/ForumArticleEdit.vue'),
          props: (route) => ({
            articleId: route.params.articleId,
            key: route.path,
          }),
        },

        {
          path: '/setting',
          meta: { title: '设置' },
          component: () => import('./pages/other/Setting.vue'),
        },

        {
          path: '/admin',
          redirect: '/admin/user',
          component: () => import('./pages/admin/AdminLayout.vue'),
          children: [
            {
              path: 'user',
              component: () => import('./pages/admin/AdminUser.vue'),
              props: (route) => ({
                page: Number(route.query.page) || 1,
                query: route.query.query || '',
                selected: parseSelected(route.query),
              }),
            },
            {
              path: 'operation',
              component: () =>
                import('./pages/admin/AdminOperationHistory.vue'),
            },
            {
              path: 'web-toc-merge-history',
              component: () =>
                import('./pages/admin/AdminWebTocMergeHistory.vue'),
            },
          ],
        },

        // 兼容旧路由
        { path: '/novel-list', redirect: '/novel' }, // 2024-06-25
        { path: '/wenku-list', redirect: '/wenku' }, // 2024-06-25
        { path: '/sakura-workspace', redirect: '/workspace/sakura' },

        // 404
        {
          path: '/:pathMatch(.*)',
          component: () => import('./pages/other/NotFound.vue'),
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
    return { top: savedPosition?.top ?? 0 };
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
