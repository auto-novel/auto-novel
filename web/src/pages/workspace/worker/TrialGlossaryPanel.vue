<script lang="ts" setup>
import { DeleteOutlineOutlined, UndoOutlined } from '@vicons/material';
import { Toast } from '@novelia/web-kit';

import { Glossary } from '@/model/Glossary';

const glossary = defineModel<Glossary>('value', { required: true });

// 试译里的术语表是本次工作区的临时词表，直接改引用即可，
// 不需要“提交”和未保存确认。

const termsToAdd = ref<[string, string]>(['', '']);
const deletedTerms = ref<[string, string][]>([]);
const importRaw = ref('');
const showImport = ref(false);

const count = computed(() => Object.keys(glossary.value).length);
const lastDeleted = computed(
  () => deletedTerms.value[deletedTerms.value.length - 1],
);

const addTerm = () => {
  const [jpRaw, zhRaw] = termsToAdd.value;
  const jp = jpRaw.trim();
  const zh = zhRaw.trim();
  if (!jp || !zh) {
    Toast.info('请填写日文和中文');
    return;
  }
  glossary.value[jp] = zh;
  termsToAdd.value = ['', ''];
};

const onAddKeydown = (event: KeyboardEvent) => {
  // 日文/中文输入法确认候选词时也会触发 Enter，不能当成提交。
  if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter') {
    return;
  }
  event.preventDefault();
  addTerm();
};

const deleteTerm = (jp: string) => {
  if (!(jp in glossary.value)) return;
  deletedTerms.value.push([jp, glossary.value[jp]]);
  delete glossary.value[jp];
};

const undoDelete = () => {
  const deleted = deletedTerms.value.pop();
  if (deleted === undefined) return;
  glossary.value[deleted[0]] = deleted[1];
};

const importGlossary = () => {
  const imported = Glossary.fromText(importRaw.value);
  if (imported === undefined) {
    Toast.error('导入失败：格式不正确');
    return;
  }
  Object.assign(glossary.value, imported);
  importRaw.value = '';
  showImport.value = false;
  Toast.success(`已导入 ${Object.keys(imported).length} 条`);
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2">
    <div class="flex flex-none items-center gap-2">
      <n-input
        v-model:value="termsToAdd"
        pair
        size="small"
        separator="=>"
        :placeholder="['日文', '中文']"
        :input-props="{ spellcheck: false }"
        class="min-w-0 flex-1"
        @keydown="onAddKeydown"
      />
      <c-button label="添加" :round="false" size="small" @action="addTerm" />
    </div>

    <div class="flex flex-none flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-xs text-muted">共 {{ count }} 条 · 下次翻译生效</span>
      <div class="ml-auto flex items-center gap-0.5">
        <c-button
          v-if="lastDeleted"
          text
          size="tiny"
          :round="false"
          :icon="UndoOutlined"
          label="撤销删除"
          :title="`撤销删除：${lastDeleted[0]}`"
          @action="undoDelete"
        />
        <c-button
          text
          size="tiny"
          :round="false"
          :label="showImport ? '收起导入' : '批量导入'"
          @action="showImport = !showImport"
        />
      </div>
    </div>

    <div v-if="showImport" class="flex flex-none items-end gap-2">
      <n-input
        v-model:value="importRaw"
        type="textarea"
        size="small"
        :rows="2"
        placeholder="每行一条：日文 => 中文"
        :input-props="{ spellcheck: false }"
        class="min-w-0 flex-1"
      />
      <c-button
        label="导入"
        :round="false"
        size="small"
        :disabled="!importRaw.trim()"
        @action="importGlossary"
      />
    </div>

    <div
      v-if="count > 0"
      :class="[
        'flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto',
        'overscroll-contain pr-1 scrollbar-thin',
      ]"
    >
      <div
        v-for="jp in Object.keys(glossary).reverse()"
        :key="jp"
        :class="[
          'grid grid-cols-[auto_minmax(0,1fr)_18px_minmax(0,1.2fr)] items-center',
          'gap-1 border-b border-divider py-0.5',
        ]"
      >
        <c-button
          :icon="DeleteOutlineOutlined"
          text
          type="error"
          size="tiny"
          :title="`删除词条：${jp}`"
          :aria-label="`删除词条：${jp}`"
          @action="deleteTerm(jp)"
        />
        <span class="truncate text-xs" :title="jp">{{ jp }}</span>
        <span class="text-[11px] text-muted">=></span>
        <n-input
          v-model:value="glossary[jp]"
          size="tiny"
          placeholder="中文"
          :theme-overrides="{ border: '0', color: 'transparent' }"
          class="min-w-0"
        />
      </div>
    </div>
    <div
      v-else
      class="grid min-h-0 flex-1 place-items-center p-3 text-center text-xs text-muted"
    >
      还没有术语。添加后会在下次翻译时生效。
    </div>
  </div>
</template>
