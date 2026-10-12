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

let downX = 0;
let downY = 0;

const onMouseDown = (e: MouseEvent) => {
  downX = e.clientX;
  downY = e.clientY;
};

const toggleTranslation = (e: MouseEvent) => {
  if (!hasTranslation.value) return;

  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) {
    return;
  }

  // 如果按下和抬起的位置相差较大，也视为拖拽选字
  const dx = Math.abs(e.clientX - downX);
  const dy = Math.abs(e.clientY - downY);
  if (dx > 4 || dy > 4) {
    return;
  }

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
    @mousedown="onMouseDown"
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
