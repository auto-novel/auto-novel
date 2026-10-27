<script lang="ts" setup>
import { XButton, XError, XSkeleton } from '@novelia/web-kit';

import type { Comment } from '@novelia/web-kit';
import { CommentRepo } from '@/repos';

const props = defineProps<{
  site: string;
  comment: Comment;
  canReply: boolean;
  replyToId?: number;
}>();

const emit = defineEmits<{
  reply: [Comment];
  cancelReply: [];
}>();

const page = ref(1);
const {
  data: replyPage,
  error,
  refetch,
} = CommentRepo.useReplyList(
  page,
  () => props.site,
  () => props.comment.id,
  () => props.comment.replyCount > 0,
);
const pageCount = computed(() =>
  Math.ceil(
    (replyPage.value?.total ?? props.comment.replyCount) /
      CommentRepo.replyPageSize,
  ),
);
</script>

<template>
  <section class="min-w-0">
    <CommentItem
      :site="site"
      :comment="comment"
      :can-reply="canReply"
      :replying="replyToId === comment.id"
      @reply="emit('reply', $event)"
      @cancel-reply="emit('cancelReply')"
    >
      <slot v-if="replyToId === comment.id" />
    </CommentItem>

    <div v-if="comment.replyCount > 0">
      <div v-if="!replyPage && !error" class="py-4 pl-8" role="status">
        <span class="sr-only">正在加载回复…</span>
        <div class="space-y-8" aria-hidden="true">
          <div v-for="index in Math.min(comment.replyCount, 3)" :key="index">
            <XSkeleton class="h-5 w-28 bg-border" />
            <div class="mt-0.5 rounded-floating bg-embedded px-4 py-3">
              <XSkeleton class="h-4 w-full" />
              <XSkeleton class="mt-2 h-4 w-2/3" />
            </div>
          </div>
        </div>
      </div>
      <XError
        v-else-if="!replyPage && error"
        class="py-4 pl-8"
        title="回复加载错误"
        :description="error.message"
      >
        <XButton @click="refetch()">再试一次</XButton>
      </XError>
      <template v-else-if="replyPage">
        <CommentItem
          v-for="reply in replyPage.items"
          :key="reply.id"
          class="ml-8"
          :site="site"
          :comment="reply"
          :can-reply="canReply"
          :replying="replyToId === reply.id"
          @reply="emit('reply', $event)"
          @cancel-reply="emit('cancelReply')"
        >
          <slot v-if="replyToId === reply.id" />
        </CommentItem>
        <n-pagination
          v-if="pageCount > 1"
          v-model:page="page"
          :page-count="pageCount"
          :page-slot="7"
        />
      </template>
    </div>
  </section>
</template>
