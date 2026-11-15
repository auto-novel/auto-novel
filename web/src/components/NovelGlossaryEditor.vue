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

// 将操作区也作为虚拟项，整个侧栏只保留一个滚动容器。
type EditorItem =
  | { type: 'controls' | 'submit'; id: string }
  | { type: 'term'; id: string; wordJp: string };
const editorItems = computed<EditorItem[]>(() => [
  { type: 'controls', id: 'controls' },
  ...Object.keys(glossary.value)
    .reverse()
    .map((wordJp) => ({ type: 'term' as const, id: `term:${wordJp}`, wordJp })),
  { type: 'submit', id: 'submit' },
]);
const virtualize = {
  estimateSize: (index: number) =>
    index === 0 ? 280 : index === editorItems.value.length - 1 ? 56 : 44,
  getItemKey: (index: number) => editorItems.value[index].id,
  overscan: 8,
};

const syncGlossary = () => {
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

const lastDeletedTerm = computed(() => {
  const last = deletedTerms.value[deletedTerms.value.length - 1];
  if (last === undefined) return undefined;
  return `${last[0]} => ${last[1]}`;
});

const clearTerm = () => {
  glossary.value = {};
};

const undoDeleteTerm = () => {
  if (deletedTerms.value.length === 0) return;
  const [jp, zh] = deletedTerms.value.pop()!;
  glossary.value[jp] = zh;
};

const deleteTerm = (jp: string) => {
  if (jp in glossary.value) {
    deletedTerms.value.push([jp, glossary.value[jp]]);
    delete glossary.value[jp];
  }
};

const addTerm = () => {
  const [jp, zh] = termsToAdd.value;
  if (jp && zh) {
    glossary.value[jp.trim()] = zh.trim();
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
    <UScrollArea
      :items="editorItems"
      :virtualize="virtualize"
      :ui="{ item: 'px-4 sm:px-6' }"
      class="min-h-0 flex-1"
    >
      <template #default="{ item, index }">
        <div
          v-if="item.type === 'controls'"
          class="flex flex-col gap-y-3 pt-4 pb-4 sm:pt-6"
        >
          <UAlert
            v-if="gnidHint"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
          >
            <template #description>
              使用前务必先阅读
              <ULink :href="forumPostUrls.glossaryGuide" target="_blank">
                术语表使用指南
              </ULink>
              ，不要滥用术语表。
            </template>
          </UAlert>

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
              color="neutral"
              variant="outline"
              @click="addTerm"
              class="shrink-0 justify-center"
            >
              添加
            </UButton>
          </UFieldGroup>

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

          <div class="flex items-center gap-x-3">
            <UButton
              color="neutral"
              variant="outline"
              :disabled="deletedTerms.length === 0"
              size="sm"
              @click="undoDeleteTerm"
              class="text-sm/4"
            >
              撤销删除
            </UButton>
            <span
              class="text-muted text-[12px]"
              v-if="lastDeletedTerm !== undefined"
            >
              {{ lastDeletedTerm }}
            </span>
          </div>
        </div>

        <div
          v-else-if="item.type === 'term'"
          class="grid min-h-11 grid-cols-[24px_minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-2 border-b border-default px-1.5 py-1.5 text-xs"
          :class="index % 2 === 0 ? 'bg-surface' : 'bg-default'"
        >
          <UButton
            color="error"
            size="sm"
            variant="link"
            square
            class="p-0"
            @click="deleteTerm(item.wordJp)"
            :aria-label="`删除 ${item.wordJp}`"
            :icon="DeleteOutlineOutlined"
            :ui="{ leadingIcon: 'size-4.5' }"
          />
          <span class="min-w-0 break-all">{{ item.wordJp }}</span>
          <span aria-hidden="true">=&gt;</span>
          <UInput
            v-model="glossary[item.wordJp]"
            size="xs"
            placeholder="请输入中文翻译"
            :aria-label="`${item.wordJp} 的中文翻译`"
            variant="none"
            class="min-w-0 w-full"
          />
        </div>

        <div
          v-else
          class="flex flex-wrap justify-end gap-x-3 gap-y-2 pt-4 pb-4 sm:pb-6"
        >
          <ActionButton
            color="primary"
            :action="() => submitGlossary()"
            variant="solid"
          >
            提交
          </ActionButton>
        </div>
      </template>
    </UScrollArea>

    <XConfirmDialog
      :open="showConfirmModal"
      title="提示"
      description="检测到未保存的修改，确认关闭吗？"
      @update:open="handleModalUpdateShow"
      @confirm="handleConfirmClose"
    />
  </div>
</template>
