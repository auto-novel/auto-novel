<script lang="ts" setup>
import { TranslateTaskDescriptor } from '@/domain/translator';

const props = defineProps<{
  task: string;
}>();

const link = computed(() => {
  let task: ReturnType<typeof TranslateTaskDescriptor.parse>;
  try {
    task = TranslateTaskDescriptor.parse(props.task);
  } catch {
    // 损坏的历史任务仍可显示和删除，不能阻断整个队列渲染。
    return { text: `无效任务：${props.task}`, url: undefined };
  }
  const { desc, params } = task;
  const { level, forceMetadata } = params;

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

  const range = TranslateTaskDescriptor.formatRange(params);
  if (range) text += ` ${range}`;

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
