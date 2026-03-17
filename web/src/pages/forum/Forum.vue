<script lang="ts" setup>
import { LockOutlined, PlusOutlined, PushPinOutlined } from '@vicons/material';

import { ArticleRepo } from '@/repos';
import type { ArticleCategory, ArticleSimplified } from '@/model/Article';
import { doAction } from '@/pages/util';
import { useBlacklistStore, useWhoamiStore } from '@/stores';

const props = defineProps<{
  page: number;
  category: ArticleCategory;
}>();

const route = useRoute();
const router = useRouter();
const message = useMessage();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const blacklistStore = useBlacklistStore();

const articleCategoryOptions = [
  { value: 'General', label: '小说交流' },
  { value: 'Guide', label: '使用指南' },
  { value: 'Support', label: '反馈与建议' },
];

const onUpdatePage = (page: number) => {
  const query = { ...route.query, page };
  router.push({ path: route.path, query });
};

const onUpdateCategory = (category: ArticleCategory) => {
  const query = { ...route.query, category, page: 1 };
  router.push({ path: route.path, query });
};

const { data: articlePage, error } = ArticleRepo.useArticleList(
  () => props.page,
  () => props.category,
);

const lockArticle = (article: ArticleSimplified) =>
  doAction(
    ArticleRepo.lockArticle(article.id).then(() => (article.locked = true)),
    '锁定',
    message,
  );

const unlockArticle = (article: ArticleSimplified) =>
  doAction(
    ArticleRepo.unlockArticle(article.id).then(() => (article.locked = false)),
    '解除锁定',
    message,
  );

const pinArticle = (article: ArticleSimplified) =>
  doAction(
    ArticleRepo.pinArticle(article.id).then(() => (article.pinned = true)),
    '置顶',
    message,
  );

const unpinArticle = (article: ArticleSimplified) =>
  doAction(
    ArticleRepo.unpinArticle(article.id).then(() => (article.pinned = false)),
    '解除置顶',
    message,
  );

const hideArticle = (article: ArticleSimplified) =>
  doAction(
    ArticleRepo.hideArticle(article.id).then(() => (article.hidden = true)),
    '隐藏',
    message,
  );

const unhideArticle = (article: ArticleSimplified) =>
  doAction(
    ArticleRepo.unhideArticle(article.id).then(() => (article.hidden = false)),
    '解除隐藏',
    message,
  );

const deleteArticle = (article: ArticleSimplified) =>
  doAction(ArticleRepo.deleteArticle(article.id), '删除', message);
</script>

<template>
  <div class="layout-content">
    <n-h1>论坛</n-h1>

    <router-link v-if="whoami.hasForumAccess" to="/forum-edit">
      <c-button
        label="发布文章"
        :icon="PlusOutlined"
        style="margin-bottom: 16px"
      />
    </router-link>

    <c-action-wrapper title="版块" style="margin-bottom: 20px">
      <c-radio-group
        :value="category"
        @update-value="onUpdateCategory"
        :options="articleCategoryOptions"
      />
    </c-action-wrapper>

    <CPage
      :page="page"
      :page-number="articlePage?.pageNumber"
      @update:page="onUpdatePage"
    >
      <n-table
        v-if="articlePage"
        :bordered="false"
        style="margin-top: 24px; margin-bottom: 24px"
      >
        <thead>
          <tr>
            <th><b>标题</b></th>
            <th class="article-number"><b>查看/回复</b></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="article of articlePage.items" :key="article.id">
            <td>
              <n-flex :size="2" align="center" :wrap="false">
                <n-icon
                  v-if="article.pinned"
                  size="15"
                  :component="PushPinOutlined"
                />
                <n-icon
                  v-if="article.locked"
                  size="15"
                  :component="LockOutlined"
                />
                <c-a :to="`/forum/${article.id}`">
                  <n-text v-if="article.hidden" depth="3">[隐藏]</n-text>
                  <n-text
                    v-else-if="blacklistStore.isBlocked(article.user.username)"
                    depth="3"
                  >
                    [屏蔽]
                  </n-text>
                  <b v-else>{{ article.title }}</b>
                </c-a>
              </n-flex>
              <n-text style="font-size: 12px">
                {{ article.updateAt === article.createAt ? '发布' : '更新' }}于
                <n-time :time="article.updateAt * 1000" type="relative" />
                by {{ article.user.username }}
              </n-text>

              <n-flex v-if="whoami.asAdmin" style="margin-top: 4px">
                <c-button
                  v-if="article.locked"
                  size="tiny"
                  secondary
                  label="解除锁定"
                  @action="unlockArticle(article)"
                />
                <c-button
                  v-else
                  label="锁定"
                  size="tiny"
                  secondary
                  @action="lockArticle(article)"
                />

                <c-button
                  v-if="article.pinned"
                  label="解除置顶"
                  size="tiny"
                  secondary
                  @action="unpinArticle(article)"
                />
                <c-button
                  v-else
                  label="置顶"
                  size="tiny"
                  secondary
                  @action="pinArticle(article)"
                />

                <c-button
                  v-if="article.hidden"
                  label="解除隐藏"
                  secondary
                  size="tiny"
                  @action="unhideArticle(article)"
                />
                <c-button
                  v-else
                  label="隐藏"
                  secondary
                  size="tiny"
                  @action="hideArticle(article)"
                />

                <c-button
                  size="tiny"
                  secondary
                  label="删除"
                  type="error"
                  @action="deleteArticle(article)"
                />
              </n-flex>
            </td>
            <td class="article-number">
              {{ article.numViews }}/{{ article.numComments }}
            </td>
          </tr>
        </tbody>
      </n-table>

      <CResultX v-else :error="error" title="加载错误" />
    </CPage>
  </div>
</template>

<style scoped>
.article-number {
  width: 50px;
  text-align: center;
}
</style>
