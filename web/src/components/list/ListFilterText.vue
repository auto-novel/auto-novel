<script lang="ts" setup>
import { SearchOutlined } from '@vicons/material';
import type { DropdownOption } from 'naive-ui';

import {
  useSettingStore,
  useWebSearchHistoryStore,
  useWenkuSearchHistoryStore,
} from '@/stores';
import { RegexUtil } from '@/util';
import CActionWrapper from '../CActionWrapper.vue';
import SearchHistoryFooter from './SearchHistoryFooter.vue';
import type { ListTextOption } from './types';

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
  if (current) {
    text.value = `${current} ${tag}`;
  } else {
    text.value = tag;
  }
}

const searchHistoryOptions = computed(() => {
  const options: DropdownOption[] = [];

  searchHistory.value.queries?.forEach((it) =>
    options.push({
      key: it,
      label: it,
    }),
  );

  const tags = searchHistory.value.tags
    .sort((a, b) => Math.log2(b.used) - Math.log2(a.used))
    .map((it) => it.tag)
    .slice(0, 8);

  if (tags.length > 0) {
    if (options.length > 0) {
      options.push({
        key: 'footer-divider',
        type: 'divider',
      });
    }

    options.push({
      key: 'footer',
      type: 'render',
      render: () => h(SearchHistoryFooter, { tags: tags, onSelect: appendTag }),
    });
  }
  return options;
});

const input = useTemplateRef('input');
const showSuggestions = ref(false);
const toggleSuggestions = () => {
  // Hacky
  showSuggestions.value = !showSuggestions.value;
};

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
  <CActionWrapper :title="label" size="large">
    <n-dropdown
      :disabled="searchHistoryOptions.length === 0"
      :show="showSuggestions"
      :options="searchHistoryOptions"
      :keyboard="false"
      :animated="false"
      width="trigger"
      @select="confirm"
      @clickoutside="toggleSuggestions"
    >
      <n-input
        ref="input"
        v-bind="$attrs"
        clearable
        v-model:value="text"
        :placeholder="option.placeholder"
        :input-props="{ spellcheck: false }"
        @click="toggleSuggestions"
        @keyup.enter="confirm(text)"
        style="flex: 0 1 400px; margin-right: 8px"
      >
        <template #suffix>
          <n-icon :component="SearchOutlined" />
        </template>
      </n-input>
    </n-dropdown>
  </CActionWrapper>
</template>

<style>
.n-dropdown-option-body__label {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
