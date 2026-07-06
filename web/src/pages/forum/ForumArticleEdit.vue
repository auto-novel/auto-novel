<script lang="ts" setup>
import { UploadOutlined } from '@vicons/material';
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';

import { ArticleRepo } from '@/repos';
import type { ArticleCategory } from '@/model/Article';
import { doAction, useIsWideScreen } from '@/pages/util';
import { useDraftStore, useWhoamiStore } from '@/stores';
import MarkdownEditorStickyTab from '@/components/markdown/MarkdownEditorStickyTab.vue';

const props = withDefaults(
  defineProps<{
    articleId?: string;
    category?: ArticleCategory;
  }>(),
  {
    articleId: undefined,
    category: undefined,
  },
);

const router = useRouter();
const isWideScreen = useIsWideScreen();
const message = useMessage();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const activeTab = ref(0);
const elEditor = useTemplateRef('editor');

const draftStore = useDraftStore();
const draftId = computed(() => `article-${props.articleId ?? 'new'}`);

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

const allowSubmit = ref(props.articleId === undefined);
const formRef = useTemplateRef<FormInst>('form');
const formValue = ref({
  title: '',
  content: '',
  category: props.category ?? 'General',
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
      message: '未选择要发表的版塊',
      trigger: 'input',
    },
  ],
};

if (props.articleId !== undefined) {
  ArticleRepo.useArticle(props.articleId, true)
    .refresh()
    .then(({ data, error }) => {
      if (data) {
        formValue.value = {
          title: data.title,
          content: data.content,
          category: data.category,
        };
        allowSubmit.value = true;
      } else {
        message.error(`载入失败: ${error?.message}`);
      }
    });
}

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

  if (props.articleId === undefined) {
    await doAction(
      ArticleRepo.createArticle(formValue.value).then((id) => {
        draftStore.removeDraft(draftId.value);
        router.push({ path: `/forum/${id}` });
      }),
      '发布',
      message,
    );
  } else {
    await doAction(
      ArticleRepo.updateArticle(props.articleId, formValue.value).then(() => {
        draftStore.removeDraft(draftId.value);
        router.push({ path: `/forum/${props.articleId}` });
      }),
      '更新',
      message,
    );
  }
};
</script>

<template>
  <div class="layout-content">
    <n-h1>{{ props.articleId === undefined ? '发布' : '编辑' }}文章</n-h1>
    <n-form
      ref="form"
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
          ref="editor"
          mode="article"
          :draft-id="draftId"
          v-model:value="formValue.content"
          v-model:active-tab="activeTab"
          placeholder="请输入正文"
          :autosize="{ minRows: 8 }"
          maxlength="20000"
          style="width: 100%"
        />
      </n-form-item-row>
    </n-form>

    <MarkdownEditorStickyTab
      v-model:active-tab="activeTab"
      :el-editor="elEditor ?? undefined"
    >
      <template #right-actions>
        <c-button
          label="提交"
          :icon="UploadOutlined"
          require-login
          size="large"
          type="primary"
          @action="submit"
        />
      </template>
    </MarkdownEditorStickyTab>
  </div>
</template>

<style scoped>
.layout-content {
  padding-bottom: 60px;
}

@media only screen and (max-width: 540px) {
  .layout-content {
    padding-bottom: 120px;
  }
}
</style>
