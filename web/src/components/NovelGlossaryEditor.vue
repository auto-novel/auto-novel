<script lang="ts" setup>
import { useEventListener } from '@vueuse/core';
import { onBeforeRouteLeave } from 'vue-router';
import { DeleteOutlineOutlined } from '@vicons/material';
import {
  copyToClipboard,
  Toast,
  XConfirmDialog,
  getApiErrorMessage,
} from '@novelia/web-kit';

import { WebNovelApi, WenkuNovelApi } from '@/api';
import { forumPostUrls } from '@/config';
import { GenericNovelId } from '@/model/Common';
import { Glossary } from '@/model/Glossary';
import { useLocalVolumeStore, useWhoamiStore } from '@/stores';
import { downloadFile } from '@/util';

const props = defineProps<{
  gnid?: GenericNovelId;
  value: Glossary;
}>();

const showConfirmModal = ref(false);
const pendingConfirmResolve = ref<((value: boolean) => void) | null>(null);

const cancelPendingNavigation = () => {
  if (pendingConfirmResolve.value) {
    pendingConfirmResolve.value(false);
    pendingConfirmResolve.value = null;
  }
  showConfirmModal.value = false;
};

const handleConfirmClose = () => {
  showConfirmModal.value = false;
  if (pendingConfirmResolve.value) {
    resetState();
    pendingConfirmResolve.value(true);
    pendingConfirmResolve.value = null;
  }
};

const handleModalUpdateShow = (show: boolean) => {
  if (!show) {
    cancelPendingNavigation();
  }
};

const confirmLeave = () => {
  if (isGlossaryChanged()) {
    return new Promise<boolean>((resolve) => {
      cancelPendingNavigation();
      pendingConfirmResolve.value = resolve;
      showConfirmModal.value = true;
    });
  }
  return true;
};

onBeforeRouteLeave(() => {
  return confirmLeave();
});

useEventListener(window, 'beforeunload', (e) => {
  if (isGlossaryChanged()) {
    e.preventDefault();
    return '检测到未保存的修改，确认关闭吗？';
  }
});

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const glossary = ref<Glossary>({});
const originalGlossary = ref<Glossary>({});
const termsToAdd = ref<[string, string]>(['', '']);

const termChunkSize = 50;
const termChunks = computed(() => {
  const words = Object.keys(glossary.value).reverse();
  const chunks: string[][] = [];
  for (let index = 0; index < words.length; index += termChunkSize) {
    chunks.push(words.slice(index, index + termChunkSize));
  }
  return chunks;
});

const editingWord = ref<string | null>(null);
const vFocus = {
  mounted: (el: HTMLInputElement) => el.focus(),
};
const finishEditing = (event: KeyboardEvent) => {
  if (!event.isComposing) editingWord.value = null;
};

const syncGlossary = () => {
  editingWord.value = null;
  glossary.value = { ...props.value };
  originalGlossary.value = { ...props.value };
};

const resetState = () => {
  syncGlossary();
  termsToAdd.value = ['', ''];
};

onMounted(() => {
  resetState();
});

watch(() => props.value, syncGlossary, { deep: true });

const isGlossaryChanged = () => {
  if (termsToAdd.value.some((term) => term.trim() !== '')) return true;
  const cur = glossary.value;
  const orig = originalGlossary.value;
  const curKeys = Object.keys(cur);
  if (curKeys.length !== Object.keys(orig).length) return true;
  return curKeys.some((key) => cur[key] !== orig[key]);
};

const gnidHint = computed(() => {
  const gnid = props.gnid;
  if (gnid === undefined) {
    return undefined;
  } else {
    return GenericNovelId.toString(gnid);
  }
});

const updateGlossary = async (glossaryValue: Glossary) => {
  const gnid = props.gnid;
  if (gnid === undefined) {
    return;
  }
  if (gnid.type === 'web') {
    await WebNovelApi.updateGlossary(
      gnid.providerId,
      gnid.novelId,
      glossaryValue,
    );
  } else if (gnid.type === 'wenku') {
    await WenkuNovelApi.updateGlossary(gnid.novelId, glossaryValue);
  } else {
    const repo = await useLocalVolumeStore();
    await repo.updateGlossary(gnid.volumeId, glossaryValue);
  }
};

