<script lang="ts" setup>
import { useEventListener } from '@vueuse/core';
import { onBeforeRouteLeave } from 'vue-router';
import { DeleteOutlineOutlined } from '@vicons/material';
import {
  copyToClipboard,
  Toast,
  XConfirmDialog,
  XScrollArea,
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
  <div class="novel-glossary-editor">
    <div
      class="mb-4 flex max-w-125 flex-col flex-nowrap justify-start gap-x-4 gap-y-3"
    >
      <h3 class="heading-bar">编辑术语表</h3>
      <template v-if="gnidHint">
        <n-text style="font-size: 12px">{{ gnidHint }}</n-text>

        <n-text>
          使用前务必先阅读
          <n-a
            :href="forumPostUrls.glossaryGuide"
            target="_blank"
            rel="noopener noreferrer"
          >
            术语表使用指南
          </n-a>
          ，不要滥用术语表。
        </n-text>
      </template>

      <n-input-group>
        <n-input
          pair
          v-model:value="termsToAdd"
          size="small"
          separator="=>"
          :placeholder="['日文', '中文']"
          :input-props="{ spellcheck: false }"
        />
        <c-button label="添加" :round="false" size="small" @action="addTerm" />
      </n-input-group>

      <n-input
        v-model:value="importGlossaryRaw"
        type="textarea"
        size="small"
        placeholder="批量导入术语表"
        :input-props="{ spellcheck: false }"
        :rows="1"
      />

      <div class="flex flex-nowrap items-center justify-start gap-x-3 gap-y-2">
        <c-button
          label="导出"
          :round="false"
          size="small"
          @action="exportGlossary"
        />
        <c-button
          label="导入"
          :round="false"
          size="small"
          @action="importGlossary"
        />
        <c-button
          label="下载json文件"
          :round="false"
          size="small"
          @action="downloadGlossaryAsJsonFile"
        />
        <c-button
          v-if="whoami.isAdmin"
          secondary
          type="error"
          label="清空"
          :round="false"
          size="small"
          @action="clearTerm"
        />
      </div>

      <div class="flex flex-nowrap items-center justify-start gap-x-3 gap-y-2">
        <c-button
          :disabled="deletedTerms.length === 0"
          label="撤销删除"
          :round="false"
          size="small"
          @action="undoDeleteTerm"
        />
        <n-text
          v-if="lastDeletedTerm !== undefined"
          depth="3"
          style="font-size: 12px"
        >
          {{ lastDeletedTerm }}
        </n-text>
      </div>
    </div>

    <XScrollArea
      v-if="Object.keys(glossary).length !== 0"
      style="max-height: 400px; max-width: 500px; margin-bottom: 16px"
    >
      <n-table striped size="small" style="font-size: 12px; width: 100%">
        <tr v-for="wordJp in Object.keys(glossary).reverse()" :key="wordJp">
          <td>
            <c-button
              :icon="DeleteOutlineOutlined"
              text
              type="error"
              size="small"
              @action="deleteTerm(wordJp)"
            />
          </td>
          <td>{{ wordJp }}</td>
          <td nowrap="nowrap">=></td>
          <td style="padding-right: 16px">
            <n-input
              v-model:value="glossary[wordJp]"
              size="tiny"
              placeholder="请输入中文翻译"
              :theme-overrides="{
                border: '0',
                color: 'transparent',
              }"
            />
          </td>
        </tr>
      </n-table>
    </XScrollArea>

    <div class="flex max-w-125 flex-wrap justify-end gap-x-3 gap-y-2">
      <c-button label="提交" type="primary" @action="submitGlossary()" />
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
