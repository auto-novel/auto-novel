<script lang="ts" setup>
import { CommentOutlined } from '@vicons/material';
import { XAsyncContent, XButton, XPagination } from '@novelia/web-kit';

import { CommentRepo } from '@/repos';
import type { Comment } from '@novelia/web-kit';
import { useDraftStore, useWhoamiStore } from '@/stores';

const props = defineProps<{
  site: string;
  locked: boolean;
}>();

const paginationScope = useTemplateRef<HTMLElement>('paginationScope');
const page = ref(1);
const { data: commentPage, error } = CommentRepo.useCommentList(
  page,
  () => props.site,
);

const pageSize = 10;
const pageCount = computed(() =>
  Math.ceil((commentPage.value?.total ?? 0) / pageSize),
);

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const draftStore = useDraftStore();
const draftId = `comment-${props.site}`;

const showInput = ref(false);
const replyTo = ref<Comment>();

const anchorEl = useTemplateRef('anchor');
watch(page, () => {
  anchorEl.value?.scrollIntoView();
  window.scrollBy({ top: -50, behavior: 'auto' });
  // 翻页会卸载当前页的回复编辑器，避免旧 replyTo 在返回时重新挂载。
  replyTo.value = undefined;
});

function onReplied() {
  showInput.value = false;
  replyTo.value = undefined;
  draftStore.cancelAddDraft();
  draftStore.removeDraft(draftId);
}

function toggleInput() {
  showInput.value = !showInput.value;
  replyTo.value = undefined;
}

function toggleReply(comment: Comment) {
  replyTo.value = replyTo.value?.id === comment.id ? undefined : comment;
  showInput.value = false;
}

function cancelInput() {
  showInput.value = false;
  replyTo.value = undefined;
}

const canReply = computed(() => {
  return whoami.value.hasNovelAccess && !props.locked;
});
</script>

<template>
  <div ref="anchor" />
  <section
    ref="paginationScope"
    tabindex="0"
    aria-label="评论列表"
    class="comment-list mt-5 border-t border-divider"
  >
    <header
      class="flex items-center justify-between gap-4 py-4"
      :class="{ 'border-b border-divider': !showInput }"
    >
      <h2 class="text-lg font-semibold text-ink">评论</h2>
      <XButton
        v-if="canReply"
        size="sm"
        aria-controls="comment-composer"
        :aria-expanded="showInput"
        @click="toggleInput()"
      >
        <CommentOutlined class="size-4" aria-hidden="true" />
        {{ showInput ? '取消评论' : '发表评论' }}
      </XButton>
    </header>

    <p v-if="locked" class="py-2 text-sm text-warning">
      评论区已锁定，不能再回复。
    </p>

    <CommentEditor
      v-if="showInput"
      id="comment-composer"
      :disabled="!canReply"
      class="border-b border-divider py-4"
      :site="site"
      :draft-id="draftId"
      placeholder="发表评论"
      @replied="onReplied()"
      @cancel="cancelInput()"
    />

    <XPagination
      v-if="pageCount > 1"
      v-model:page="page"
      :total-pages="pageCount"
      :ui="{ root: 'border-t-0 border-b' }"
    />

    <template v-if="commentPage">
      <div class="divide-y divide-divider">
        <CommentThread
          v-for="comment in commentPage.items"
          :key="comment.id"
          :site="site"
          :comment="comment"
          :can-reply="canReply"
          :reply-to-id="replyTo?.id"
          @reply="toggleReply"
          @cancel-reply="cancelInput"
        >
          <CommentEditor
            v-if="replyTo && (replyTo.rootId ?? replyTo.id) === comment.id"
            :key="replyTo.id"
            class="mt-3 pb-4"
            :site="site"
            :draft-id="draftId"
            :parent="comment.id"
            :reply-to="replyTo"
            :disabled="!canReply"
            :placeholder="`回复 @${replyTo.authorUsername}…`"
            @replied="onReplied()"
            @cancel="cancelInput()"
          />
        </CommentThread>
      </div>
      <div
        v-if="commentPage.items.length === 0 && !locked"
        class="grid min-h-52 place-items-center p-6 text-center"
      >
        <div>
          <div
            class="mx-auto grid size-11 place-items-center rounded-full bg-paper text-muted"
            aria-hidden="true"
          >
            <CommentOutlined class="size-5" />
          </div>
          <p class="mt-3 text-sm font-medium text-ink">暂无评论</p>
        </div>
      </div>
    </template>

    <XAsyncContent
      v-else
      :loading="!error"
      :error="error?.message ?? ''"
      error-title="加载错误"
    >
      <template #loading>
        <div role="status">
          <span class="sr-only">正在加载评论…</span>
          <div class="divide-y divide-divider" aria-hidden="true">
            <div v-for="index in 3" :key="index" class="py-4">
              <div class="h-5 w-28 skeleton bg-border" />
              <div class="mt-0.5 rounded-floating bg-embedded px-4 py-3">
                <div class="h-4 w-full skeleton" />
                <div class="mt-2 h-4 w-2/3 skeleton" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </XAsyncContent>

    <XPagination
      v-if="pageCount > 1"
      v-model:page="page"
      :total-pages="pageCount"
      :keyboard="paginationScope"
    />
  </section>
</template>

<style scoped>
.comment-list {
  --markdown-font-size: 0.875rem;
  --markdown-line-height: 1.6;
  --markdown-spoiler-background: var(--color-spoiler);
  --markdown-spoiler-color: var(--color-spoiler-ink);
}

.comment-list :deep(.comment-body) {
  background-color: var(--color-embedded);
}

.comment-list :deep(.n-pagination) {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-divider);
}
</style>
