<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { WorkspaceLogEntry } from './useWorkspaceLog';

const props = defineProps<{ logs: readonly WorkspaceLogEntry[] }>();
const emit = defineEmits<{ clear: [] }>();
const expanded = ref(true);
const following = ref(true);
const viewport = ref<HTMLElement>();

function onScroll() {
  const el = viewport.value;
  if (el)
    following.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
}

function scrollToLatest() {
  following.value = true;
  const el = viewport.value;
  if (el) el.scrollTop = el.scrollHeight;
}

watch(
  () => [props.logs.at(-1)?.id, expanded.value],
  async () => {
    if (!expanded.value || !following.value) return;
    await nextTick();
    scrollToLatest();
  },
);

function clear() {
  following.value = true;
  emit('clear');
}
</script>

<template>
  <div class="mt-3 overflow-hidden rounded-lg border border-divider text-xs">
    <div
      class="flex items-center justify-between gap-2 px-3 py-2 text-ink-soft"
    >
      <button
        type="button"
        class="cursor-pointer hover:text-primary"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? '▾' : '▸' }} 运行日志 · {{ logs.length }} / 1000
      </button>
      <div v-if="expanded" class="flex items-center gap-3">
        <button
          type="button"
          class="cursor-pointer hover:text-primary"
          :aria-pressed="following"
          @click="following ? (following = false) : scrollToLatest()"
        >
          {{ following ? '暂停跟随' : '回到最新' }}
        </button>
        <button
          type="button"
          class="cursor-pointer hover:text-primary disabled:cursor-default disabled:opacity-50"
          :disabled="!logs.length"
          @click="clear"
        >
          清空
        </button>
      </div>
    </div>
    <div
      v-show="expanded"
      ref="viewport"
      class="h-52 overflow-auto overscroll-contain border-t border-divider px-3 py-2 font-mono leading-5 [overflow-anchor:none]"
      role="region"
      aria-label="工作区运行日志"
      tabindex="0"
      @scroll.passive="onScroll"
    >
      <div v-if="!logs.length" class="text-muted">
        暂无日志，启动翻译器后将在此显示。仅保留本页最近 1000 条。
      </div>
      <div
        v-for="entry in logs"
        :key="entry.id"
        class="whitespace-pre-wrap break-words"
        :class="
          entry.level === 'warn'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-ink-soft'
        "
      >
        <span class="opacity-60">{{ entry.time }}</span>
        {{ ' ' }}[{{ entry.source }}] {{ entry.message }}
      </div>
    </div>
  </div>
</template>
