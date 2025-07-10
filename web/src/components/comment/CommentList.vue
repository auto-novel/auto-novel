<script lang="ts" setup>
import { CommentOutlined } from '@vicons/material';

import { Locator } from '@/data';
import { CommentRepository } from '@/data/api';
import { Ok, Result, runCatching } from '@/util/result';
import { Comment1 } from '@/model/Comment';
import { Page } from '@/model/Page';
import SectionHeader from '@/components/SectionHeader.vue';

const props = defineProps<{
  site: string;
  locked: boolean;
}>();

const commentPage = ref<Result<Page<Comment1>>>();
const currentPage = ref(1);
const loading = ref(false);
const commentSectionRef = ref<InstanceType<typeof SectionHeader>>();

const draftRepo = Locator.draftRepository();
const draftId = `comment-${props.site}`;

async function loadComments(page: number) {
  loading.value = true;
  const result = await runCatching(
    CommentRepository.listComment({
      site: props.site,
      page: page - 1,
      pageSize: 10,
    }),
  );
  loading.value = false;
  if (result.ok) {
    commentPage.value = Ok({
      ...result.value,
      page,
      items: result.value.items.map((it) => ({ ...it, page: 1 })),
    });
  } else {
    commentPage.value = result;
  }
}

watch(currentPage, (page) => loadComments(page), { immediate: true });
watch(commentPage, (value, oldValue) => {
  if (oldValue && value) {
    const node = commentSectionRef.value?.$el as HTMLDivElement | null;
    if (!node) return;
    const prevTop = node.getBoundingClientRect().top;
    nextTick(() => {
      const currentTop = node.getBoundingClientRect().top;
      window.scrollBy(0, currentTop - prevTop);
    });
  }
});

function onReplied() {
  showInput.value = false;
  if (commentPage.value?.ok && currentPage.value === 1) {
    loadComments(currentPage.value);
  }
  draftRepo.addDraft.cancel();
  draftRepo.removeDraft(draftId);
}

const showInput = ref(false);
</script>

<template>
  <section-header title="评论" ref="commentSectionRef">
    <c-button
      v-if="!locked"
      label="发表评论"
      :icon="CommentOutlined"
      require-login
      @action="showInput = !showInput"
    />
  </section-header>

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

  <div v-if="loading" class="app-loading-box">
    <n-spin />
  </div>
  <c-result
    v-else
    :result="commentPage"
    :show-empty="(it: Page<Comment1>) => it.items.length === 0 && !locked"
    v-slot="{ value }"
  >
    <template v-for="comment in value.items" :key="comment.id">
      <CommentThread
        :site="site"
        :comment="comment"
        :locked="locked"
        @deleted="loadComments(currentPage)"
      />
      <n-divider />
    </template>

    <n-pagination
      v-if="value.pageNumber > 1"
      v-model:page="currentPage"
      :page-count="value.pageNumber"
      :page-slot="7"
      style="margin-top: 20px"
    />
  </c-result>
</template>
