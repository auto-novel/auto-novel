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
const editorReady = ref(false);
watch(open, () => {
  editorReady.value = false;
});
const afterEnter = () => {
  if (open.value) editorReady.value = true;
};
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
    side="right"
    :ui="{
      content: 'w-full max-w-none sm:max-w-2xl',
      body: 'flex min-h-0 flex-col overflow-hidden p-0 sm:p-0',
    }"
    @update:open="updateOpen"
    @after:enter="afterEnter"
  >
    <template #body>
      <NovelGlossaryEditor
        v-if="open && editorReady"
        ref="editorRef"
        :gnid="gnid"
        :value="glossary"
      />
      <div v-else-if="open" class="space-y-4 p-4 sm:p-6" role="status">
        <p class="text-sm text-muted">正在加载术语表…</p>
        <div aria-hidden="true" class="space-y-3">
          <div class="h-8 rounded bg-elevated" />
          <div class="h-8 rounded bg-elevated" />
          <div class="h-8 rounded bg-elevated" />
        </div>
      </div>
    </template>
  </USlideover>
</template>
