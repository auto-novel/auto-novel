<script lang="ts" setup>
import { CommentRepo } from '@/repos';
import type { Comment1 } from '@/model/Comment';
import { useDraftStore } from '@/stores';

const props = defineProps<{
  site: string;
  comment: Comment1;
  canReply: boolean;
}>();

const draftStore = useDraftStore();
const draftId = `comment-${props.site}`;

const page = ref(1);
const { data: commentPage, error } = CommentRepo.useCommentList(
  page,
  () => props.site,
  () => props.comment.id,
  {
    items: props.comment.replies,
    pageNumber: Math.floor((props.comment.numReplies + 9) / 10),
  },
);

const anchorEl = useTemplateRef('anchor');
watch(page, () => {
  anchorEl.value?.scrollIntoView();
  window.scrollBy({ top: -50, behavior: 'auto' });
});

function onReplied() {
  showInput.value = false;
  draftStore.cancelAddDraft();
  draftStore.removeDraft(draftId);
}
const showInput = ref(false);
</script>

<template>
  <div ref="anchor" />
  <CommentItem
    :site="site"
    :comment="comment"
    :can-reply="canReply"
    @reply="showInput = !showInput"
  />

  <CommentEditor
    v-if="showInput"
    :site="site"
    :draft-id="draftId"
    :parent="comment.id"
    :placeholder="`回复${comment.user.username}`"
    style="padding-top: 8px"
    @replied="onReplied()"
    @cancel="showInput = false"
  />

  <div style="margin-left: 32px; margin-top: 20px">
    <CPage
      v-model:page="page"
      :page-number="commentPage?.pageNumber"
      disable-top
    >
      <template v-if="commentPage">
        <div
          v-for="replyComment in commentPage?.items"
          :key="replyComment.id"
          style="margin-top: 20px; margin-bottom: 20px"
        >
          <CommentItem
            :site="site"
            :parent-id="comment.id"
            :comment="replyComment"
            :can-reply="canReply"
          />
        </div>
      </template>
      <CResultX v-else :error="error" title="加载错误" />
    </CPage>
  </div>
</template>
