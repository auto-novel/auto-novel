<script setup lang="ts">
import { MoreVertOutlined } from '@vicons/material';
import type { Comment } from '@novelia/web-kit';
import {
  copyToClipboard,
  UserBlacklistDialog,
  UserModerationDialog,
  XButton,
  XConfirmDialog,
  XDropdownMenu,
  XDropdownMenuItem,
  XDropdownMenuSeparator,
  getApiErrorMessage,
  Toast,
} from '@novelia/web-kit';

import { CommentRepo } from '@/repos';
import { useWhoamiStore } from '@/stores';
import {
  COMMENT_EDIT_WINDOW,
  getCommentPermissions,
} from './commentPermissions';

const props = defineProps<{
  site: string;
  comment: Comment;
  canReply: boolean;
  replying: boolean;
}>();
const emit = defineEmits<{ reply: []; edit: [] }>();
const { whoami } = storeToRefs(useWhoamiStore());
const now = ref(Date.now());
const permissions = computed(() =>
  getCommentPermissions(
    props.comment,
    {
      userId: whoami.value.user?.id,
      asAdmin: whoami.value.asAdmin,
      canReply: props.canReply,
    },
    now.value,
  ),
);
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => props.comment.createdAt,
  (createdAt) => {
    clearTimeout(expiryTimer);
    now.value = Date.now();
    const delay =
      new Date(createdAt).getTime() + COMMENT_EDIT_WINDOW - now.value + 1;
    if (Number.isFinite(delay) && delay > 0 && delay <= 2_147_483_647) {
      expiryTimer = setTimeout(() => {
        now.value = Date.now();
      }, delay);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(expiryTimer));

const submitting = ref(false);
const copying = ref(false);
const confirmationAction = ref<'delete' | 'hide'>();
const blacklistOpen = ref(false);
const userModerationAction = ref<'strike' | 'ban'>();
const confirmation = computed(() =>
  confirmationAction.value === 'delete'
    ? { title: '删除评论', description: '确定删除这条评论吗？' }
    : { title: '隐藏评论', description: '确定隐藏这条评论吗？' },
);
const evidence = computed(() => {
  const url = new URL(window.location.href);
  url.hash = `comment-${props.comment.id}`;
  return [
    `小说评论 #${props.comment.id}（资源 ${props.site}）`,
    url.toString(),
    '',
    '评论原文：',
    props.comment.content,
  ].join('\n');
});
// 弹窗按评论重新挂载，回调在本次提交期间始终指向同一条评论。
const deleteModeratedComment = () =>
  CommentRepo.deleteComment(props.comment.id, props.site, true);
watch(
  () => [
    props.comment.id,
    props.comment.status,
    whoami.value.user?.id,
    whoami.value.asAdmin,
  ],
  () => {
    confirmationAction.value = undefined;
    blacklistOpen.value = false;
    userModerationAction.value = undefined;
  },
);

async function copyComment() {
  if (copying.value) return;
  copying.value = true;
  await Toast.promise(copyToClipboard(props.comment.content), {
    success: '评论原文已复制',
    error: (reason) =>
      getApiErrorMessage(reason, '复制失败，请手动选择评论内容复制'),
  }).catch(() => {});
  copying.value = false;
}
async function confirmAction() {
  if (submitting.value) return;
  now.value = Date.now();
  const action = confirmationAction.value;
  const allowed =
    action === 'delete'
      ? permissions.value.canDelete
      : action === 'hide' && whoami.value.asAdmin && props.comment.status === 0;
  if (!allowed) {
    confirmationAction.value = undefined;
    return;
  }
  submitting.value = true;
  await Toast.promise(
    action === 'delete'
      ? CommentRepo.deleteComment(
          props.comment.id,
          props.site,
          whoami.value.asAdmin,
        )
      : CommentRepo.hideComment(props.comment.id),
    {
      success: action === 'delete' ? '评论已删除' : '评论已隐藏',
      error: (reason) =>
        getApiErrorMessage(
          reason,
          action === 'delete' ? '删除评论失败' : '隐藏评论失败',
        ),
    },
  )
    .then(() => {
      confirmationAction.value = undefined;
    })
    .catch(() => {});
  submitting.value = false;
}
async function unhideComment() {
  if (submitting.value || !whoami.value.asAdmin || props.comment.status !== 1)
    return;
  submitting.value = true;
  await Toast.promise(CommentRepo.unhideComment(props.comment.id), {
    success: '评论已取消隐藏',
    error: (reason) => getApiErrorMessage(reason, '取消隐藏失败'),
  }).catch(() => {});
  submitting.value = false;
}
</script>

<template>
  <div
    v-if="permissions.showActions"
    class="ml-auto flex shrink-0 items-center gap-1"
  >
    <XButton
      v-if="permissions.canReply"
      color="neutral"
      variant="ghost"
      size="xs"
      :disabled="submitting"
      :aria-expanded="replying"
      @click="emit('reply')"
    >
      回复
    </XButton>
    <XButton
      v-if="permissions.canEdit"
      color="neutral"
      variant="ghost"
      size="xs"
      :disabled="submitting"
      @click="emit('edit')"
    >
      编辑
    </XButton>
    <XDropdownMenu align="end" class="min-w-32 w-32">
      <template #trigger>
        <XButton
          color="neutral"
          variant="ghost"
          size="icon-xs"
          aria-label="更多操作"
          title="更多操作"
        >
          <MoreVertOutlined class="size-4" aria-hidden="true" />
        </XButton>
      </template>
      <XDropdownMenuItem :disabled="copying" @select="copyComment">
        复制原文
      </XDropdownMenuItem>
      <XDropdownMenuSeparator v-if="whoami.asAdmin || permissions.canDelete" />
      <XDropdownMenuItem
        v-if="whoami.asAdmin && comment.status === 0"
        :disabled="submitting"
        @select="confirmationAction = 'hide'"
      >
        隐藏评论
      </XDropdownMenuItem>
      <XDropdownMenuItem
        v-if="whoami.asAdmin && comment.status === 1"
        :disabled="submitting"
        @select="unhideComment"
      >
        取消隐藏
      </XDropdownMenuItem>
      <XDropdownMenuItem
        v-if="permissions.canDelete"
        destructive
        :disabled="submitting"
        @select="confirmationAction = 'delete'"
      >
        删除评论
      </XDropdownMenuItem>
      <XDropdownMenuSeparator
        v-if="permissions.canBlockAuthor || permissions.canModerateAuthor"
      />
      <XDropdownMenuItem
        v-if="permissions.canBlockAuthor"
        :destructive="!comment.authorBlocked"
        :disabled="submitting"
        @select="blacklistOpen = true"
      >
        {{ comment.authorBlocked ? '取消屏蔽' : '屏蔽用户' }}
      </XDropdownMenuItem>
      <template v-if="permissions.canModerateAuthor">
        <XDropdownMenuItem
          destructive
          :disabled="submitting"
          @select="userModerationAction = 'strike'"
        >
          处罚用户
        </XDropdownMenuItem>
        <XDropdownMenuItem
          destructive
          :disabled="submitting"
          @select="userModerationAction = 'ban'"
        >
          封禁用户
        </XDropdownMenuItem>
      </template>
    </XDropdownMenu>
  </div>
  <XConfirmDialog
    :open="confirmationAction != null"
    :title="confirmation.title"
    :description="confirmation.description"
    :confirm-label="confirmation.title"
    :loading="submitting"
    danger
    @update:open="
      (open) => {
        if (!open && !submitting) confirmationAction = undefined;
      }
    "
    @confirm="confirmAction"
  />
  <UserBlacklistDialog
    v-if="blacklistOpen && permissions.canBlockAuthor"
    :key="comment.authorId"
    :user-id="comment.authorId"
    :username="comment.authorUsername"
    :author-blocked="comment.authorBlocked"
    :set-user-blocked="CommentRepo.setUserBlocked"
    @close="blacklistOpen = false"
  />
  <UserModerationDialog
    v-if="userModerationAction && permissions.canModerateAuthor"
    :key="`${comment.id}:${comment.authorId}:${userModerationAction}`"
    :open="true"
    :action="userModerationAction"
    :user-id="comment.authorId"
    :username="comment.authorUsername"
    :evidence="evidence"
    :delete-comment="deleteModeratedComment"
    @update:open="
      (open) => {
        if (!open) userModerationAction = undefined;
      }
    "
  />
</template>
