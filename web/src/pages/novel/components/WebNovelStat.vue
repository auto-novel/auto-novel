<script lang="ts" setup>
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
  <n-flex class="metadata-stat" :size="[8, 8]" align="center">
    <n-text>
      {{ type }}
    </n-text>
    <span>/</span>

    <n-tooltip
      v-if="exactTotalCharacters"
      placement="top-start"
      trigger="click"
    >
      <template #trigger>
        <n-text>
          {{ totalCharacters }}
        </n-text>
      </template>
      {{ exactTotalCharacters }}
    </n-tooltip>
    <n-text v-else>NA</n-text>
    <span>/</span>

    <n-tooltip
      v-if="latestChapterCreateAt"
      placement="top-start"
      trigger="click"
    >
      <template #trigger>
        <n-time :time="latestChapterCreateAt * 1000" type="relative" />
      </template>
      <n-time :time="latestChapterCreateAt * 1000" format="yyyy-MM-dd HH:mm" />
    </n-tooltip>
    <n-text v-else>NA</n-text>
    <span>/</span>

    <n-tooltip placement="top-start" trigger="click">
      <template #trigger>
        <n-text>{{ visited }}</n-text>
      </template>
      {{ exactVisited }}
    </n-tooltip>
  </n-flex>
</template>

<style scoped>
.metadata-stat {
  width: 100%;
  flex-wrap: wrap;
}
</style>
