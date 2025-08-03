<script lang="ts" setup>
import { UploadOutlined } from '@vicons/material';
import { FormInst, FormItemRule, FormRules } from 'naive-ui';

import { Locator } from '@/data';
import { ArticleCategory } from '@/model/Article';

import { doAction, useIsWideScreen } from '@/pages/util';
import { useArticleStore } from './ForumArticleStore';

const { articleId, category } = defineProps<{
  articleId: string | undefined;
  category: ArticleCategory | undefined;
}>();

const router = useRouter();
const isWideScreen = useIsWideScreen();
const message = useMessage();

const { whoami } = Locator.authRepository();
const draftRepo = Locator.draftRepository();
const draftId = `article-${articleId ?? 'new'}`;

const store = articleId !== undefined ? useArticleStore(articleId) : undefined;

const articleCategoryOptions = whoami.value.asAdmin
  ? [
      { value: 'General', label: '小说交流' },
      { value: 'Guide', label: '使用指南' },
      { value: 'Support', label: '反馈与建议' },
    ]
  : [
      { value: 'General', label: '小说交流' },
      { value: 'Support', label: '反馈与建议' },
    ];

const allowSubmit = ref(articleId === undefined);
const formRef = ref<FormInst>();
const formValue = ref({
  title: '',
  content: '',
  category: category ?? 'General',
});
const formRules: FormRules = {
  title: [
    {
      validator: (_rule: FormItemRule, value: string) =>
        value.trim().length >= 2,
      message: '标题长度不能少于2个字符',
      trigger: 'input',
    },
    {
      validator: (_rule: FormItemRule, value: string) => value.length <= 80,
      message: '标题长度不能超过80个字符',
      trigger: 'input',
    },
  ],
  content: [
    {
      validator: (_rule: FormItemRule, value: string) =>
        value.trim().length >= 2,
      message: '正文长度不能少于2个字符',
      trigger: 'input',
    },
    {
      validator: (_rule: FormItemRule, value: string) => value.length <= 20_000,
      message: '正文长度不能超过2万个字符',
      trigger: 'input',
    },
  ],
  category: [
    {
      validator: (_rule: FormItemRule, value: string | undefined) =>
        value !== undefined,
      message: '未选择要发表的版块',
      trigger: 'input',
    },
  ],
};

store?.loadArticle()?.then((result) => {
  if (result.ok) {
    const { title, content, category } = result.value;
    formValue.value = {
      title,
      content,
      category,
    };
    allowSubmit.value = true;
  } else {
    message.error('载入失败');
  }
});

const submit = async () => {
  if (!allowSubmit.value) {
    message.warning('文章未载入，无法提交');
    return;
  }

  try {
    await formRef.value?.validate();
  } catch (e) {
    return;
  }

  if (store === undefined) {
    await doAction(
      Locator.articleRepository.createArticle(formValue.value).then((id) => {
        draftRepo.removeDraft(draftId);
        router.push({ path: `/forum/${id}` });
      }),
      '发布',
      message,
    );
  } else {
    await doAction(
      store.updateArticle(formValue.value).then(() => {
        draftRepo.removeDraft(draftId);
        router.push({ path: `/forum/${articleId}` });
      }),
      '更新',
      message,
    );
  }
};
</script>

<template>
  <div class="layout-content">
    <n-h1>{{ articleId === undefined ? '发布' : '编辑' }}文章</n-h1>
    <n-form
      ref="formRef"
      :model="formValue"
      :rules="formRules"
      :label-placement="isWideScreen ? 'left' : 'top'"
      label-width="auto"
    >
      <n-form-item-row path="title" label="标题">
        <n-input
          v-model:value="formValue.title"
          placeholder="请输入标题"
          maxlength="80"
          show-count
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>
      <n-form-item-row path="category" label="版块">
        <c-radio-group
          v-model:value="formValue.category"
          :options="articleCategoryOptions"
        />
      </n-form-item-row>
      <n-form-item-row path="content" label="正文">
        <MarkdownEditor
          mode="article"
          :draft-id="draftId"
          v-model:value="formValue.content"
          placeholder="请输入正文"
          :autosize="{ minRows: 8 }"
          maxlength="20000"
          style="width: 100%"
        />
      </n-form-item-row>
    </n-form>

    <c-button
      label="提交"
      :icon="UploadOutlined"
      require-login
      size="large"
      type="primary"
      class="float"
      @action="submit"
    />
  </div>
</template>
