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

const katakanaThredhold = ref<number | undefined>(10);

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
        c > (katakanaThredhold.value ?? 0) &&
        !katakanaDeleted.value.includes(w),
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
  <div class="flex flex-col gap-y-3">
    <bulletin>
      <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
        术语表辅助制作工具正在开发中，当前方案分为识别和翻译两步。
      </p>
      <ul class="content-list">
        <li>识别阶段：根据片假名词汇出现频率判断可能是术语的词汇。</li>
        <li>翻译阶段：直接翻译日语词汇。</li>
      </ul>
      <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
        <b>注意，这是辅助制作，不是全自动生成，使用前务必检查结果。</b>
      </p>
    </bulletin>

    <c-action-wrapper title="次数下限">
      <div class="flex w-[16em] items-center gap-1">
        <UInputNumber
          class="min-w-0 flex-1"
          v-model.optional="katakanaThredhold"
          size="sm"
          :min="0"
        />
        <UButton
          v-if="katakanaThredhold !== undefined"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="清空次数下限"
          @click="katakanaThredhold = undefined"
        />
      </div>
    </c-action-wrapper>

    <c-action-wrapper title="操作">
      <div class="flex flex-col gap-y-2">
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

        <div class="flex items-center gap-x-3">
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
          <span
            class="text-muted text-[12px]"
            v-if="katakanaDeleted.length > 0"
          >
            {{ lastDeletedHint }}
          </span>
        </div>
      </div>
    </c-action-wrapper>

    <UScrollArea
      class="mt-4 ml-8 max-h-[60vh] max-w-150"
      v-if="katakanas.size !== 0"
    >
      <table
        class="content-table rounded-[3px] border border-default [&>tbody>tr:last-child>td]:border-b-0 [&>tbody>tr:nth-child(even)]:bg-surface text-[12px]"
      >
        <tbody>
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
                  :icon="DeleteOutlineOutlined"
                  :ui="{ leadingIcon: 'size-4.5' }"
                />
              </UTooltip>
            </td>
            <td class="whitespace-nowrap">{{ number }}</td>
            <td class="min-w-[100px]">{{ word }}</td>
            <td class="whitespace-nowrap">=></td>
            <td class="pr-4!">
              <UInput
                class="w-full"
                v-model="katakanaTranslations[word]"
                size="xs"
                placeholder="请输入中文翻译"
                variant="none"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </UScrollArea>
  </div>

  <UModal
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
    title="选择Sakura翻译器"
    v-model:open="showSakuraSelectModal"
    class="w-150"
  >
    <template #body>
      <n-radio-group v-model:value="selectedSakuraWorkerId">
        <div class="flex flex-col gap-y-2">
          <n-radio
            v-for="worker of sakuraWorkspace.workers"
            :key="worker.id"
            :value="worker.id"
          >
            {{ worker.id }}
            <span class="text-muted">
              {{ worker.endpoint }}
            </span>
          </n-radio>
        </div>
      </n-radio-group>
    </template>
  </UModal>
</template>
