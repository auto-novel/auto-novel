<script lang="ts" setup>
import type { Comment } from '@novelia/web-kit';
import {
  CommentRulesNotice,
  XButton,
  XMarkdownHelpDialog,
  getApiErrorMessage,
  Toast,
} from '@novelia/web-kit';

import { forumUrl } from '@/config';
import { CommentRepo } from '@/repos';
import { useWhoamiStore } from '@/stores';

const props = defineProps<{
  site: string;
  draftId: string;
  parent?: number;
  placeholder?: string;
  replyTo?: Comment;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  replied: [];
}>();

const { whoami } = storeToRefs(useWhoamiStore());
const content = ref(
  props.replyTo?.rootId != null &&
    props.replyTo.authorId !== whoami.value.user?.id
    ? `@${props.replyTo.authorUsername} `
    : '',
);
const submitting = ref(false);
const canSubmit = computed(
  () =>
    !props.disabled &&
    !submitting.value &&
    content.value.trim().length > 0 &&
    content.value.length <= 1000 &&
    whoami.value.hasNovelAccess,
);

const reply = async () => {
  if (!canSubmit.value) return;
  submitting.value = true;
  const viewer = whoami.value.user?.id;
  await Toast.promise(
    CommentRepo.createComment(props.site, {
      content: content.value.trim(),
      ...(props.parent === undefined ? {} : { rootId: props.parent }),
    }),
    {
      success: '回复发布成功',
      error: (reason) => getApiErrorMessage(reason, '回复发布失败'),
    },
  )
    .then(() => {
      if (viewer !== whoami.value.user?.id) return;
      content.value = '';
      emit('replied');
    })
    .catch(() => {});
  submitting.value = false;
};
</script>

<template>
  <div>
    <CommentRulesNotice :href="`${forumUrl}/rules`" class="mb-3" />
    <MarkdownEditor
      :disabled="submitting || disabled"
      :draft-id="draftId"
      v-model:value="content"
      :placeholder="placeholder"
      :rows="4"
      :maxlength="1000"
      :ui="{ textarea: 'max-h-[19.5rem] overflow-y-auto' }"
    />
    <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
      <XMarkdownHelpDialog mode="comment" />
      <div class="flex items-center gap-2">
        <XButton
          color="neutral"
          variant="outline"
          :disabled="submitting"
          @click="emit('cancel')"
        >
          取消
        </XButton>
        <XButton :disabled="!canSubmit" @click="reply()">
          {{ submitting ? '发表中…' : '发表' }}
        </XButton>
      </div>
    </div>
  </div>
</template>
