<script lang="ts" setup>
import { GenericNovelId } from '@/model/Common';
import type { LocalVolumeMetadata } from '@/model/LocalVolume';
import type { TranslatorId } from '@/model/Translator';
import { useSettingStore } from '@/stores';

const props = defineProps<{
  volume: LocalVolumeMetadata;
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const calculateFinished = (translatorId: TranslatorId) =>
  props.volume.toc.filter((it) => it[translatorId]).length;

const youdao = ref(calculateFinished('youdao'));
const gpt = ref(calculateFinished('gpt'));
const sakura = ref(calculateFinished('sakura'));

const translateTask = useTemplateRef('translateTask');
const startTranslateTask = (translatorId: 'youdao') =>
  translateTask?.value?.startTask(
    { type: 'local', volumeId: props.volume.id },
    {
      level: 'expire',
      forceMetadata: false,
      useBrowserCrawler: false,
    },
    { id: translatorId },
  );
</script>

<template>
  <div class="flex flex-col gap-1">
    <ULink
      v-if="!volume.id.endsWith('.epub')"
      :to="`/workspace/reader/${encodeURIComponent(volume.id)}/0`"
    >
      {{ volume.id }}
    </ULink>
    <span class="text-ink" v-else>{{ volume.id }}</span>

    <span class="text-muted">
      总计 {{ volume.toc.length }} / 有道 {{ youdao }} / GPT {{ gpt }} / Sakura
      {{ sakura }}
    </span>

    <div class="flex flex-wrap gap-2">
      <ActionButton
        v-if="setting.enabledTranslator.includes('youdao')"
        size="xs"
        variant="soft"
        :action="() => startTranslateTask('youdao')"
      >
        更新有道
      </ActionButton>
      <glossary-button
        :gnid="GenericNovelId.local(volume.id)"
        :value="volume.glossary"
        size="xs"
        variant="soft"
      />
    </div>
  </div>
  <TranslateTask
    class="mt-5"
    ref="translateTask"
    @update:youdao="(zh) => (youdao = zh)"
  />
</template>
