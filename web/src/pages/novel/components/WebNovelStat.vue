<script lang="ts" setup>
import { XTime } from '@novelia/web-kit';

const props = defineProps<{
  type: string;
  totalCharacters?: number;
  visited: number;
  latestChapterCreateAt?: number;
}>();

const formatExactNumber = (num: number) =>
  new Intl.NumberFormat('zh-CN').format(num);

const formatNumberWithUnit = (num: number, unit: string) => {
  const exact = formatExactNumber(num);
  if (num < 10000) return `${exact} ${unit}`;
  const compact = new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 1,
  }).format(num / 10000);
  return `${compact} 万${unit}`;
};

const formatExactNumberWithUnit = (num: number, unit: string) =>
  `${formatExactNumber(num)} ${unit}`;

const totalCharacters = computed(() =>
  props.totalCharacters === undefined
    ? undefined
    : formatNumberWithUnit(props.totalCharacters, '字'),
);
const exactTotalCharacters = computed(() =>
  props.totalCharacters === undefined
    ? undefined
    : formatExactNumberWithUnit(props.totalCharacters, '字'),
);
const visited = computed(() => formatNumberWithUnit(props.visited, '次浏览'));
const exactVisited = computed(() =>
  formatExactNumberWithUnit(props.visited, '次浏览'),
);
</script>

<template>
  <div class="metadata-stat flex flex-wrap items-center gap-2">
    <span class="text-ink">
      {{ type }}
    </span>
    <span>/</span>

    <n-tooltip
      v-if="exactTotalCharacters"
      placement="top-start"
      trigger="click"
    >
      <template #trigger>
        <span class="text-ink">
          {{ totalCharacters }}
        </span>
      </template>
      {{ exactTotalCharacters }}
    </n-tooltip>
    <span class="text-ink" v-else>NA</span>
    <span>/</span>

    <n-tooltip
      v-if="latestChapterCreateAt"
      placement="top-start"
      trigger="click"
    >
      <template #trigger>
        <XTime :time="latestChapterCreateAt * 1000" preset="relative" />
      </template>
      <XTime :time="latestChapterCreateAt * 1000" format="yyyy-MM-dd HH:mm" />
    </n-tooltip>
    <span class="text-ink" v-else>NA</span>
    <span>/</span>

    <n-tooltip placement="top-start" trigger="click">
      <template #trigger>
        <span class="text-ink">{{ visited }}</span>
      </template>
      {{ exactVisited }}
    </n-tooltip>
  </div>
</template>

<style scoped>
.metadata-stat {
  width: 100%;
  flex-wrap: wrap;
}
</style>
