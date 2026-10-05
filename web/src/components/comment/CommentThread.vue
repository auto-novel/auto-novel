<script lang="ts" setup>
import type { Comment1 } from '@/model/Comment';
import { CommentRepo } from '@/repos';

const props = defineProps<{
  site: string;
  comment: Comment1;
  canReply: boolean;
}>();

const emit = defineEmits<{
  reply: [Comment1];
}>();

const page = ref(1);
const { data: replyPage, error } = CommentRepo.useReplyList(
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
  <CommentItem
    :site="site"
    :comment="comment"
    :can-reply="canReply"
    @reply="emit('reply', $event)"
  />

  <div v-if="comment.replyCount > 0">
    <template v-if="replyPage">
      <div
        v-for="reply in replyPage.items"
        :key="reply.id"
        style="margin-top: 12px; margin-left: 32px"
      >
        <CommentItem
          :site="site"
          :comment="reply"
          :can-reply="canReply"
          @reply="emit('reply', $event)"
        />
      </div>
      <n-pagination
        v-if="pageCount > 1"
        v-model:page="page"
        :page-count="pageCount"
        :page-slot="7"
        style="margin-top: 12px; margin-left: 32px"
      />
    </template>
    <CResultX v-else :error="error" title="回复加载错误" />
  </div>
</template>
