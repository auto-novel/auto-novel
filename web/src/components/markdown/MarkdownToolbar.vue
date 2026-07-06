<script setup lang="ts">
import type { DropdownOption, DropdownProps } from 'naive-ui';
import {
  FormatBoldOutlined,
  FormatItalicOutlined,
  HelpOutlineOutlined,
  LinkOutlined,
  MenuOpenOutlined,
  StarOutlineFilled,
  StrikethroughSOutlined,
  WarningAmberOutlined,
} from '@vicons/material';
import type { Draft } from '@/stores';

const props = withDefaults(
  defineProps<{
    elTextarea?: HTMLTextAreaElement;
    drafts: Draft[];
    dropdownPlacement?: DropdownProps['placement'];
  }>(),
  {
    dropdownPlacement: 'bottom',
  },
);

const emit = defineEmits<{
  clearDraft: [];
}>();

// ==============================
// 草稿
// ==============================

const draftOptions = ref<DropdownOption[]>([]);

watch(
  () => props.drafts,
  (drafts) => {
    const draftOptionsValue: DropdownOption[] = [];
    for (const draft of drafts.slice().reverse()) {
      draftOptionsValue.push({
        label: draft.createdAt.toLocaleString('zh-CN'),
        key: draft.createdAt.getTime(),
        draftText: draft.text,
      });
    }
    draftOptionsValue.push({ type: 'divider' }, { label: '清空', key: '清空' });

    if (
      JSON.stringify(draftOptionsValue) !== JSON.stringify(draftOptions.value)
    ) {
      draftOptions.value = draftOptionsValue;
    }
  },
  { immediate: true, deep: true },
);

const handleSelectDraft = (key: string, option: DropdownOption) => {
  if (key === '清空') {
    emit('clearDraft');
  } else {
    const { elTextarea } = props;
    if (!elTextarea) return;
    elTextarea.value = option.draftText as string;
    elTextarea.dispatchEvent(new Event('input'));
  }
};

// ==============================
// 编辑
// ==============================

const showGuideModal = ref(false);

type TextSelection = {
  before: string;
  middle: string;
  after: string;
};

type Processor = (selection: TextSelection) => TextSelection;

const applyFormat = (formatter: Processor) => {
  const { elTextarea } = props;
  if (!elTextarea) return;
  elTextarea.focus();

  const { value, selectionStart, selectionEnd } = elTextarea;

  const { before, middle, after } = formatter({
    before: value.slice(0, selectionStart),
    middle: value.slice(selectionStart, selectionEnd),
    after: value.slice(selectionEnd),
  });

  const newValue = before + middle + after;
  const newSelectionStart = before.length;
  const newSelectionEnd = newSelectionStart + middle.length;

  elTextarea.value = newValue;
  elTextarea.setSelectionRange(newSelectionStart, newSelectionEnd);
  elTextarea.dispatchEvent(new Event('input'));
};

const warp = (
  prefix: string,
  suffix: string,
  placeholder: string,
  inline: boolean = true,
) => {
  applyFormat(({ before, middle, after }: TextSelection) => {
    if (before.endsWith(prefix) && after.startsWith(suffix)) {
      before = before.slice(0, -prefix.length);
      after = after.slice(suffix.length);
    } else if (
      middle.length >= prefix.length + suffix.length &&
      middle.startsWith(prefix) &&
      middle.endsWith(suffix)
    ) {
      middle = middle.slice(prefix.length, -suffix.length);
    } else {
      if (!inline) {
        if (!before.endsWith('\n') && before) before = before + '\n';
        if (!after.startsWith('\n')) after = '\n' + after;
      }
      before = before + prefix;
      after = suffix + after;
      if (middle.length === 0) {
        middle = placeholder;
      }
    }
    return { before, middle, after };
  });
};

const insert = (text: string) => {
  applyFormat(({ before, middle, after }: TextSelection) => {
    if (!before.endsWith('\n') && before) before = before + '\n';
    if (!after.startsWith('\n')) after = '\n' + after;
    middle = text;
    return { before, middle, after };
  });
};

const formatBold = () => warp('**', '**', '粗体');
const formatItalic = () => warp('*', '*', '斜体');
const formatStrikethrough = () => warp('~~', '~~', '删除线');
const formatLink = () => warp('[', '](链接)', '');
const formatSpoiler = () => warp('!!', '!!', '剧透');

const formatStar = () => insert('::: star 5');
const formatCollapsibleBlock = () =>
  warp('::: details 点击展开\n', '\n:::', '折叠内容', false);
</script>

<template>
  <n-dropdown
    v-if="drafts.length"
    :options="draftOptions"
    trigger="click"
    :placement="dropdownPlacement"
    @select="handleSelectDraft"
  >
    <n-button size="small" quaternary>
      <n-badge :value="drafts.length" dot :offset="[8, -4]">草稿</n-badge>
    </n-button>
  </n-dropdown>

  <MarkdownToolbarButton
    label="粗体"
    :icon="FormatBoldOutlined"
    @action="formatBold"
  />
  <MarkdownToolbarButton
    label="斜体"
    :icon="FormatItalicOutlined"
    @action="formatItalic"
  />
  <MarkdownToolbarButton
    label="删除线"
    :icon="StrikethroughSOutlined"
    @action="formatStrikethrough"
  />
  <MarkdownToolbarButton
    label="链接"
    :icon="LinkOutlined"
    @action="formatLink"
  />
  <MarkdownToolbarButton
    label="剧透"
    :icon="WarningAmberOutlined"
    @action="formatSpoiler"
  />
  <n-divider vertical />
  <MarkdownToolbarButton
    label="评分"
    :icon="StarOutlineFilled"
    @action="formatStar"
  />
  <MarkdownToolbarButton
    label="折叠"
    :icon="MenuOpenOutlined"
    @action="formatCollapsibleBlock"
  />
  <MarkdownToolbarButton
    label="格式帮助"
    :icon="HelpOutlineOutlined"
    @action="() => (showGuideModal = true)"
  />
  <div style="width: 8px" />

  <MarkdownGuideModal v-model:show="showGuideModal" />
</template>
