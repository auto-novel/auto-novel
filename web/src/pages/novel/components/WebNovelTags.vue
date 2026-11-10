<script lang="ts" setup>
import { WebUtil } from '@/util/web';

const props = defineProps<{
  providerId: string;
  attentions: string[];
  keywords: string[];
  points?: number;
}>();

const sortedAttentions = computed(() => props.attentions.slice().sort());

const readableNumber = (num: number | undefined) => {
  if (typeof num !== 'number') return undefined;
  if (num < 1000) return num.toString();
  return `${(num / 1000).toFixed(1)}k`;
};

const pointTag = computed(() => {
  const pointText = readableNumber(props.points);
  if (pointText === undefined) return undefined;
  if (props.providerId === 'kakuyomu') return `★${pointText}`;
  return `${pointText} PT`;
});

const buildTagQuery = (tag: string) => `/novel?query=${tag}\$`;
</script>

<template>
  <div class="flex flex-wrap justify-start gap-1">
    <NovelTag v-if="pointTag" type="success" :tag="pointTag" strong />

    <router-link
      v-for="attention of sortedAttentions"
      :key="attention"
      :to="buildTagQuery(attention)"
    >
      <NovelTag :tag="attention" strong />
    </router-link>

    <router-link
      v-for="keyword of keywords"
      :key="keyword"
      :to="buildTagQuery(keyword)"
    >
      <NovelTag :tag="WebUtil.tryTranslateKeyword(keyword)" />
    </router-link>
  </div>
</template>
