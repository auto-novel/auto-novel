<script lang="ts" setup>
import { createReusableTemplate, onKeyDown } from '@vueuse/core';

import { ReadHistoryApi } from '@/api';
import { GenericNovelId } from '@/model/Common';
import type { TranslatorId } from '@/model/Translator';
import { checkIsMobile } from '@/pages/util';
import { ReadPositionRepo } from '@/repos';
import {
  useLocalVolumeStore,
  useReaderSettingStore,
  useWhoamiStore,
} from '@/stores';
import type { Result } from '@/util/result';
import type { ReaderChapter } from './ReaderStore';
import { useReaderStore } from './ReaderStore';
import ReaderLayoutDesktop from './components/ReaderLayoutDesktop.vue';
import ReaderLayoutMobile from './components/ReaderLayoutMobile.vue';
import { useScrollDetector } from './components/useScrollDetector';

const [DefineChapterLink, ReuseChapterLink] = createReusableTemplate<{
  label: string;
  id: string | undefined;
}>();

const route = useRoute();
const router = useRouter();
const isMobile = checkIsMobile();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const readerSettingStore = useReaderSettingStore();
const { readerSetting } = storeToRefs(readerSettingStore);

const gnid = ((): GenericNovelId => {
  const path = route.path;
  const params = route.params;
  if (path.startsWith('/novel')) {
    const providerId = params.providerId as string;
    const novelId = params.novelId as string;
    return GenericNovelId.web(providerId, novelId);
  } else {
    const volumeId = params.novelId as string;
    return GenericNovelId.local(volumeId);
  }
})();

const store = useReaderStore(gnid);

const targetChapterId = ref('');
const currentChapterId = ref('');
const chapterResult = shallowRef<Result<ReaderChapter>>();
const chapterList = ref<
  { chapterId: string; result?: Result<ReaderChapter> }[]
>([]);
const loadingBar = useLoadingBar();

const novelUrl = (() => {
  if (gnid.type === 'web') {
    return `/novel/${gnid.providerId}/${gnid.novelId}`;
  }
})();

const updateChapter = (
  chapterId: string,
  result: Result<ReaderChapter>,
  replace = false,
) => {
  if (result.ok) {
    document.title = result.value.titleJp;
    if (gnid.type === 'web' && whoami.value.isSignedIn) {
      ReadHistoryApi.updateReadHistoryWeb(
        gnid.providerId,
        gnid.novelId,
        chapterId,
      );
    } else if (gnid.type === 'local') {
      useLocalVolumeStore().then((it) => it.updateReadAt(gnid.volumeId));
    }
    if (result.value.nextId) {
      store.preloadChapter(result.value.nextId);
    }
  }

  let prefix: string;
  if (gnid.type === 'web') {
    prefix = `/novel/${gnid.providerId}/${gnid.novelId}`;
  } else if (gnid.type === 'wenku') {
    throw '不支持文库';
  } else {
    prefix = `/workspace/reader/${encodeURIComponent(gnid.volumeId)}`;
  }
  currentChapterId.value = chapterId;

  if (replace) {
    router.replace(`${prefix}/${chapterId}`);
  } else {
    router.push(`${prefix}/${chapterId}`);
  }
};

const navToChapter = async (chapterId: string) => {
  targetChapterId.value = chapterId;

  const { type, promiseOrValue } = store.loadChapter(chapterId);

  if (type === 'async') {
    loadingBar.start();
  }

  const result = await promiseOrValue;
  if (chapterId !== targetChapterId.value) {
    return;
  }

  if (result.ok) {
    loadingBar.finish();
  } else {
    loadingBar.error();
  }

  chapterResult.value = result;
  chapterList.value = [{ chapterId, result }];
  window.scrollTo(0, 0);

  if (currentChapterId.value !== chapterId) {
    updateChapter(chapterId, result);
  }
};

const scrollToReadPosition = async () => {
  const readPosition = ReadPositionRepo.getPosition(gnid);
  if (readPosition && readPosition.chapterId === route.params.chapterId) {
    // hacky: 等待段落显示完成
    await nextTick();
    await nextTick();
    window.scrollTo({ top: readPosition.scrollY });
  }
};

watch(chapterResult, scrollToReadPosition, { once: true });
watch(
  () => readerSetting.value.pageTurnMode,
  async () => {
    await navToChapter(currentChapterId.value);
    scrollToReadPosition();
  },
);

watch(
  route,
  (route) => {
    const urlChapterId = route.params.chapterId as string;
    if (urlChapterId !== targetChapterId.value) {
      chapterResult.value = undefined;
      navToChapter(urlChapterId);
    }
  },
  {
    immediate: true,
  },
);

