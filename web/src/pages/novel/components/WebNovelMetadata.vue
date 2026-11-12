<script lang="ts" setup>
import type { WebNovelDto } from '@/model/WebNovel';
import { WebUtil } from '@/util/web';

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
  <div class="mx-0 mt-0 mb-4.5">
    <h3 class="heading-bar mx-0 mt-0 mb-1">
      <ULink :href="WebUtil.buildNovelUrl(providerId, novelId)">
        {{ novel.titleZh ?? novel.titleJp }}
      </ULink>
    </h3>
    <span
      v-if="novel.titleZh"
      class="block text-[14px] leading-[1.6] text-muted"
    >
      {{ novel.titleJp }}
    </span>
  </div>

  <p
    class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0"
    v-if="novel.authors.length > 0"
  >
    <template v-if="novel.authors.length > 0">
      作者：
      <template v-for="author in novel.authors" :key="author.name">
        <ULink as="a" :href="author.link" external>
          {{ author.name }}
        </ULink>
      </template>
      /
      <ULink :to="generateSearchUrl(novel.authors[0].name)">搜索作者</ULink>
    </template>
    /
    <ULink :to="generateSearchUrl(novel.titleJp)">搜索标题</ULink>
  </p>

  <WebNovelActions
    :provider-id="providerId"
    :novel-id="novelId"
    :novel="novel"
    class="mt-5"
  />

  <USeparator class="my-6" />

  <WebNovelStat
    :type="novel.type"
    :total-characters="novel.totalCharacters"
    :visited="novel.visited"
    :latest-chapter-create-at="latestChapterCreateAt"
  />

  <WebNovelIntroduction
    :introduction-jp="novel.introductionJp"
    :introduction-zh="novel.introductionZh"
    class="mt-4"
  />

  <WebNovelTags
    :provider-id="providerId"
    :attentions="novel.attentions"
    :keywords="novel.keywords"
    :points="novel.points"
    class="mt-3"
  />
</template>