const submitGlossary = () => {
  const submittedGlossary = { ...toRaw(glossary.value) };
  return Toast.promise(updateGlossary(submittedGlossary), {
    success: '术语表提交成功',
    error: (reason) => getApiErrorMessage(reason, '术语表提交失败'),
  })
    .then(() => {
      for (const key in props.value) {
        delete props.value[key];
      }
      for (const key in submittedGlossary) {
        props.value[key] = submittedGlossary[key];
      }
      originalGlossary.value = { ...submittedGlossary };
    })
    .catch(() => {});
};

const importGlossaryRaw = ref('');

const deletedTerms = ref<[string, string][]>([]);

const lastDeletedTerm = computed(
  () => deletedTerms.value[deletedTerms.value.length - 1],
);

const canAddTerm = computed(() =>
  termsToAdd.value.every((term) => term.trim() !== ''),
);

const clearTerm = () => {
  editingWord.value = null;
  glossary.value = {};
};

const undoDeleteTerm = () => {
  if (deletedTerms.value.length === 0) return;
  const [jp, zh] = deletedTerms.value.pop()!;
  glossary.value[jp] = zh;
};

const deleteTerm = (jp: string) => {
  if (editingWord.value === jp) editingWord.value = null;
  if (jp in glossary.value) {
    deletedTerms.value.push([jp, glossary.value[jp]]);
    delete glossary.value[jp];
  }
};

const addTerm = () => {
  const [jp, zh] = termsToAdd.value.map((term) => term.trim());
  if (jp && zh) {
    glossary.value[jp] = zh;
    termsToAdd.value = ['', ''];
  }
};

const exportGlossary = () =>
  Toast.promise(copyToClipboard(Glossary.toText(glossary.value)), {
    success: '导出成功：已复制到剪贴板',
    error: (reason) => getApiErrorMessage(reason, '导出失败'),
  }).catch(() => {});

const importGlossary = () => {
  const importedGlossary = Glossary.fromText(importGlossaryRaw.value);
  if (importedGlossary === undefined) {
    Toast.error('导入失败：术语表格式不正确');
  } else {
    Toast.success('导入成功');
    for (const jp in importedGlossary) {
      const zh = importedGlossary[jp];
      glossary.value[jp] = zh;
    }
  }
};

const downloadGlossaryAsJsonFile = async () => {
  downloadFile(
    `${gnidHint.value ?? 'glossary'}.json`,
    new Blob([Glossary.toJson(glossary.value)], {
      type: 'text/plain',
    }),
  );
};

defineExpose({
  isGlossaryChanged,
  resetState,
  confirmLeave,
});
</script>

