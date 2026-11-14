import { webKit } from './webKit';
import { PiniaColada } from '@pinia/colada';
import ui from '@nuxt/ui/vue-plugin';

import App from './App.vue';
import router from './router';
import './style.css';

const app = createApp(App);

const pinia = createPinia();
app.use(pinia);
app.use(PiniaColada, {
  queryOptions: {
    gcTime: 3600_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
});

app.use(webKit);
app.use(router);
app.use(ui);
app.mount('#app');
