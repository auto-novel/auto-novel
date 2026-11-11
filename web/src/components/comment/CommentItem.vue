<script lang="ts" setup>
import type { Comment } from '@novelia/web-kit';
import {
  Toast,
  XMarkdownHelpDialog,
  XTime,
  getApiErrorMessage,
} from '@novelia/web-kit';

import { useWhoamiStore } from '@/stores';
import { CommentRepo } from '@/repos';
import CommentActions from './CommentActions.vue';
import { getCommentPermissions } from './commentPermissions';

const props = withDefaults(
  defineProps<{
    site: string;
    comment: Comment;
    canReply: boolean;
    replying?: boolean;
  }>(),
  { replying: false },
);
const emit = defineEmits<{ reply: [Comment]; cancelReply: [] }>();
const { whoami } = storeToRefs(useWhoamiStore());
const editing = ref(false);
const content = ref('');
const submitting = ref(false);
const showModeratedContent = ref(false);
const canSave = computed(
  () =>
    content.value.trim().length > 0 &&
    content.value.length <= 1000 &&
    !submitting.value,
);
function canEdit() {
  return getCommentPermissions(
    props.comment,
    {
      userId: whoami.value.user?.id,
      asAdmin: whoami.value.asAdmin,
      canReply: props.canReply,
    },
    Date.now(),
  ).canEdit;
}
function startEditing() {
  if (!canEdit()) return;
  emit('cancelReply');
  content.value = props.comment.content;
  editing.value = true;
}
async function saveEdit() {
  if (!canSave.value) return;
  if (!canEdit()) {
    Toast.info('当前评论已无法编辑，请刷新后重试');
    return;
  }
  submitting.value = true;
  const viewer = whoami.value.user?.id;
  await Toast.promise(
    CommentRepo.updateComment(
      props.comment.id,
      props.site,
      content.value.trim(),
    ),
    {
      success: '评论修改已保存',
      error: (reason) => getApiErrorMessage(reason, '更新评论失败'),
    },
  )
    .then(() => {
      if (viewer === whoami.value.user?.id) editing.value = false;
    })
    .catch(() => {});
  submitting.value = false;
}
watch(
  () => [
    props.comment.id,
    props.comment.status,
    whoami.value.user?.id,
    whoami.value.asAdmin,
  ],
  () => {
    editing.value = false;
    showModeratedContent.value = false;
  },
);
</script>

<template>
  <article :id="`comment-${comment.id}`" class="min-w-0 py-4">
    <header class="flex items-center gap-2 text-xs text-muted">
      <span class="min-w-0 break-words text-sm font-bold text-ink">
        {{ comment.authorUsername }}
      </span>
      <XTime class="shrink-0" :time="comment.createdAt" preset="relative" />
      <CommentActions
        v-if="!editing"
        :site="site"
        :comment="comment"
        :can-reply="canReply"
        :replying="replying"
        @reply="emit('reply', comment)"
        @edit="startEditing"
      />
    </header>

    <div
      v-if="comment.status !== 0"
      class="comment-body mt-0.5 rounded-floating px-4 py-3"
    >
      <UButton
        v-if="whoami.asAdmin"
        color="neutral"
        variant="ghost"
        size="xs"
        class="min-h-0 p-0 text-sm font-normal leading-6 text-muted hover:bg-transparent hover:text-primary"
        :aria-expanded="showModeratedContent"
        :aria-controls="`comment-${comment.id}-moderated-content`"
        @click="showModeratedContent = !showModeratedContent"
      >
        {{ comment.status === 1 ? '该评论已隐藏' : '该评论已删除' }}
      </UButton>
      <p v-else class="text-sm leading-6 text-muted">
        {{ comment.status === 1 ? '该评论已隐藏' : '该评论已删除' }}
      </p>
      <div
        v-if="whoami.asAdmin"
        :id="`comment-${comment.id}-moderated-content`"
      >
        <MarkdownView
          v-if="showModeratedContent"
          class="mt-2"
          :source="comment.content"
        />
      </div>
    </div>
    <form v-else-if="editing" class="mt-2" @submit.prevent="saveEdit">
      <MarkdownEditor
        v-model:value="content"
        :rows="5"
        :maxlength="1000"
        :disabled="submitting"
        :ui="{ textarea: 'max-h-[19.5rem] overflow-y-auto' }"
      />
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <XMarkdownHelpDialog mode="comment" />
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="submitting"
            @click="editing = false"
          >
            取消
          </UButton>
          <UButton type="submit" size="xs" :disabled="!canSave">
            {{ submitting ? '保存中…' : '保存' }}
          </UButton>
        </div>
      </div>
    </form>
    <p
      v-else-if="comment.authorBlocked"
      class="comment-body mt-0.5 rounded-floating px-4 py-3 text-sm leading-6 text-muted"
    >
      [屏蔽]
    </p>
    <div v-else class="comment-body mt-0.5 rounded-floating px-4 py-3">
      <MarkdownView :source="comment.content" />
    </div>
    <slot />
  </article>
</template>
