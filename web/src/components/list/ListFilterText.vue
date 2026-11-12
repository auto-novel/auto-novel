<script lang="ts" setup>
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
import { convertSearchQuery } from '@/util/search-query';
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
  input.value?.inputRef?.focus();
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
  input.value?.inputRef?.focus();
}

function processQueryWithLocaleAware(input: string): string {
  const cc = useSettingStore().cc;
  return convertSearchQuery(input, cc.toData);
}

const confirm = (key: string) => {
  const newValue = processQueryWithLocaleAware(key);
  value.value = newValue;
  text.value = newValue;
  searchHistoryStore.addHistory(key);
  input.value?.inputRef?.blur();
  showSuggestions.value = false;
};
</script>

<template>
  <CActionWrapper :title="label" size="medium">
    <PopoverRoot v-model:open="suggestionsOpen" :modal="false">
      <PopoverAnchor as-child>
        <div ref="anchor" class="mr-2 min-w-0 flex-[0_1_400px]">
          <UInput
            ref="input"
            v-bind="$attrs"
            v-model="text"
            class="w-full"
            :placeholder="option.placeholder"
            :aria-label="label"
            aria-haspopup="dialog"
            :aria-expanded="suggestionsOpen"
            :spellcheck="false"
            trailing-icon="i-lucide-search"
            @click="showSuggestions = true"
            @keydown="onKeydown"
          >
            <template v-if="text" #trailing>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                aria-label="清空搜索"
                icon="i-lucide-x"
                @click="
                  text = '';
                  input?.inputRef?.focus();
                "
              />
            </template>
          </UInput>
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
              class="block w-full cursor-pointer truncate rounded-sm px-3 py-2 text-left text-sm text-ink hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              :title="query"
              @mousedown.prevent
              @click="confirm(query)"
            >
              {{ query }}
            </button>
            <USeparator
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
