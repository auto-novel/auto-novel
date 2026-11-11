<script lang="ts" setup>
import { DeleteOutlineOutlined } from '@vicons/material';
import { copyToClipboard, Toast, getApiErrorMessage } from '@novelia/web-kit';

import { WebNovelApi, WenkuNovelApi } from '@/api';
import { forumPostUrls } from '@/config';
import { GenericNovelId } from '@/model/Common';
import { Glossary } from '@/model/Glossary';
import { useLocalVolumeStore, useWhoamiStore } from '@/stores';
import { downloadFile } from '@/util';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  gnid?: GenericNovelId;
  value: Glossary;
}>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const glossary = ref<Glossary>({});
const originalGlossary = ref<Glossary>({});

const showGlossaryModal = ref(false);
const showConfirmModal = ref(false);

const toggleGlossaryModal = () => {
  if (showGlossaryModal.value === false) {
    glossary.value = { ...props.value };
    originalGlossary.value = { ...props.value };
  }
  showGlossaryModal.value = !showGlossaryModal.value;
};

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
      // 触发组件外的术语表本体更新。有点傻，但够用。
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

const handleUpdateShow = (show: boolean) => {
  if (!show) {
    if (isGlossaryChanged()) {
      showConfirmModal.value = true;
      return;
    }
  }
  showGlossaryModal.value = show;
};

const handleConfirmClose = () => {
  showConfirmModal.value = false;
  showGlossaryModal.value = false;
};

const handleConfirmCancel = () => {
  showConfirmModal.value = false;
};

const importGlossaryRaw = ref('');
const termsToAdd = ref<[string, string]>(['', '']);

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

const downloadGlossaryAsJsonFile = async (ev: MouseEvent) => {
  downloadFile(
    `${gnidHint.value ?? 'glossary'}.json`,
    new Blob([Glossary.toJson(glossary.value)], {
      type: 'text/plain',
    }),
  );
};
</script>

<template>
  <UButton
    color="neutral"
    variant="outline"
    class="rounded-full"
    v-bind="$attrs"
    @click="toggleGlossaryModal"
  >
    {{ `术语表[${Object.keys(value).length}]` }}
  </UButton>

  <UModal
    title="编辑术语表"
    :open="showGlossaryModal"
    @update:open="handleUpdateShow"
    :content="{ onOpenAutoFocus: (event: Event) => event.preventDefault() }"
    :ui="{ content: 'w-[600px] max-w-[calc(100vw-2rem)]' }"
  >
    <template #body>
      <UScrollArea style="max-height: calc(80dvh - 140px)">
        <div
          class="mb-4 flex max-w-100 flex-col flex-nowrap justify-start gap-x-4 gap-y-3"
        >
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
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              @click="addTerm"
              class="text-sm/4"
            >
              添加
            </UButton>
          </n-input-group>

          <n-input
            v-model:value="importGlossaryRaw"
            type="textarea"
            size="small"
            placeholder="批量导入术语表"
            :input-props="{ spellcheck: false }"
            :rows="1"
          />

          <div
            class="flex flex-nowrap items-center justify-start gap-x-3 gap-y-2"
          >
            <ActionButton
              class="rounded-md text-sm/4"
              size="sm"
              :action="exportGlossary"
            >
              导出
            </ActionButton>
            <ActionButton
              class="rounded-md text-sm/4"
              size="sm"
              :action="importGlossary"
            >
              导入
            </ActionButton>
            <ActionButton
              class="rounded-md text-sm/4"
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
          <div
            class="flex flex-nowrap items-center justify-start gap-x-3 gap-y-2"
          >
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
            <n-text
              v-if="lastDeletedTerm !== undefined"
              depth="3"
              style="font-size: 12px"
            >
              {{ lastDeletedTerm }}
            </n-text>
          </div>
        </div>

        <n-table
          v-if="Object.keys(glossary).length !== 0"
          striped
          size="small"
          style="font-size: 12px; max-width: 400px"
        >
          <tr v-for="wordJp in Object.keys(glossary).reverse()" :key="wordJp">
            <td>
              <ActionButton
                color="error"
                size="sm"
                variant="link"
                square
                class="p-0"
                :action="() => deleteTerm(wordJp)"
                aria-label="删除"
              >
                <component
                  :is="DeleteOutlineOutlined"
                  class="size-4.5 shrink-0 group-aria-busy:hidden"
                  aria-hidden="true"
                />
              </ActionButton>
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
                  color: 'transprent',
                }"
              />
            </td>
          </tr>
        </n-table>
      </UScrollArea>

      <div class="mt-4 flex flex-wrap justify-end gap-x-3 gap-y-2">
        <ActionButton
          color="primary"
          :action="() => submitGlossary()"
          variant="solid"
        >
          提交
        </ActionButton>
      </div>

      <UModal
        v-model:open="showConfirmModal"
        title="提示"
        :ui="{ content: 'w-[420px] max-w-[calc(100vw-2rem)]' }"
      >
        <template #body>
          <n-text>检测到未保存的修改，确认关闭吗？</n-text>
          <div class="mt-4 flex flex-wrap justify-end gap-x-3 gap-y-2">
            <UButton
              variant="solid"
              color="warning"
              size="sm"
              class="rounded-full text-sm/4"
              @click="handleConfirmClose"
            >
              确认
            </UButton>
            <UButton
              color="neutral"
              size="sm"
              variant="soft"
              class="rounded-full text-sm/4"
              @click="handleConfirmCancel"
            >
              取消
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UModal>
</template>
