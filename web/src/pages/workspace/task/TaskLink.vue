<script lang="ts" setup>
import { TranslateTaskDescriptor } from '@/model/Translator';

const props = defineProps<{
  task: string;
}>();

const link = computed(() => {
  const { desc, params } = TranslateTaskDescriptor.parse(props.task);
  const { level, forceMetadata, startIndex, endIndex } = params;

  let text: string;
  let url: string | undefined;
  if (desc.type === 'web') {
    text = `web/${desc.providerId}/${desc.novelId}`;
    url = `/novel/${desc.providerId}/${desc.novelId}`;
  } else if (desc.type === 'wenku') {
    text = `wenku/${desc.novelId}`;
    url = `/wenku/${desc.novelId}`;
  } else {
    text = 'local';
    url = undefined;
  }

  if (startIndex > 0 || endIndex < 65535) {
    const endLabel = endIndex < 65535 ? endIndex : 'Inf';
    text += ` [${startIndex},${endLabel})`;
  }

  const tags: string[] = [];
  if (level === 'expire') {
    tags.push('过期章节');
  } else if (level === 'all') {
    tags.push('全部章节');
  } else if (level === 'sync') {
    tags.push('源站同步');
  }
  if (forceMetadata) tags.push('重翻目录');
  if (tags.length > 0) {
    text += ` [${tags.join('/')}]`;
  }

  return { text, url };
});
</script>

<template>
  <RouterLink
    v-if="link.url"
    :to="link.url"
    target="_blank"
    rel="noopener noreferrer"
    :class="[
      'block text-xs/4 font-normal text-muted underline underline-offset-2',
      'hover:text-primary',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    ]"
  >
    {{ link.text }}
  </RouterLink>
  <span v-else class="block text-xs/4 font-normal text-muted">
    {{ link.text }}
  </span>
</template>
