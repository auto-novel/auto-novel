<script lang="ts" setup>
const props = defineProps<{
  introductionJp: string;
  introductionZh?: string;
}>();

const hasTranslation = computed(() => props.introductionZh !== undefined);

const expanded = ref(false);

watch(hasTranslation, (next, prev) => {
  if (next === prev) return;
  expanded.value = false;
});

const displayedIntroduction = computed(() => {
  if (props.introductionZh === undefined) {
    return props.introductionJp;
  }
  if (expanded.value) {
    return `${props.introductionZh}\n\n${props.introductionJp}`;
  }
  return props.introductionZh;
});

const toggleTranslation = () => {
  if (!hasTranslation.value) return;
  expanded.value = !expanded.value;
};
</script>

<template>
  <n-p
    :style="{
      wordBreak: 'break-all',
      display: !expanded && hasTranslation ? '-webkit-box' : undefined,
      WebkitBoxOrient: !expanded && hasTranslation ? 'vertical' : undefined,
      WebkitLineClamp: !expanded && hasTranslation ? 5 : undefined,
      overflow: !expanded && hasTranslation ? 'hidden' : undefined,
    }"
    @click="toggleTranslation"
  >
    <template v-if="displayedIntroduction">
      <template v-if="expanded && introductionZh !== undefined">
        <span>{{ introductionZh }}</span>
        <span style="display: block; margin-top: 1em">
          {{ introductionJp }}
        </span>
      </template>
      <template v-else>{{ displayedIntroduction }}</template>
    </template>
    <template v-else>暂无简介</template>
  </n-p>
</template>