useScrollDetector((payload) => {
  ReadPositionRepo.addPosition(gnid, {
    chapterId: payload.chapterId,
    scrollY: payload.y,
  });

  if (readerSetting.value.pageTurnMode === 'scroll') {
    // 预加载下一章
    if (
      payload.percent > 0.8 &&
      chapterResult.value?.ok &&
      chapterResult.value.value.nextId
    ) {
      const id = chapterResult.value.value.nextId;
      if (chapterList.value.every((it) => it.chapterId !== id)) {
        chapterList.value.push({ chapterId: id });

        (async () => {
          const result = await store.loadChapter(id).promiseOrValue;
          const chapter = chapterList.value.find((it) => it.chapterId === id)!;
          chapter.result = result;
        })();
      }
    }

    if (payload.chapterId !== route.params.chapterId) {
      // 更新标题/章节/链接
      const chapter = chapterList.value.find(
        (it) => it.chapterId === payload.chapterId,
      );
      if (!chapter || !chapter.result) return;

      const chapterId = payload.chapterId;
      currentChapterId.value = chapterId;
      targetChapterId.value = chapterId;
      chapterResult.value = chapter.result;
      updateChapter(chapterId, chapter.result, true);
    }
  }
});

onKeyDown(['ArrowLeft'], (e) => {
  if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) {
    return;
  }
  if (showSettingModal.value || showCatalogModal.value) {
    return;
  }
  if (chapterResult.value?.ok && chapterResult.value.value.prevId) {
    navToChapter(chapterResult.value.value.prevId);
    e.preventDefault();
  }
});
onKeyDown(['ArrowRight'], (e) => {
  if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) {
    return;
  }
  if (showSettingModal.value || showCatalogModal.value) {
    return;
  }
  if (chapterResult.value?.ok && chapterResult.value.value.nextId) {
    navToChapter(chapterResult.value.value.nextId);
    e.preventDefault();
  }
});

onKeyDown(['1', '2', '3', '4'], (e) => {
  if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) {
    return;
  }
  if (showSettingModal.value || showCatalogModal.value) {
    return;
  }
  const setting = readerSetting.value;
  const translatorIds = <TranslatorId[]>['baidu', 'youdao', 'gpt', 'sakura'];
  const translatorId = translatorIds[parseInt(e.key, 10) - 1];
  if (setting.translationsMode === 'parallel') {
    if (setting.translations.includes(translatorId)) {
      setting.translations = setting.translations.filter(
        (it) => it !== translatorId,
      );
    } else {
      setting.translations.push(translatorId);
    }
  } else {
    setting.translations = [translatorId];
  }
  e.preventDefault();
});

const showSettingModal = ref(false);
const showCatalogModal = ref(false);

onKeyDown(['Enter'], (e) => {
  if (showSettingModal.value) {
    return;
  }
  showCatalogModal.value = !showCatalogModal.value;
  e.preventDefault();
});
</script>

<template>
  <DefineChapterLink v-slot="{ id, label }">
    <c-button
      :disabled="id === undefined"
      :lable="label"
      quaternary
      :focusable="false"
      :type="id ? 'primary' : 'default'"
      @action="
        () => {
          navToChapter(id!);
        }
      "
    />
  </DefineChapterLink>

  <div class="content">
    <c-result :result="chapterResult" v-slot="{ value: chapter }">
      <component
        :is="isMobile ? ReaderLayoutMobile : ReaderLayoutDesktop"
        :novel-url="novelUrl"
        :chapter="chapter"
        @nav="navToChapter"
        @require-catalog-modal="showCatalogModal = true"
        @require-setting-modal="showSettingModal = true"
      >
        <template v-if="readerSetting.pageTurnMode === 'page'">
          <reader-content
            :gnid="gnid"
            :chapter-id="chapter.chapterId"
            :chapter="chapter"
          />
          <n-divider />
          <n-flex align="center" justify="space-between" style="width: 100%">
            <ReuseChapterLink :id="chapter.prevId" label="上一章" />
            <ReuseChapterLink :id="chapter.nextId" label="下一章" />
          </n-flex>
        </template>
        <template
          v-else
          v-for="(item, idx) in chapterList"
          :key="item.chapterId"
        >
          <c-result :result="item.result" v-slot="{ value: chapterItem }">
            <n-divider v-if="idx > 0 && chapterList.length > 0" />
            <reader-content
              :gnid="gnid"
              :chapter-id="chapterItem.chapterId"
              :chapter="chapterItem"
            />

            <template v-if="!chapterItem.nextId">
              <div style="text-align: center; margin: 48px 0">暂无更多章节</div>
            </template>
          </c-result>
        </template>
      </component>
    </c-result>

    <reader-setting-modal v-model:show="showSettingModal" />

    <catalog-modal
      v-model:show="showCatalogModal"
      :gnid="gnid"
      :chapter-id="currentChapterId"
    />
  </div>
</template>

<style scoped>
.content {
  max-width: v-bind('`${readerSetting.pageWidth}px`');
  margin: 0 auto;
  padding-left: v-bind("isMobile? '12px' : '24px'");
  padding-right: v-bind("isMobile? '12px' : '84px'");
  padding-bottom: 92px;
}
</style>
