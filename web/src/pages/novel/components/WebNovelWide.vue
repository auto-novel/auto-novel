<script lang="ts" setup>
import { subjectKeys } from '@/api/commentSubject';
import type { WebNovelDto, WebNovelTocItemDto } from '@/model/WebNovel';
import { useSettingStore } from '@/stores';

defineProps<{
  providerId: string;
  novelId: string;
  novel: WebNovelDto;
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);
</script>

<template>
  <web-novel-metadata
    :provider-id="providerId"
    :novel-id="novelId"
    :novel="novel"
  />

  <USeparator class="my-6" />

  <web-translate
    :provider-id="providerId"
    :novel-id="novelId"
    :title-jp="novel.titleJp"
    :title-zh="novel.titleZh"
    :total="novel.toc.filter((it: WebNovelTocItemDto) => it.chapterId).length"
    v-model:jp="novel.jp"
    v-model:youdao="novel.youdao"
    v-model:gpt="novel.gpt"
    :sakura="novel.sakura"
    :glossary="novel.glossary"
  />

  <section v-if="!setting.hideCommmentWebNovel" class="mt-6">
    <comment-list :site="subjectKeys.novel.web(providerId, novelId)" />
  </section>
</template>
