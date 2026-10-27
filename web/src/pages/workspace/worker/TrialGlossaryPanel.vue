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
  <div class="glossary-panel">
    <div class="glossary-add">
      <n-input
        v-model:value="termsToAdd"
        pair
        size="small"
        separator="=>"
        :placeholder="['日文', '中文']"
        :input-props="{ spellcheck: false }"
        class="glossary-add-input"
        @keydown="onAddKeydown"
      />
      <c-button label="添加" :round="false" size="small" @action="addTerm" />
    </div>

    <div class="glossary-meta">
      <n-text depth="3" class="glossary-meta-text">
        共 {{ count }} 条 · 下次翻译生效
      </n-text>
      <div class="glossary-meta-actions">
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

    <div v-if="showImport" class="glossary-import">
      <n-input
        v-model:value="importRaw"
        type="textarea"
        size="small"
        :rows="2"
        placeholder="每行一条：日文 => 中文"
        :input-props="{ spellcheck: false }"
        class="glossary-import-input"
      />
      <c-button
        label="导入"
        :round="false"
        size="small"
        :disabled="!importRaw.trim()"
        @action="importGlossary"
      />
    </div>

    <div v-if="count > 0" class="glossary-list">
      <div
        v-for="jp in Object.keys(glossary).reverse()"
        :key="jp"
        class="glossary-row"
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
        <span class="glossary-jp" :title="jp">{{ jp }}</span>
        <span class="glossary-arrow">=></span>
        <n-input
          v-model:value="glossary[jp]"
          size="tiny"
          placeholder="中文"
          :theme-overrides="{ border: '0', color: 'transparent' }"
          class="glossary-zh"
        />
      </div>
    </div>
    <div v-else class="glossary-empty">
      还没有术语。添加后会在下次翻译时生效。
    </div>
  </div>
</template>

<style scoped>
.glossary-panel {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
}

.glossary-add {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.glossary-add-input {
  flex: 1;
  min-width: 0;
}

.glossary-meta {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.glossary-meta-text {
  font-size: 12px;
}

.glossary-meta-actions {
  display: flex;
  margin-left: auto;
  align-items: center;
  gap: 2px;
}

.glossary-import {
  display: flex;
  flex: none;
  align-items: flex-end;
  gap: 8px;
}

.glossary-import-input {
  flex: 1;
  min-width: 0;
}

.glossary-list {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  scrollbar-width: thin;
}

.glossary-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 18px minmax(0, 1.2fr);
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--color-divider);
  padding: 2px 0;
}

.glossary-jp {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.glossary-arrow {
  color: var(--color-muted);
  font-size: 11px;
}

.glossary-zh {
  min-width: 0;
}

.glossary-empty {
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  padding: 12px;
  color: var(--color-muted);
  font-size: 12px;
  text-align: center;
}
</style>
