import { createApp } from 'vue';
import { createWebKit } from '@novelia/web-kit';
import ui from '@nuxt/ui/vue-plugin';
import App from './App.vue';
import router from './router';
import { bannerApiKey, createBannerApi } from './api';
import './style.css';

const webKit = createWebKit({
  auth: { app: 'n', url: __AUTH_URL__ },
  brand: '小说管理',
  strikes: { enabled: false },
  repository: {
    url: 'https://github.com/auto-novel/auto-novel',
    buildTime: __BUILD_TIME__,
    commitSha: __COMMIT_SHA__,
  },
});

createApp(App)
  .provide(
    bannerApiKey,
    createBannerApi(
      webKit.createClient(
        new URL('/api/v1/', window.location.origin).toString(),
      ),
    ),
  )
  .use(webKit)
  .use(router)
  .use(ui)
  .mount('#app');
