<script lang="ts" setup>
import NovelGlossaryEditor from '@/components/NovelGlossaryEditor.vue';
import type { GenericNovelId } from '@/model/Common';
import type { Glossary } from '@/model/Glossary';

const props = defineProps<{
  gnid: GenericNovelId;
  glossary: Glossary;
}>();

const open = ref(false);
const closing = ref(false);
const glossaryCount = computed(() => Object.keys(props.glossary).length);
const editorRef =
  useTemplateRef<InstanceType<typeof NovelGlossaryEditor>>('editorRef');

const updateOpen = async (value: boolean) => {
  if (closing.value) return;
  if (value) {
    open.value = true;
    return;
  }

  closing.value = true;
  try {
    if (!editorRef.value || (await editorRef.value.confirmLeave())) {
      open.value = false;
    }
  } finally {
    closing.value = false;
  }
};
</script>

<template>
  <UButton color="neutral" variant="outline" @click="open = true">
    术语表 [{{ glossaryCount }}]
  </UButton>

  <USlideover
    :open="open"
    title="术语表"
    description="查看和编辑本书的翻译术语"
    side="right"
    :ui="{
      content: 'w-full max-w-none sm:max-w-2xl',
    }"
    @update:open="updateOpen"
  >
    <template #body>
      <NovelGlossaryEditor
        v-if="open"
        ref="editorRef"
        :gnid="gnid"
        :value="glossary"
      />
    </template>
  </USlideover>
</template>
