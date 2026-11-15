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
    <span class="text-default">
      {{ type }}
    </span>
    <span>/</span>

    <UTooltip
      v-if="exactTotalCharacters"
      :text="exactTotalCharacters"
      :disabled="totalCharacters === exactTotalCharacters"
    >
      <span class="text-default">
        {{ totalCharacters }}
      </span>
    </UTooltip>
    <span class="text-default" v-else>NA</span>
    <span>/</span>

    <XTime
      v-if="latestChapterCreateAt"
      :time="latestChapterCreateAt * 1000"
      preset="relative"
    />
    <span class="text-default" v-else>NA</span>
    <span>/</span>

    <UTooltip :text="exactVisited" :disabled="visited === exactVisited">
      <span class="text-default">
        {{ visited }}
      </span>
    </UTooltip>
  </div>
</template>

<style scoped>
.metadata-stat {
  width: 100%;
  flex-wrap: wrap;
}
</style>