<template>
  <div class="novel-glossary-editor flex min-h-0 flex-1 flex-col">
    <div
      class="flex shrink-0 flex-col gap-y-3 border-b border-default bg-default px-4 py-4 sm:px-6"
    >
      <UFieldGroup size="sm" class="w-full">
        <UInput
          v-model="termsToAdd[0]"
          placeholder="日文"
          aria-label="日文术语"
          :spellcheck="false"
          class="min-w-0 flex-1"
        />
        <span
          class="flex items-center border border-default px-2 text-muted"
          aria-hidden="true"
        >
          =&gt;
        </span>
        <UInput
          v-model="termsToAdd[1]"
          placeholder="中文"
          aria-label="中文翻译"
          :spellcheck="false"
          class="min-w-0 flex-1"
        />
        <UButton
          color="primary"
          variant="soft"
          :disabled="!canAddTerm"
          @click="addTerm"
          class="shrink-0 justify-center"
        >
          添加
        </UButton>
      </UFieldGroup>

      <div
        v-if="lastDeletedTerm"
        class="flex min-w-0 items-center gap-x-3 rounded-md bg-elevated px-3 py-1.5"
        role="status"
      >
        <span
          class="min-w-0 flex-1 truncate text-xs text-muted"
          :title="`${lastDeletedTerm[0]} => ${lastDeletedTerm[1]}`"
        >
          <template v-if="deletedTerms.length > 1">
            已删除 {{ deletedTerms.length }} 项 · 最近：{{
              lastDeletedTerm[0]
            }}
            =&gt; {{ lastDeletedTerm[1] }}
          </template>
          <template v-else>
            已删除「{{ lastDeletedTerm[0] }} =&gt; {{ lastDeletedTerm[1] }}」
          </template>
        </span>
        <UButton
          color="primary"
          variant="link"
          size="sm"
          @click="undoDeleteTerm"
          class="shrink-0 text-sm/4"
        >
          {{ deletedTerms.length > 1 ? '撤销上一项' : '撤销' }}
        </UButton>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
      <div class="flex flex-col gap-y-3 pt-4 pb-4 sm:pt-6">
        <UTextarea
          v-model="importGlossaryRaw"
          size="sm"
          placeholder="批量导入术语表"
          :spellcheck="false"
          :rows="1"
          class="w-full"
        />

        <div class="flex items-center gap-x-3">
          <ActionButton class="text-sm/4" size="sm" :action="exportGlossary">
            导出
          </ActionButton>
          <ActionButton class="text-sm/4" size="sm" :action="importGlossary">
            导入
          </ActionButton>
          <ActionButton
            class="text-sm/4"
            size="sm"
            :action="downloadGlossaryAsJsonFile"
          >
            下载json文件
          </ActionButton>
          <UButton
            v-if="whoami.isAdmin"
            color="error"
            size="sm"
            variant="soft"
            @click="clearTerm"
            class="text-sm/4"
          >
            清空
          </UButton>
        </div>
      </div>

      <div
        v-for="(chunk, chunkIndex) in termChunks"
        :key="chunkIndex"
        class="glossary-chunk"
        :style="{ containIntrinsicSize: `auto ${chunk.length * 44}px` }"
      >
        <div
          v-for="(wordJp, index) in chunk"
          :key="wordJp"
          class="glossary-term grid min-h-11 grid-cols-[24px_minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-2 border-b border-default px-1.5 py-1.5 text-xs"
          :class="
            (chunkIndex * termChunkSize + index) % 2 === 1
              ? 'bg-surface'
              : 'bg-default'
          "
        >
          <UButton
            color="error"
            size="sm"
            variant="link"
            square
            class="p-0"
            @click="deleteTerm(wordJp)"
            :aria-label="`删除 ${wordJp}`"
            :icon="DeleteOutlineOutlined"
            :ui="{ leadingIcon: 'size-4.5' }"
          />
          <span class="min-w-0 break-all">{{ wordJp }}</span>
          <span aria-hidden="true">=&gt;</span>
          <input
            v-if="editingWord === wordJp"
            v-focus
            v-model="glossary[wordJp]"
            :aria-label="`${wordJp} 的中文翻译`"
            placeholder="请输入中文翻译"
            class="min-w-0 w-full rounded bg-transparent px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary"
            @blur="editingWord = null"
            @keydown.enter="finishEditing"
            @keydown.esc="finishEditing"
          />
          <button
            v-else
            type="button"
            :aria-label="`编辑 ${wordJp} 的中文翻译`"
            class="min-w-0 w-full cursor-text rounded px-2 py-1 text-left break-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            :class="{ 'text-muted': !glossary[wordJp] }"
            @click="editingWord = wordJp"
          >
            {{ glossary[wordJp] || '请输入中文翻译' }}
          </button>
        </div>
      </div>
    </div>

    <div
      class="flex shrink-0 items-center justify-end gap-3 border-t border-default bg-default px-4 py-4 sm:px-6"
    >
      <div v-if="gnidHint" class="flex min-w-0 flex-1 items-start gap-1.5">
        <UIcon
          name="i-lucide-triangle-alert"
          class="mt-0.5 size-4 shrink-0 text-warning"
          aria-hidden="true"
        />
        <p class="min-w-0 text-xs/5 text-muted">
          请先阅读
          <ULink :href="forumPostUrls.glossaryGuide" target="_blank">
            术语表使用指南
          </ULink>
          ，勿滥用。
        </p>
      </div>
      <ActionButton
        class="shrink-0"
        color="primary"
        :action="() => submitGlossary()"
        variant="solid"
      >
        提交
      </ActionButton>
    </div>

    <XConfirmDialog
      :open="showConfirmModal"
      title="提示"
      description="检测到未保存的修改，确认关闭吗？"
      @update:open="handleModalUpdateShow"
      @confirm="handleConfirmClose"
    />
  </div>
</template>

<style scoped>
.glossary-chunk {
  content-visibility: auto;
}
</style>
