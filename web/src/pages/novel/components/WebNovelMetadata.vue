<script lang="ts" setup>
import type { WebNovelDto } from '@/model/WebNovel';

const props = defineProps<{
  providerId: string;
  novelId: string;
  novel: WebNovelDto;
}>();

const includesWhitespace = (s: string) => s.includes(' ') || s.includes('　');

const generateSearchUrl = (query: string) => {
  if (includesWhitespace(query)) {
    query = `"${query}"`;
  }
  return `/novel?query=${encodeURIComponent(query)}`;
};

const latestChapterCreateAt = computed(() => {
  const { novel } = props;
  const createAtList = novel.toc
    .map((it) => it.createAt)
    .filter((it): it is number => it !== undefined);
  if (createAtList.length === 0) return undefined;
  else return Math.max(...createAtList);
});
</script>

<template>
  <WebNovelTitle
    :provider-id="providerId"
    :novel-id="novelId"
    :title-jp="novel.titleJp"
    :title-zh="novel.titleZh"
  />

  <n-p v-if="novel.authors.length > 0">
    <template v-if="novel.authors.length > 0">
      作者：
      <template v-for="author in novel.authors" :key="author.name">
        <n-a :href="author.link">{{ author.name }}</n-a>
      </template>
      /
      <c-a :to="generateSearchUrl(novel.authors[0].name)">搜索作者</c-a>
    </template>
    /
    <c-a :to="generateSearchUrl(novel.titleJp)">搜索标题</c-a>
  </n-p>

  <WebNovelActions
    :provider-id="providerId"
    :novel-id="novelId"
    :novel="novel"
    style="margin-top: 20px"
  />

  <n-divider />

  <WebNovelStat
    :type="novel.type"
    :total-characters="novel.totalCharacters"
    :visited="novel.visited"
    :latest-chapter-create-at="latestChapterCreateAt"
  />

  <WebNovelIntroduction
    :introduction-jp="novel.introductionJp"
    :introduction-zh="novel.introductionZh"
    style="margin-top: 16px"
  />

  <WebNovelTags
    :provider-id="providerId"
    :attentions="novel.attentions"
    :keywords="novel.keywords"
    :points="novel.points"
    style="margin-top: 12px"
  />
</template>
