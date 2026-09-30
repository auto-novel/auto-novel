<script lang="ts" setup>
import { CommentRepo } from '@/repos';
import { doAction } from '@/pages/util';

const props = defineProps<{
  site: string;
  draftId: string;
  parent?: number;
  placeholder?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  replied: [];
}>();

const message = useMessage();

const content = ref('');

const reply = async () => {
  if (content.value.length === 0) {
    message.info('回复内容不能为空');
    return;
  }

  await doAction(
    CommentRepo.createComment(props.site, {
      content: content.value,
      ...(props.parent === undefined ? {} : { rootId: props.parent }),
    }).then(() => {
      content.value = '';
      emit('replied');
    }),
    '回复发布',
    message,
  );
};
</script>

<template>
  <div>
    <MarkdownEditor
      mode="comment"
      :draft-id="draftId"
      v-model:value="content"
      :placeholder="placeholder"
      :autosize="{ minRows: 4, maxRows: 12 }"
      maxlength="1000"
    />
    <n-flex style="margin-top: 10px">
      <c-button
        label="发布"
        require-login
        :round="false"
        type="primary"
        @action="reply()"
      />
      <c-button label="取消" :round="false" @action="emit('cancel')" />
    </n-flex>
  </div>
</template>
