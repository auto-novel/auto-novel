<script lang="ts" setup>
import { useOsTheme } from 'naive-ui';

import type { GenericNovelId } from '@/model/Common';
import type { ReaderChapter } from '../ReaderStore';
import { useReaderSettingStore } from '@/stores';
import { buildParagraphs } from './BuildParagraphs';
import { WebUtil } from '@/util/web';

const props = defineProps<{
  gnid: GenericNovelId;
  chapterId: string;
  chapter: ReaderChapter;
}>();

const osThemeRef = useOsTheme();

const paragraphs = computed(() => buildParagraphs(props.gnid, props.chapter));

const readerSettingStore = useReaderSettingStore();
const { readerSetting } = storeToRefs(readerSettingStore);

const fontColor = computed(() => {
  const theme = readerSetting.value.theme;
  if (theme.mode === 'custom') {
    return theme.fontColor;
  } else {
    let specificTheme: 'light' | 'dark' = 'light';
    if (theme.mode !== 'system') {
      specificTheme = theme.mode;
    } else if (osThemeRef.value) {
      specificTheme = osThemeRef.value;
    }
    return specificTheme === 'light' ? '#000000' : '#FFFFFF';
  }
});

const underlineColor = computed(() => `${fontColor.value}80`);

const textUnderlineOffset = computed(() => {
  const fontSize = readerSetting.value.fontSize;
  const offset = Math.round(fontSize / 4);
  return `${offset}px`;
});

const chapterHref = computed(() => {
  const chapterId = props.chapterId;
  const gnid = props.gnid;
  if (gnid.type === 'web') {
    return WebUtil.buildChapterUrl(gnid.providerId, gnid.novelId, chapterId);
  } else if (gnid.type === 'wenku') {
    throw '不支持文库';
  } else {
    return '/workspace';
  }
});
</script>

<template>
  <div class="chapter" data-chapter :data-id="chapterId">
    <div class="chapter-title">
      <n-a :href="chapterHref">{{ chapter.titleJp }}</n-a>
      <br />
      <n-text depth="3">{{ chapter.titleZh }}</n-text>
      <br />
    </div>

    <div class="chapter-content">
      <template
        v-for="(p, index) of paragraphs"
        :key="`${chapter.prevId}/${index}`"
      >
        <n-p v-if="p && 'text' in p" :aria-hidden="!p.needSpeak">
          <span
            v-if="readerSetting.enableSourceLabel && p.source"
            class="source"
          >
            {{ p.source }}
          </span>
          <span v-if="!readerSetting.trimLeadingSpaces">
            {{ p.indent }}
          </span>
          <span :class="[p.secondary ? 'second' : 'first', 'text-content']">
            {{ p.text }}
          </span>
        </n-p>
        <br v-else-if="!p" />
        <img
          v-else
          :src="p.imageUrl"
          :alt="p.imageUrl"
          style="max-width: 100%; object-fit: scale-down"
          loading="lazy"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.chapter {
  font-size: v-bind('`${readerSetting.fontSize}px`');
  color: v-bind('fontColor');
  font-weight: v-bind('readerSetting.fontWeight');
}
.chapter-title {
  font-size: 1.3em;
  padding: 36px 0;
  font-weight: 500;
}
.chapter-content {
  min-height: 65vh;
}
.chapter-content p {
  margin: v-bind('`${readerSetting.fontSize * readerSetting.lineSpace}px 0`');
  font-size: 1em;
}
.chapter-content p .source {
  display: inline-block;
  user-select: none;
  width: 1em;
  text-align: center;
  opacity: 0.4;
  font-size: 0.75em;
  margin-right: 0.5em;
}
.chapter-content p .first {
  opacity: v-bind('readerSetting.mixZhOpacity');
}
.chapter-content p .second {
  opacity: v-bind('readerSetting.mixJpOpacity');
}
.chapter-content p .text-content {
  text-decoration-line: v-bind(
    "readerSetting.textUnderline === 'none' ? 'none' : 'underline'"
  );
  text-decoration-style: v-bind('readerSetting.textUnderline');
  text-decoration-color: v-bind('underlineColor');
  text-decoration-thickness: 1px;
  text-underline-offset: v-bind('textUnderlineOffset');
}
</style>
