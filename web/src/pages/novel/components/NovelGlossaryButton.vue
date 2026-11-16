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
const glossaryCount = ref(Object.keys(props.glossary).length);

// 术语表对象不是深层响应式的，就地修改不会引起引用变化，
// 因此由编辑器在提交后回传条目数。
watch(
  () => props.glossary,
  (glossary) => {
    glossaryCount.value = Object.keys(glossary).length;
  },
);

const handleGlossaryChange = (count: number) => {
  glossaryCount.value = count;
};

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
    side="right"
    :ui="{
      content: 'w-full max-w-none sm:max-w-2xl',
      body: 'flex min-h-0 flex-col overflow-hidden p-0 sm:p-0',
    }"
    @update:open="updateOpen"
  >
    <template #body>
      <NovelGlossaryEditor
        v-if="open"
        ref="editorRef"
        :gnid="gnid"
        :value="glossary"
        @glossary-change="handleGlossaryChange"
      />
    </template>
  </USlideover>
</template>
