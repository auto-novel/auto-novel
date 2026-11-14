<script lang="ts" setup>
import type { Comment } from '@novelia/web-kit';
import {
  CommentRulesNotice,
  XMarkdownHelpDialog,
  getApiErrorMessage,
  Toast,
  useMarkdownDraft,
} from '@novelia/web-kit';

import { forumUrl } from '@/config';
import { CommentRepo } from '@/repos';
import { useWhoamiStore } from '@/stores';

const props = defineProps<{
  site: string;
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
const {
  text: content,
  restored,
  clear: clearDraft,
  prepareSubmission,
} = useMarkdownDraft({
  key: () => {
    const userId = whoami.value.user?.id;
    if (userId === undefined) return undefined;
    return JSON.stringify([
      'auto-novel',
      'comment',
      userId,
      props.site,
      props.replyTo?.id ?? props.parent ?? null,
    ]);
  },
  initialValue: () =>
    props.replyTo?.rootId != null &&
    props.replyTo.authorId !== whoami.value.user?.id
      ? `@${props.replyTo.authorUsername} `
      : '',
  maxAge: 3 * 24 * 60 * 60 * 1000,
});
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
  const finishSubmission = prepareSubmission();
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
      const cleared = finishSubmission();
      if (viewer !== whoami.value.user?.id || !cleared) return;
      emit('replied');
    })
    .catch(() => {});
  submitting.value = false;
};
</script>

<template>
  <div>
    <CommentRulesNotice :href="`${forumUrl}/rules`" class="mb-3" />
    <div
      v-if="restored"
      class="mb-2 flex items-center gap-2 text-xs text-muted"
    >
      <span>已恢复草稿</span>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="submitting || disabled"
        @click="clearDraft()"
      >
        丢弃草稿
      </UButton>
    </div>
    <MarkdownEditor
      :disabled="submitting || disabled"
      v-model:value="content"
      :placeholder="placeholder"
      :rows="4"
      :maxlength="1000"
      :ui="{ textarea: 'max-h-[19.5rem] overflow-y-auto' }"
    />
    <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
      <XMarkdownHelpDialog mode="comment" />
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="submitting"
          @click="emit('cancel')"
        >
          取消
        </UButton>
        <UButton :disabled="!canSubmit" @click="reply()">
          {{ submitting ? '发表中…' : '发表' }}
        </UButton>
      </div>
    </div>
  </div>
</template>
