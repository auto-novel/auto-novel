<script lang="ts" setup>
import { XTime, XTooltip } from '@novelia/web-kit';
import { KeyboardArrowDownOutlined } from '@vicons/material';

import type { WebNovelOutlineDto } from '@/model/WebNovel';

const { items } = defineProps<{
  items: WebNovelOutlineDto[];
}>();

interface HistoryGroup {
  key: string;
  label: string;
  dated: boolean;
  items: WebNovelOutlineDto[];
}

const formatDayLabel = (date: Date) => {
  const now = new Date();
  const month = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === now.getFullYear()
    ? month
    : `${date.getFullYear()}年${month}`;
};

const hasUpdateSinceRead = (item: WebNovelOutlineDto) =>
  item.updateAt !== undefined &&
  item.lastReadAt !== undefined &&
  item.updateAt > item.lastReadAt;

const historyDays = computed<HistoryGroup[]>(() => {
  const days = new Map<string, HistoryGroup>();
  for (const item of items) {
    const date =
      item.lastReadAt === undefined
        ? undefined
        : new Date(item.lastReadAt * 1000);
    const key = date
      ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      : 'unknown';
    let day = days.get(key);
    if (!day) {
      day = {
        key,
        label: date ? formatDayLabel(date) : '时间未知',
        dated: date !== undefined,
        items: [],
      };
      days.set(key, day);
    }
    day.items.push(item);
  }
  return [...days.values()];
});

const collapsedDays = ref(new Set<string>());

const isCollapsed = (day: HistoryGroup) =>
  day.dated && collapsedDays.value.has(day.key);

const toggleDay = (dayKey: string) => {
  const next = new Set(collapsedDays.value);
  if (next.has(dayKey)) {
    next.delete(dayKey);
  } else {
    next.add(dayKey);
  }
  collapsedDays.value = next;
};

const dayHasUpdate = (day: HistoryGroup) => day.items.some(hasUpdateSinceRead);

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
</script>

<template>
  <ol
    class="relative m-0 list-none border-l border-divider p-0 pb-6"
    aria-label="阅读历史时间线"
  >
    <li
      v-for="day in historyDays"
      :key="day.key"
      class="relative not-first:mt-4"
    >
      <button
        v-if="day.dated"
        type="button"
        class="group relative flex min-h-6 w-full cursor-pointer items-center rounded pl-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :aria-expanded="!isCollapsed(day)"
        :aria-controls="`day-${day.key}`"
        :aria-label="`${isCollapsed(day) ? '展开' : '折叠'}${day.label}的阅读记录`"
        @click="toggleDay(day.key)"
      >
        <span
          class="absolute top-1/2 -left-1.5 size-3 -translate-y-1/2 rounded-full border-2 bg-body ring-4 ring-body transition-colors"
          :class="
            isCollapsed(day) && dayHasUpdate(day)
              ? 'border-warning'
              : 'border-primary'
          "
          aria-hidden="true"
        />
        <span class="text-sm font-medium text-ink">{{ day.label }}</span>
        <span class="ml-2 text-xs text-muted">{{ day.items.length }} 部</span>
        <KeyboardArrowDownOutlined
          class="ml-1 size-5 text-muted transition-transform duration-200 ease-out group-hover:text-ink motion-reduce:transition-none"
          :class="{ '-rotate-90': isCollapsed(day) }"
          aria-hidden="true"
        />
        <span v-if="isCollapsed(day) && dayHasUpdate(day)" class="sr-only">
          有更新
        </span>
      </button>

      <div
        :id="day.dated ? `day-${day.key}` : undefined"
        class="grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none"
        :class="
          isCollapsed(day)
            ? 'grid-rows-[0fr] opacity-0'
            : 'grid-rows-[1fr] opacity-100'
        "
        :insert="isCollapsed(day) ? '' : undefined"
      >
        <div class="-ml-3 min-h-0 overflow-hidden pl-3">
          <ol class="m-0 list-none p-0" :class="{ 'pt-2': day.dated }">
            <li
              v-for="item in day.items"
              :key="`${item.providerId}/${item.novelId}`"
              class="relative pb-5 pl-5 last:pb-2"
            >
              <XTooltip>
                <template #trigger>
                  <span
                    class="absolute top-1.25 -left-1.25 size-2.5 rounded-full ring-4 ring-body sm:top-1.5"
                    :class="
                      hasUpdateSinceRead(item) ? 'bg-warning' : 'bg-primary'
                    "
                    aria-hidden="true"
                  />
                </template>
                {{ hasUpdateSinceRead(item) ? '上次阅读后有更新' : '阅读记录' }}
              </XTooltip>
              <span v-if="hasUpdateSinceRead(item)" class="sr-only">
                有更新
              </span>
              <div
                class="grid min-w-0 gap-y-0.5 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-2"
              >
                <span
                  class="mb-1.5 text-xs leading-5 tabular-nums text-muted sm:mb-0 sm:leading-normal"
                >
                  <XTime
                    v-if="item.lastReadAt !== undefined"
                    :time="item.lastReadAt * 1000"
                    format="HH:mm"
                  />
                  <template v-else>—</template>
                </span>
                <RouterLink
                  :to="`/novel/${item.providerId}/${item.novelId}`"
                  class="min-w-0 font-medium wrap-anywhere text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {{ item.titleJp }}
                </RouterLink>
                <div class="min-w-0 sm:col-start-2 sm:row-start-2">
                  <p
                    v-if="item.titleZh"
                    class="m-0 text-sm wrap-anywhere text-ink"
                  >
                    {{ item.titleZh }}
                  </p>
                  <p
                    v-if="item.extra"
                    class="m-0 text-xs wrap-anywhere text-muted"
                  >
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
                        item.lastReadAt !== undefined &&
                        item.updateAt !== undefined
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
        </div>
      </div>
    </li>
  </ol>
</template>
