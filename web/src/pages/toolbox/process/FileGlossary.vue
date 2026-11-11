<script lang="ts" setup>
import { copyToClipboard, Toast, getApiErrorMessage } from '@novelia/web-kit';
import { DeleteOutlineOutlined } from '@vicons/material';

import type { ParsedFile } from '@/util/file';
import {
  translateLines,
  type SingleTaskTranslatorConfig,
} from '@/domain/translator';
import { Glossary } from '@/model/Glossary';
import { useSakuraWorkspaceStore } from '@/stores';

const props = defineProps<{
  files: ParsedFile[];
}>();

const sakuraWorkspace = useSakuraWorkspaceStore().ref;

const countKatakana = (content: string) => {
  const regexp = /[\u30A0-\u30FF]{2,}/g;
  const matches = content.matchAll(regexp);
  const katakanaCounter = new Map<string, number>();
  for (const match of matches) {
    const w = match[0];
    katakanaCounter.set(w, (katakanaCounter.get(w) || 0) + 1);
  }
  const sortedKatakanaCounter = new Map(
    [...katakanaCounter].sort(([_w1, c1], [_w2, c2]) => c2 - c1),
  );
  return sortedKatakanaCounter;
};

interface GlossaryInfo {
  content: string;
  katakanas: Map<string, number>;
}

const infos = ref(new Map<string, GlossaryInfo>());

watch(props, async ({ files }) => {
  const newInfos = new Map<string, GlossaryInfo>();
  for (const file of files) {
    let content = '';
    if (file.type === 'txt') {
      content = file.text;
    } else if (file.type === 'epub') {
      content = await file.getText();
    }
    const katakanas = countKatakana(content);
    newInfos.set(file.name, { content, katakanas });
  }
  infos.value = newInfos;
});

const katakanaThredhold = ref(10);

const katakanaMerged = computed(() => {
  const map = new Map<string, number>();
  infos.value.forEach(({ katakanas }) => {
    katakanas.forEach((value, key) => {
      map.set(key, (map.get(key) ?? 0) + value);
    });
  });
  return map;
});

const katakanaDeleted = ref<string[]>([]);
const undoDeleteKatakana = () => {
  katakanaDeleted.value.pop();
};
const lastDeletedHint = computed(() => {
  const last = katakanaDeleted.value[katakanaDeleted.value.length - 1];
  if (last === undefined) return undefined;
  return `${last} => ${katakanaTranslations.value[last]}`;
});

const katakanas = computed(() => {
  return new Map(
    [...katakanaMerged.value].filter(
      ([w, c]) =>
        c > katakanaThredhold.value && !katakanaDeleted.value.includes(w),
    ),
  );
});

const copyTranslationJson = async () => {
  const obj = Object.fromEntries(
    Array.from(katakanas.value).map(([key]) => [
      key,
      katakanaTranslations.value[key] ?? '',
    ]),
  );
  const jsonString = Glossary.toText(obj);
  await Toast.promise(copyToClipboard(jsonString), {
    success: '已经将翻译结果复制到剪切板',
    error: (reason) => getApiErrorMessage(reason, '复制失败'),
  }).catch(() => {});
};

const showSakuraSelectModal = ref(false);
const selectedSakuraWorkerId = ref(sakuraWorkspace.value.workers[0]?.id);

const katakanaTranslations = ref<{ [key: string]: string }>({});
const translationController = new AbortController();
onUnmounted(() => translationController.abort());

const translateKatakanas = async (id: 'youdao' | 'sakura') => {
  const jpWords = [...katakanas.value.keys()];
  let config: SingleTaskTranslatorConfig;
  if (id === 'sakura') {
    const worker = sakuraWorkspace.value.workers.find(
      (it) => it.id === selectedSakuraWorkerId.value,
    );
    if (worker === undefined) {
      Toast.error('未选择Sakura翻译器');
      return;
    }
    config = {
      id,
      endpoint: worker.endpoint,
      segLength: worker.segLength,
      prevSegLength: worker.prevSegLength,
    };
  } else {
    config = { id };
  }
  await Toast.promise(
    translateLines(jpWords, config, translationController.signal),
    { error: (reason) => getApiErrorMessage(reason, '翻译器错误') },
  )
    .then((zhWords) => {
      const jpToZh: { [key: string]: string } = {};
      jpWords.forEach((jpWord, index) => {
        jpToZh[jpWord] = zhWords[index];
      });
      katakanaTranslations.value = jpToZh;
    })
    .catch(() => {});
};
</script>

