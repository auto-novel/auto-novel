<script lang="ts" setup>
import { XInput, XSeparator } from '@novelia/web-kit';
import { SearchOutlined } from '@vicons/material';
import {
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
} from 'reka-ui';

import {
  useSettingStore,
  useWebSearchHistoryStore,
  useWenkuSearchHistoryStore,
} from '@/stores';
import { RegexUtil } from '@/util';
import CActionWrapper from '../CActionWrapper.vue';
import SearchHistoryFooter from './SearchHistoryFooter.vue';
import type { ListTextOption } from './types';

defineOptions({ inheritAttrs: false });

const value = defineModel<string>('value', { required: true });

const props = defineProps<{
  label: string;
  option: ListTextOption;
}>();

const text = ref(value.value);

watch(value, (newVal) => {
  if (newVal !== text.value) {
    text.value = newVal;
  }
});

const searchHistoryStore =
  props.option.history === 'web'
    ? useWebSearchHistoryStore()
    : useWenkuSearchHistoryStore();
const { searchHistory } = storeToRefs(searchHistoryStore);

function appendTag(tag: string) {
  const current = text.value.trimEnd();
  text.value = current ? `${current} ${tag}` : tag;
  input.value?.focus();
}

const historyQueries = computed(() => searchHistory.value.queries ?? []);
const historyTags = computed(() =>
  [...searchHistory.value.tags]
    .sort((a, b) => b.used - a.used)
    .slice(0, 8)
    .map((it) => it.tag),
);
const hasSuggestions = computed(
  () => historyQueries.value.length > 0 || historyTags.value.length > 0,
);

const input = useTemplateRef('input');
const anchor = useTemplateRef('anchor');
const suggestions = useTemplateRef('suggestions');
const showSuggestions = ref(false);
const suggestionsOpen = computed({
  get: () => showSuggestions.value && hasSuggestions.value,
  set: (open: boolean) => {
    showSuggestions.value = open;
  },
});

// 输入框是锚点，不是菜单触发器；继续输入、清空或点击输入框时不关闭浮层。
function onInteractOutside(event: Event) {
  if (event.target instanceof Node && anchor.value?.contains(event.target)) {
    event.preventDefault();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    confirm(text.value);
  } else if (event.key === 'Escape' && suggestionsOpen.value) {
    event.preventDefault();
    event.stopPropagation();
    showSuggestions.value = false;
  } else if (event.key === 'ArrowDown' && hasSuggestions.value) {
    event.preventDefault();
    showSuggestions.value = true;
    nextTick(() => suggestions.value?.querySelector('button')?.focus());
  }
}

function closeSuggestions() {
  showSuggestions.value = false;
  input.value?.focus();
}

function processQueryWithLocaleAware(input: string): string {
  const cc = useSettingStore().cc;
  const queries = input.split(/( |\||\+|\-|\")/);
  const result: string[] = [];
  for (const query of queries) {
    if (
      !query.includes('$') &&
      !RegexUtil.hasKanaChars(query) &&
      !RegexUtil.hasHangulChars(query) &&
      RegexUtil.hasHanzi(query)
    ) {
      const queryData = cc.toData(query);
      if (queryData === query) {
        result.push(query);
      } else {
        result.push(`(${[query, queryData].join('|')})`);
      }
    } else {
      result.push(query);
    }
  }
  return result.join('');
}

const confirm = (key: string) => {
  const newValue = processQueryWithLocaleAware(key);
  value.value = newValue;
  text.value = newValue;
  searchHistoryStore.addHistory(key);
  input.value?.blur();
  showSuggestions.value = false;
};
</script>

<template>
  <CActionWrapper :title="label" size="medium">
    <PopoverRoot v-model:open="suggestionsOpen" :modal="false">
      <PopoverAnchor as-child>
        <div ref="anchor" class="mr-2 min-w-0 flex-[0_1_400px]">
          <XInput
            ref="input"
            v-bind="$attrs"
            v-model="text"
            clearable
            :placeholder="option.placeholder"
            :aria-label="label"
            aria-haspopup="dialog"
            :aria-expanded="suggestionsOpen"
            :spellcheck="false"
            :tail-icon="SearchOutlined"
            @click="showSuggestions = true"
            @keydown="onKeydown"
          />
        </div>
      </PopoverAnchor>
      <PopoverPortal>
        <PopoverContent
          :aria-label="`${label}搜索历史`"
          align="start"
          :side-offset="6"
          :collision-padding="8"
          class="floating-panel z-50 max-h-(--reka-popover-content-available-height) w-(--reka-popover-trigger-width) overflow-y-auto p-1 text-ink outline-none"
          @open-auto-focus.prevent
          @close-auto-focus.prevent
          @interact-outside="onInteractOutside"
          @escape-key-down="closeSuggestions"
        >
          <div ref="suggestions">
            <button
              v-for="query in historyQueries"
              :key="query"
              type="button"
              class="menu-item block w-full cursor-pointer truncate text-left"
              :title="query"
              @mousedown.prevent
              @click="confirm(query)"
            >
              {{ query }}
            </button>
            <XSeparator
              v-if="historyQueries.length && historyTags.length"
              class="my-1"
            />
            <SearchHistoryFooter
              v-if="historyTags.length"
              :tags="historyTags"
              @select="appendTag"
            />
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </CActionWrapper>
</template>
