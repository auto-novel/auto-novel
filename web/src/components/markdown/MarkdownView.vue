<script lang="ts" setup>
import { computed } from 'vue';
import { renderMarkdown } from '@novelia/forum-api';

const props = defineProps<{
  mode: 'article' | 'comment';
  source: string;
}>();

const rendered = computed(() => renderMarkdown(props.source, props.mode));

// 剧透块不带内联事件，统一在容器上代理点击与键盘操作
const spoilerFromTarget = (target: EventTarget | null) =>
  target instanceof Element
    ? target.closest<HTMLElement>('[data-markdown-spoiler]')
    : null;

const toggleSpoiler = (spoilerElement: HTMLElement) => {
  spoilerElement.dataset.hide =
    spoilerElement.dataset.hide === 'true' ? 'false' : 'true';
};

const handleClick = (event: MouseEvent) => {
  const spoilerElement = spoilerFromTarget(event.target);
  if (!spoilerElement) return;
  // 展开后允许正常点击剧透内的链接
  if (
    spoilerElement.dataset.hide === 'false' &&
    event.target instanceof Element &&
    event.target.closest('a')
  ) {
    return;
  }
  if (spoilerElement.dataset.hide === 'true') event.preventDefault();
  toggleSpoiler(spoilerElement);
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const spoilerElement = spoilerFromTarget(event.target);
  if (!spoilerElement) return;
  event.preventDefault();
  toggleSpoiler(spoilerElement);
};
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <n-el
    tag="div"
    class="markdown"
    v-html="rendered"
    @click="handleClick"
    @keydown="handleKeydown"
  />
</template>

<style>
.markdown {
  overflow-wrap: break-word;
  word-break: break-word;
}

.markdown a,
.markdown p,
.markdown ul,
.markdown ol,
.markdown li {
  transition: color 0.3s var(--cubic-bezier-ease-in-out);
  line-height: var(--line-height);
  font-size: var(--font-size);
}

.markdown a {
  text-decoration: none;
  color: var(--primary-color);
}
.markdown p {
  margin: 16px 0 16px 0;
  color: var(--text-color-2);
}
.markdown ul,
.markdown ol {
  padding: 0 0 0 2em;
}
.markdown li {
  margin: 0.25em 0 0 0;
  color: var(--text-color-2);
}
.markdown code {
  transition:
    color 0.3s var(--cubic-bezier-ease-in-out) background-color 0.3s
      var(--cubic-bezier-ease-in-out),
    border-color 0.3s var(--cubic-bezier-ease-in-out);
  padding: 0.05em 0.35em 0 0.35em;
  font-size: 0.9em;
  color: var(--text-color-2);
  background-color: var(--code-color);
  border-radius: var(--border-radius-small);
  border: 1px solid #0000;
  line-height: 1.4;
  box-sizing: border-box;
  display: inline-block;
}
.markdown img {
  max-width: 100%;
}
.markdown table {
  display: block;
  overflow-x: auto;
  border-spacing: 0;
  border-collapse: collapse;
}
.markdown th {
  white-space: nowrap;
  background-color: var(--action-color);
}
.markdown th,
.markdown td {
  padding: 12px;
  border-bottom: 1px solid var(--divider-color);
}
.markdown tr th:not(:last-child),
.markdown td:not(:last-child) {
  border-right: 1px solid var(--divider-color);
}

/* spoiler会在点击时切换高亮（未点击时是hover高亮） */
.markdown span[data-hide] {
  background-color: var(--text-color-1);
  transition: color ease 0.2s;
  padding: 0.05em 0.2em;
}

.markdown span[data-hide='true'] {
  color: transparent;
}

.markdown span[data-hide='false'] {
  color: var(--body-color);
}

.markdown span[data-hide='true']:hover,
.markdown span[data-hide='true']:focus {
  color: var(--body-color);
}

.markdown summary {
  cursor: pointer;
}

.markdown .markdown-star-rating {
  display: inline-flex;
  flex-wrap: nowrap;
}

.markdown .markdown-star {
  position: relative;
  display: flex;
  width: 20px;
  height: 20px;
  color: rgb(219, 219, 223);
}

.markdown .markdown-star:not(:first-child) {
  margin-left: 6px;
}

.markdown .markdown-star::before,
.markdown .markdown-star__half::before {
  width: 20px;
  height: 20px;
  background-color: currentColor;
  content: '';
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath d='M394 480a16 16 0 01-9.39-3L256 383.76 127.39 477a16 16 0 01-24.55-18.08L153 310.35 23 221.2a16 16 0 019-29.2h160.38l48.4-148.95a16 16 0 0130.44 0l48.4 149H480a16 16 0 019.05 29.2L359 310.35l50.13 148.53A16 16 0 01394 480z'/%3E%3C/svg%3E")
    center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath d='M394 480a16 16 0 01-9.39-3L256 383.76 127.39 477a16 16 0 01-24.55-18.08L153 310.35 23 221.2a16 16 0 019-29.2h160.38l48.4-148.95a16 16 0 0130.44 0l48.4 149H480a16 16 0 019.05 29.2L359 310.35l50.13 148.53A16 16 0 01394 480z'/%3E%3C/svg%3E")
    center / contain no-repeat;
}

.markdown .markdown-star--active {
  color: #4fb233;
}

.markdown .markdown-star__half {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  display: flex;
  width: 50%;
  overflow: hidden;
  color: transparent;
}

.markdown .markdown-star__half--active {
  color: #4fb233;
}

.markdown .markdown-star__half::before {
  flex: 0 0 20px;
}
</style>