<template>
  <div class="flex flex-col flex-nowrap justify-start gap-x-4 gap-y-3">
    <bulletin>
      <n-p>术语表辅助制作工具正在开发中，当前方案分为识别和翻译两步。</n-p>
      <ul class="content-list">
        <li>识别阶段：根据片假名词汇出现频率判断可能是术语的词汇。</li>
        <li>翻译阶段：直接翻译日语词汇。</li>
      </ul>
      <n-p><b>注意，这是辅助制作，不是全自动生成，使用前务必检查结果。</b></n-p>
    </bulletin>

    <c-action-wrapper title="次数下限">
      <n-input-number
        v-model:value="katakanaThredhold"
        clearable
        size="small"
        style="width: 16em"
        min="0"
      />
    </c-action-wrapper>

    <c-action-wrapper title="操作">
      <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
        <UFieldGroup size="sm">
          <ActionButton
            class="rounded-md text-sm/4"
            :action="() => copyTranslationJson()"
          >
            复制术语表
          </ActionButton>
          <ActionButton
            class="rounded-md text-sm/4"
            :action="() => translateKatakanas('youdao')"
          >
            有道翻译
          </ActionButton>
        </UFieldGroup>

        <UFieldGroup size="sm">
          <ActionButton
            class="rounded-md text-sm/4"
            :action="() => translateKatakanas('sakura')"
          >
            {{ `Sakura翻译-${selectedSakuraWorkerId ?? '未选中'}` }}
          </ActionButton>
          <UButton
            color="neutral"
            variant="outline"
            @click="showSakuraSelectModal = true"
            class="text-sm/4"
          >
            选择翻译器
          </UButton>
        </UFieldGroup>

        <div
          class="flex flex-nowrap justify-start items-center gap-x-3 gap-y-2"
        >
          <UButton
            color="neutral"
            variant="outline"
            :disabled="katakanaDeleted.length === 0"
            size="sm"
            @click="undoDeleteKatakana"
            class="text-sm/4"
          >
            撤销删除
          </UButton>
          <n-text
            v-if="katakanaDeleted.length > 0"
            depth="3"
            style="font-size: 12px"
          >
            {{ lastDeletedHint }}
          </n-text>
        </div>
      </div>
    </c-action-wrapper>

    <UScrollArea
      v-if="katakanas.size !== 0"
      style="
        max-height: 60vh;
        max-width: 600px;
        margin-top: 16px;
        margin-left: 32px;
      "
    >
      <n-table striped size="small" style="font-size: 12px">
        <tr v-for="[word, number] in katakanas" :key="word">
          <td>
            <UTooltip text="移除">
              <ActionButton
                square
                size="sm"
                color="error"
                variant="link"
                class="p-0"
                :action="() => katakanaDeleted.push(word)"
                aria-label="移除"
              >
                <component
                  :is="DeleteOutlineOutlined"
                  class="size-4.5 shrink-0 group-aria-busy:hidden"
                  aria-hidden="true"
                />
              </ActionButton>
            </UTooltip>
          </td>
          <td nowrap="nowrap">{{ number }}</td>
          <td style="min-width: 100px">{{ word }}</td>
          <td nowrap="nowrap">=></td>
          <td style="padding-right: 16px">
            <n-input
              v-model:value="katakanaTranslations[word]"
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
  </div>

  <UModal
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
    title="选择Sakura翻译器"
    v-model:open="showSakuraSelectModal"
    class="w-[600px]"
  >
    <template #body>
      <n-radio-group v-model:value="selectedSakuraWorkerId">
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <n-radio
            v-for="worker of sakuraWorkspace.workers"
            :key="worker.id"
            :value="worker.id"
          >
            {{ worker.id }}
            <n-text depth="3">
              {{ worker.endpoint }}
            </n-text>
          </n-radio>
        </div>
      </n-radio-group>
    </template>
  </UModal>
</template>
