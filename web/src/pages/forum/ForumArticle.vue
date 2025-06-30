<script lang="ts" setup>
import { useWhoamiStore } from '@/stores';

import { useArticleStore } from './ForumArticleStore';
import { doAction } from '@/pages//util';

const { articleId } = defineProps<{ articleId: string }>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const blockUserCommentRepository = Locator.blockUserCommentRepository();

const message = useMessage();

const store = useArticleStore(articleId);
const { articleResult } = storeToRefs(store);

store.loadArticle().then((result) => {
  if (result?.ok) {
    document.title = result.value.title;
  }
});

const blockUserComment = async (username: string) =>
  doAction(
    (async () => {
      blockUserCommentRepository.add(username);
    })(),
    '屏蔽用户',
    message,
  );

const unblockUserComment = async (username: string) =>
  doAction(
    (async () => {
      blockUserCommentRepository.remove(username);
    })(),
    '解除屏蔽用户',
    message,
  );
</script>

<template>
  <div class="layout-content">
    <c-result :result="articleResult" v-slot="{ value: article }">
      <n-h1 prefix="bar">{{ article.title }}</n-h1>
      <n-text v-if="article.hidden" depth="3">[隐藏]</n-text>
      <n-p>
        {{ article.updateAt === article.createAt ? '发布' : '更新' }}于
        <n-time :time="article.updateAt * 1000" type="relative" />
        by {{ article.user.username }}
        <template v-if="whoami.isMe(article.user.username) || whoami.asAdmin">
          /
          <c-a :to="`/forum-edit/${article.id}?category=${article.category}`">
            编辑
          </c-a>
        </template>
        <n-button
          type="primary"
          v-if="
            blockUserCommentRepository.ref.value.usernames.includes(
              article.user.username,
            )
          "
          text
          @click="unblockUserComment(article.user.username)"
        >
          解除屏蔽
        </n-button>
        <n-button
          v-else
          text
          type="primary"
          @click="blockUserComment(article.user.username)"
        >
          屏蔽
        </n-button>
      </n-p>
      <n-divider />

      <MarkdownView mode="article" :source="article.content" />

      <comment-list :site="`article-${articleId}`" :locked="article.locked" />
    </c-result>
  </div>
</template>
