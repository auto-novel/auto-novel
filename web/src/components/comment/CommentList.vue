<script lang="ts" setup>
import { CommentOutlined } from '@vicons/material';

import { CommentRepo } from '@/repos';
import { useDraftStore, useWhoamiStore } from '@/stores';

const props = defineProps<{
  site: string;
  locked: boolean;
}>();

const page = ref(1);
const { data: commentPage, error } = CommentRepo.useCommentList(
  page,
  () => props.site,
);

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const draftStore = useDraftStore();
const draftId = `comment-${props.site}`;

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

const canReply = computed(() => {
  const hasAccess = props.site.startsWith('article-')
    ? whoami.value.hasForumAccess
    : whoami.value.hasNovelAccess;
  return hasAccess && !props.locked;
});
</script>

<template>
  <div ref="anchor" />
  <SectionHeader
    title="评论"
    ref="commentSectionRef"
    style="margin-bottom: 32px"
  >
    <c-button
      v-if="canReply"
      label="发表评论"
      :icon="CommentOutlined"
      require-login
      @action="showInput = !showInput"
    />
  </SectionHeader>

  <n-p v-if="locked">评论区已锁定，不能再回复。</n-p>

  <template v-if="showInput">
    <CommentEditor
      :site="site"
      :draft-id="draftId"
      :placeholder="`发表回复`"
      @replied="onReplied()"
      @cancel="showInput = false"
    />
    <n-divider />
  </template>

  <CPage v-model:page="page" :page-number="commentPage?.pageNumber" disable-top>
    <template v-if="commentPage">
      <template v-for="comment in commentPage.items" :key="comment.id">
        <CommentThread :site="site" :comment="comment" :can-reply="canReply" />
        <n-divider />
      </template>
      <n-empty
        v-if="commentPage.items.length === 0 && !locked"
        description="暂无评论"
      />
    </template>

    <CResultX v-else :error="error" title="加载错误" />
  </CPage>
</template>
