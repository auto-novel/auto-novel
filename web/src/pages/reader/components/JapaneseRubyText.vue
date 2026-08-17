<script lang="ts" setup>
import type { RubySegment } from '../ruby/types';

const props = defineProps<{
  enabled: boolean;
  text: string;
}>();

const segments = shallowRef<RubySegment[]>([{ text: props.text }]);
let revision = 0;

watch(
  () => [props.enabled, props.text] as const,
  async ([enabled, text]) => {
    const currentRevision = ++revision;
    segments.value = [{ text }];
    if (!enabled || !/\p{Script=Han}/u.test(text)) return;

    try {
      const { annotateJapanese } = await import('../ruby/JapaneseRuby');
      const annotated = await annotateJapanese(text);
      if (revision === currentRevision) segments.value = annotated;
    } catch (error) {
      console.error('[reader-ruby] 无法标注日语读音', error);
    }
  },
  { immediate: true },
);
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <!-- prettier-ignore -->
    <ruby v-if="segment.reading">{{ segment.text }}<rp aria-hidden="true">(</rp><rt aria-hidden="true">{{ segment.reading }}</rt><rp aria-hidden="true">)</rp></ruby>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>

<style scoped>
rt,
rp {
  text-decoration: none;
  user-select: none;
}

rt {
  font-weight: 400;
  opacity: 0.7;
}
</style>
