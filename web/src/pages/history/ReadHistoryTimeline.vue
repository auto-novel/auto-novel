<script lang="ts" setup>
import { XTime } from '@novelia/web-kit';

import type { WebNovelOutlineDto } from '@/model/WebNovel';

const { items } = defineProps<{
  items: WebNovelOutlineDto[];
}>();

interface HistoryGroup {
  key: string;
  label: string;
  items: WebNovelOutlineDto[];
}

const formatMonthLabel = (date: Date) => {
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
};

const historyGroups = computed<HistoryGroup[]>(() => {
  const groups = new Map<string, HistoryGroup>();
  for (const item of items) {
    const date =
      item.lastReadAt === undefined
        ? undefined
        : new Date(item.lastReadAt * 1000);
    const key = date ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown';
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: date ? formatMonthLabel(date) : '时间未知',
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
});

const formatStats = (item: WebNovelOutlineDto) =>
  [
    item.type,
    `总计 ${item.total}`,
    `有道 ${item.youdao}`,
    `GPT ${item.gpt}`,
    `Sakura ${item.sakura}`,
  ]
    .filter(Boolean)
    .join(' / ');

const hasUpdateSinceRead = (item: WebNovelOutlineDto) =>
  item.updateAt !== undefined &&
  item.lastReadAt !== undefined &&
  item.updateAt > item.lastReadAt;
</script>

<template>
  <ol class="m-0 list-none p-0" aria-label="阅读历史时间线">
    <li v-for="group in historyGroups" :key="group.key" class="not-first:mt-7">
      <h2 class="mb-3 text-sm font-medium text-default">{{ group.label }}</h2>
      <ol class="relative m-0 list-none border-l border-default p-0">
        <li
          v-for="item in group.items"
          :key="`${item.providerId}/${item.novelId}`"
          class="relative pb-5 pl-5 last:pb-0"
        >
          <UTooltip>
            <span
              class="absolute top-1.25 -left-1.25 size-2.5 rounded-full ring-4 ring-bg sm:top-1.5"
              :class="hasUpdateSinceRead(item) ? 'bg-warning' : 'bg-primary'"
              aria-hidden="true"
            />

            <template #content>
              {{ hasUpdateSinceRead(item) ? '上次阅读后有更新' : '阅读记录' }}
            </template>
          </UTooltip>
          <span v-if="hasUpdateSinceRead(item)" class="sr-only">有更新</span>
          <div
            class="grid min-w-0 gap-y-0.5 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-2"
          >
            <span
              class="mb-1.5 text-xs leading-5 tabular-nums text-muted sm:mb-0 sm:leading-normal"
            >
              <XTime
                v-if="item.lastReadAt !== undefined"
                :time="item.lastReadAt * 1000"
                format="d日 HH:mm"
              />
              <template v-else>—</template>
            </span>
            <ULink
              :to="`/novel/${item.providerId}/${item.novelId}`"
              class="min-w-0 font-medium wrap-anywhere"
            >
              {{ item.titleJp }}
            </ULink>
            <div class="min-w-0 sm:col-start-2 sm:row-start-2">
              <p
                v-if="item.titleZh"
                class="m-0 text-sm wrap-anywhere text-default"
              >
                {{ item.titleZh }}
              </p>
              <p v-if="item.extra" class="m-0 text-xs wrap-anywhere text-muted">
                {{ item.extra }}
              </p>
              <p
                v-if="item.type || item.total"
                class="mt-1 mb-0 text-xs text-muted"
              >
                {{ formatStats(item) }}
              </p>
              <p
                v-if="
                  item.lastReadAt !== undefined ||
                  item.updateAt !== undefined ||
                  $slots.action
                "
                class="mt-1 mb-0 flex flex-wrap items-center gap-x-1 text-xs text-muted"
              >
                <span v-if="item.lastReadAt !== undefined">
                  阅读于
                  <XTime :time="item.lastReadAt * 1000" preset="relative" />
                </span>
                <span
                  v-if="
                    item.lastReadAt !== undefined && item.updateAt !== undefined
                  "
                  aria-hidden="true"
                >
                  /
                </span>
                <span v-if="item.updateAt !== undefined">
                  更新于
                  <XTime :time="item.updateAt * 1000" preset="relative" />
                </span>
                <slot name="action" v-bind="item" />
              </p>
            </div>
          </div>
        </li>
      </ol>
    </li>
  </ol>
</template>
