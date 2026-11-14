<script lang="ts" setup>
import { subjectKeys } from '@/api/commentSubject';
import { GenericNovelId } from '@/model/Common';
import type { WebNovelDto, WebNovelTocItemDto } from '@/model/WebNovel';
import NovelBottomTabs from '@/pages/novel/components/NovelBottomTabs.vue';
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

  <NovelBottomTabs
    :gnid="GenericNovelId.web(providerId, novelId)"
    :glossary="novel.glossary"
    :site="subjectKeys.novel.web(providerId, novelId)"
    :hide-comment="setting.hideCommmentWebNovel"
    :locked="false"
  />
</template>
