<script lang="ts" setup>
import { useRequireLogin } from '@/util/useRequireLogin';
import { Toast, getApiErrorMessage, XPage } from '@novelia/web-kit';
import { UploadOutlined } from '@vicons/material';

import { WebNovelRepo } from '@/repos';
import { useIsWideScreen } from '@/pages/util';

const { providerId, novelId } = defineProps<{
  providerId: string;
  novelId: string;
}>();

const router = useRouter();
const isWideScreen = useIsWideScreen();
const formFieldProps = computed(() => ({
  orientation: isWideScreen.value
    ? ('horizontal' as const)
    : ('vertical' as const),
  ui: {
    wrapper: isWideScreen.value ? 'w-20 shrink-0 pt-1.5' : undefined,
    container: 'min-w-0 flex-1',
  },
}));
const allowSubmit = ref(false);
const formValue = ref({
  titleJp: '',
  title: '',
  introductionJp: '',
  introduction: '',
  wenkuId: '',
  toc: <{ key: string; jp: string; zh: string }[]>[],
});

WebNovelRepo.useWebNovel(providerId, novelId, false)
  .refresh()
  .then(({ data, error }) => {
    if (data) {
      const tocSet = new Set();
      formValue.value = {
        titleJp: data.titleJp,
        title: data.titleZh ?? '',
        introductionJp: data.introductionJp,
        introduction: data.introductionZh ?? '',
        wenkuId: data.wenkuId ?? '',
        toc: data.toc
          .map((item) => ({
            key: item.chapterId ?? item.titleJp,
            jp: item.titleJp,
            zh: item.titleZh ?? '',
          }))
          .filter((item) => {
            const inSet = tocSet.has(item.key);
            if (!inSet) tocSet.add(item.key);
            return !inSet;
          }),
      };
      allowSubmit.value = true;
    } else {
      Toast.error(`载入失败: ${error?.message}`);
    }
  });

const submit = async () => {
  if (!allowSubmit.value) {
    Toast.warning('小说未载入，无法提交');
    return;
  }

  const title = formValue.value.title.trim();
  const introduction = formValue.value.introduction.trim();
  const wenkuId = formValue.value.wenkuId.trim();
  const toc = Object.assign(
    {},
    ...formValue.value.toc.map((item) => ({ [item.key]: item.zh })),
  );

  await Toast.promise(
    Promise.all([
      WebNovelRepo.updateNovelTranslation(providerId, novelId, {
        title,
        introduction,
        toc,
      }),
      WebNovelRepo.updateNovelWenkuId(providerId, novelId, {
        wenkuId,
      }),
    ]),
    {
      success: '编辑成功',
      error: (reason) => getApiErrorMessage(reason, '编辑失败'),
    },
  )
    .then(() => {
      router.push({ path: `/novel/${providerId}/${novelId}` });
    })
    .catch(() => {});
};
const requireLogin = useRequireLogin();
</script>

<template>
  <XPage>
    <UPageHeader title="编辑网络小说" />

    <UForm
      :state="formValue"
      class="space-y-5"
      @submit="requireLogin(submit)()"
    >
      <UFormField v-bind="formFieldProps" name="wenkuId" label="文库链接">
        <UFieldGroup class="w-full">
          <UBadge
            color="neutral"
            variant="outline"
            label="wenku/"
            class="shrink-0 rounded-sm px-3 text-sm font-normal"
          />
          <UInput
            class="min-w-0 flex-1"
            v-model="formValue.wenkuId"
            placeholder="文库版ID"
            :spellcheck="false"
          />
        </UFieldGroup>
      </UFormField>

      <UFormField v-bind="formFieldProps" label="日文标题">
        {{ formValue.titleJp }}
      </UFormField>
      <UFormField v-bind="formFieldProps" name="title" label="中文标题">
        <UInput
          class="w-full"
          v-model="formValue.title"
          :placeholder="formValue.titleJp"
          :spellcheck="false"
        />
      </UFormField>

      <UFormField v-bind="formFieldProps" label="日文简介">
        {{ formValue.introductionJp }}
      </UFormField>
      <UFormField v-bind="formFieldProps" name="introduction" label="中文简介">
        <UTextarea
          class="w-full"
          v-model="formValue.introduction"
          :placeholder="formValue.introductionJp"
          :spellcheck="false"
          :rows="3"
          :maxrows="10"
          autoresize
        />
      </UFormField>
    </UForm>

    <h2 class="heading-bar">目录</h2>
    <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
      <span class="text-error">
        注意，手动编辑目录可能会被其他人覆盖。如果你不满意目录的翻译，可以先用翻译器重翻试试。
      </span>
    </p>
    <table class="content-table [&>tbody>tr:last-child>td]:border-b-0">
      <tbody>
        <tr v-for="token in formValue.toc" :key="token.key">
          <td class="w-1/2 p-1!">
            {{ token.jp }}
            <br />
            <UInput
              class="w-full"
              v-if="!isWideScreen"
              v-model="token.zh"
              :placeholder="token.jp"
              :spellcheck="false"
            />
          </td>
          <td v-if="isWideScreen" class="p-1!">
            <UInput
              class="w-full"
              v-model="token.zh"
              :placeholder="token.jp"
              :spellcheck="false"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <USeparator class="my-6" />

    <ActionButton
      size="xl"
      color="primary"
      class="float"
      :action="requireLogin(submit)"
      variant="solid"
      :icon="UploadOutlined"
      :ui="{ leadingIcon: 'size-5' }"
    >
      提交
    </ActionButton>
  </XPage>
</template>
