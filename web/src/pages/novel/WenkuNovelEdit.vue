<script lang="ts" setup>
import { Toast, getApiErrorMessage, XPage, XTime } from '@novelia/web-kit';
import {
  DeleteOutlineOutlined,
  KeyboardDoubleArrowDownOutlined,
  KeyboardDoubleArrowUpOutlined,
  UploadOutlined,
} from '@vicons/material';
import type { Form, FormError, FormSchema } from '@nuxt/ui';
import { VueDraggable } from 'vue-draggable-plus';

import { WenkuNovelApi } from '@/api';
import { prettyCover, smartImport } from '@/domain/smart-import';
import { WenkuNovelRepo } from '@/repos';
import { externalImageUrls } from '@/config';
import type { WenkuNovelOutlineDto, WenkuVolumeDto } from '@/model/WenkuNovel';
import { presetKeywordsNonR18, presetKeywordsR18 } from '@/model/WenkuNovel';
import { useIsWideScreen } from '@/pages/util';
import { useWhoamiStore } from '@/stores';
import { RegexUtil } from '@/util';

const { novelId } = defineProps<{
  novelId: string | undefined;
}>();

const router = useRouter();
const isWideScreen = useIsWideScreen();
const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const allowSubmit = ref(novelId === undefined);
const formRef = useTemplateRef<Form<FormSchema>>('form');
const formFieldProps = computed(() => ({
  orientation: isWideScreen.value
    ? ('horizontal' as const)
    : ('vertical' as const),
  eagerValidation: true,
  ui: {
    wrapper: isWideScreen.value ? 'w-20 shrink-0 pt-1.5' : undefined,
    container: 'min-w-0 flex-1',
  },
}));
const formValue = ref({
  title: '',
  titleZh: '',
  cover: '',
  authors: <string[]>[],
  artists: <string[]>[],
  level: '一般向',
  keywords: <string[]>[],
  introduction: '',
  volumes: <WenkuVolumeDto[]>[],
});
const validate = (state: typeof formValue.value): FormError[] => {
  const errors: FormError[] = [];
  for (const name of ['title', 'titleZh'] as const) {
    if (!state[name].trim()) {
      errors.push({ name, message: '标题不能为空' });
    } else if (state[name].length > 80) {
      errors.push({ name, message: '标题长度不能超过80个字符' });
    }
  }
  if (RegexUtil.hasKanaChars(state.titleZh)) {
    errors.push({
      name: 'titleZh',
      message: '不要使用日文当作中文标题，没有公认的标题可以尝试自行翻译',
    });
  }
  if (!RegexUtil.isUrl(state.cover)) {
    errors.push({ name: 'cover', message: '封面链接必须是有效的URL' });
  } else if (!RegexUtil.isImageUrl(state.cover)) {
    errors.push({
      name: 'cover',
      message: '封面链接必须是图片链接（.jpg、.png、.webp 等）',
    });
  }
  if (state.level === '成人向' && !whoami.value.hasNsfwAccess) {
    errors.push({ name: 'level', message: '你太年轻了，无法创建成人向页面' });
  }
  if (state.introduction.length > 1000) {
    errors.push({
      name: 'introduction',
      message: '简介长度不能超过1000个字符',
    });
  }
  return errors;
};

const amazonUrl = ref('');

if (novelId !== undefined) {
  WenkuNovelRepo.useWenkuNovel(novelId, false)
    .refresh()
    .then(({ data, error }) => {
      if (data) {
        const {
          title,
          titleZh,
          cover,
          authors,
          artists,
          level,
          keywords,
          introduction,
        } = data;
        formValue.value = {
          title,
          titleZh,
          cover: prettyCover(cover ?? ''),
          authors,
          artists,
          level,
          keywords,
          introduction,
          volumes: data.volumes.map((it) => {
            it.cover = prettyCover(it.cover);
            return it;
          }),
        };
        amazonUrl.value = data.title.replace(/[?？。!！]$/, '');
        allowSubmit.value = true;
      } else {
        Toast.error(`载入失败: ${error?.message}`);
      }
    });
}

const submitting = ref(false);
const submit = async () => {
  if (!whoami.value.isSignedIn) {
    Toast.info('请先登录');
    return;
  }
  if (submitting.value) return;

  if (!allowSubmit.value) {
    Toast.warning('文章未载入，无法提交');
    return;
  }

  submitting.value = true;
  if (!(await formRef.value?.validate({ silent: true }))) {
    submitting.value = false;
    return;
  }

  const allPresetKeywords = presetKeywords.value.groups.flatMap(
    (it) => it.presetKeywords,
  );

  const body = {
    title: formValue.value.title,
    titleZh: formValue.value.titleZh,
    cover: formValue.value.cover,
    authors: formValue.value.authors,
    artists: formValue.value.artists,
    level: formValue.value.level,
    introduction: formValue.value.introduction,
    keywords: formValue.value.keywords.filter((it) =>
      allPresetKeywords.includes(it),
    ),
    volumes: formValue.value.volumes,
  };

  if (novelId === undefined) {
    await Toast.promise(WenkuNovelRepo.createNovel(body), {
      success: '新建文库成功',
      error: (reason) => getApiErrorMessage(reason, '新建文库失败'),
    })
      .then((id) => {
        router.push({ path: `/wenku/${id}` });
      })
      .catch(() => {});
  } else {
    await Toast.promise(WenkuNovelRepo.updateNovel(novelId, body), {
      success: '编辑文库成功',
      error: (reason) => getApiErrorMessage(reason, '编辑文库失败'),
    })
      .then(() => {
        router.push({ path: `/wenku/${novelId}` });
      })
      .catch(() => {});
  }
  submitting.value = false;
};

const populateNovelFromAmazon = async (
  urlOrQuery: string,
  forcePopulateVolumes: boolean,
) => {
  const toastId = Toast.info('智能导入中...', { duration: 0 });
  Toast.update(toastId, { status: 'loading' });

  const result = await smartImport(
    urlOrQuery.trim(),
    formValue.value.volumes,
    forcePopulateVolumes,
    {
      log: (message) => {
        Toast.update(toastId, { message });
      },
      populateNovel: (novel) => {
        formValue.value = {
          title: formValue.value.title ? formValue.value.title : novel.title,
          titleZh: formValue.value.titleZh
            ? formValue.value.titleZh
            : novel.titleZh ?? '',
          cover: novel.volumes[0]?.cover,
          authors:
            formValue.value.authors.length > 0
              ? formValue.value.authors
              : novel.authors,
          artists:
            formValue.value.artists.length > 0
              ? formValue.value.artists
              : novel.artists,
          level: novel.r18 ? '成人向' : '一般向',
          keywords: formValue.value.keywords,
          introduction: formValue.value.introduction
            ? formValue.value.introduction
            : novel.introduction,
          volumes: novel.volumes,
        };
      },
      populateVolume: (volume) => {
        const index = formValue.value.volumes.findIndex(
          (it) => it.asin === volume.asin,
        );
        if (index >= 0) {
          formValue.value.volumes[index] = volume;
        }
      },
    },
  );

  if (result) {
    formValue.value.cover = formValue.value.volumes[0]?.cover;
    Toast.update(toastId, {
      message: '智能导入完成',
      status: 'info',
      duration: 3000,
    });
  } else {
    Toast.update(toastId, {
      message: '智能导入失败',
      status: 'error',
      duration: 3000,
    });
  }
};

const submitSteps = [
  { value: 1, title: '检查小说是否已经存在' },
  { value: 2, title: '检查小说文件是否可以上传' },
  { value: 3, title: '创建文库小说' },
] as const;
const submitCurrentStep = ref(1);
const title = computed(() => formValue.value.title);
const similarNovels = ref<WenkuNovelOutlineDto[] | null>(null);

watch(title, () => {
  similarNovels.value = null;
  submitCurrentStep.value = 1;
});
// 取第一段连续的日文/汉字作为关键词，没有则使用整个标题
const similarQuery = computed(
  () =>
    title.value
      .split(/[^\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+/)
      .find((it) => it) ?? title.value.trim(),
);
const searching = ref(false);
const findSimilarNovels = async () => {
  if (searching.value) return;

  const query = similarQuery.value;
  if (!query) {
    Toast.warning('请先填写标题');
    return;
  }
  searching.value = true;
  // 「全部」不含非小说和成人向，需要分别搜索；成人向需要权限
  const levels = whoami.value.hasNsfwAccess ? [0, 4, 5, 6] : [0, 4];
  await Toast.promise(
    Promise.all(
      levels.map((level) =>
        WenkuNovelApi.listNovel({ page: 0, pageSize: 6, query, level }),
      ),
    ),
    { error: (reason) => getApiErrorMessage(reason, '搜索相似小说失败') },
  )
    .then((results) => {
      similarNovels.value = results.flatMap((it) => it.items);
    })
    .catch(() => {});
  searching.value = false;
};
const moveToPrevStep = () => {
  if (submitCurrentStep.value > 1) {
    submitCurrentStep.value -= 1;
  }
};
const moveToNextStep = () => {
  if (submitCurrentStep.value < 3) {
    submitCurrentStep.value += 1;
  }
};
const topVolume = (asin: string) => {
  formValue.value.volumes.sort((a, b) => {
    return a.asin == asin ? -1 : b.asin == asin ? 1 : 0;
  });
};
const bottomVolume = (asin: string) => {
  formValue.value.volumes.sort((a, b) => {
    return a.asin == asin ? 1 : b.asin == asin ? -1 : 0;
  });
};
const deleteVolume = (asin: string) => {
  formValue.value.volumes = formValue.value.volumes.filter(
    (it) => it.asin !== asin,
  );
};

const markAsDuplicate = () => {
  formValue.value = {
    title: '重复，待删除',
    titleZh: '重复，待删除',
    cover: externalImageUrls.wenkuCoverPlaceholder,
    authors: [],
    artists: [],
    level: formValue.value.level,
    keywords: [],
    introduction: '',
    volumes: [],
  };
};

const presetKeywords = computed(() => {
  if (formValue.value.level === '一般向') {
    return presetKeywordsNonR18;
  } else {
    return presetKeywordsR18;
  }
});
const showKeywordsModal = ref(false);

const togglePresetKeyword = (checked: boolean, keyword: string) => {
  if (checked) {
    formValue.value.keywords.push(keyword);
  } else {
    formValue.value.keywords = formValue.value.keywords.filter(
      (it) => it !== keyword,
    );
  }
};

const levelOptions = [
  { label: '轻小说', value: '一般向' },
  { label: '轻文学', value: '轻文学' },
  { label: '文学', value: '严肃向' },
  { label: '非小说', value: '非小说' },
  { label: 'R18男性向', value: '成人向' },
  { label: 'R18女性向', value: '成人向女' },
];
</script>

<template>
  <XPage>
    <UPageHeader
      :title="`${novelId === undefined ? '新建' : '编辑'}文库小说`"
    />

    <UCard
      variant="soft"
      class="mb-5 bg-embedded text-sm leading-[1.6] text-default"
      :ui="{ body: 'px-6 py-5 sm:px-6 sm:py-5' }"
    >
      <span class="text-error">
        <b>创建文库小说注意事项：</b>
      </span>
      <ul class="content-list">
        <li>
          请先安装机翻站扩展以启用智能导入功能，另外自动机翻简介功能要求你能使用有道机翻。
        </li>
        <li>
          文库小说只允许已经发行单行本的日语小说，原则上以亚马逊上可以买到为准，系列小说不要分开导入。
        </li>
        <li>
          在导入栏输入亚马逊系列/单本链接直接导入，或是输入小说日文主标题搜索导入。
        </li>
        <li>
          导入R18书需要注册机翻站满一个月、使用日本IP，并在亚马逊上点过“已满18岁”。
        </li>
      </ul>
    </UCard>

    <div class="mb-12 flex w-full flex-wrap gap-x-3 gap-y-2">
      <div v-if="isWideScreen">
        <n-image
          width="160"
          :src="
            formValue.cover
              ? formValue.cover
              : externalImageUrls.wenkuCoverPlaceholder
          "
          alt="cover"
        />
      </div>

      <div class="flex flex-auto flex-col gap-y-3">
        <UFieldGroup class="w-full">
          <UInput
            class="min-w-0 flex-1"
            v-model="amazonUrl"
            :placeholder="formValue.title"
            :spellcheck="false"
          />
          <ActionButton
            class="shrink-0 justify-center rounded-sm"
            color="primary"
            :action="() => populateNovelFromAmazon(amazonUrl, false)"
            variant="solid"
          >
            导入
          </ActionButton>
        </UFieldGroup>
        <div class="flex flex-wrap gap-x-3 gap-y-2">
          <UButton
            color="neutral"
            :href="`https://www.amazon.co.jp/s?k=${encodeURIComponent(
              formValue.title,
            )}&i=stripbooks`"
            target="_blank"
            variant="soft"
            class="rounded-full"
          >
            在亚马逊搜索
          </UButton>
          <ActionButton
            variant="soft"
            :action="() => populateNovelFromAmazon('', true)"
          >
            刷新分卷
          </ActionButton>
          <ActionButton
            v-if="whoami.isAdmin"
            color="error"
            variant="soft"
            :action="markAsDuplicate"
          >
            标记重复
          </ActionButton>
        </div>
      </div>
    </div>

    <UForm
      ref="form"
      :state="formValue"
      :validate="validate"
      :validate-on-input-delay="0"
      class="space-y-5"
      @submit="
        novelId !== undefined || submitCurrentStep === 3 ? submit() : undefined
      "
    >
      <UFormField v-bind="formFieldProps" name="title" label="日文标题">
        <UInput
          class="w-full"
          v-model="formValue.title"
          placeholder="请输入日文标题"
          maxlength="80"
          :spellcheck="false"
          :ui="{ base: 'pr-18' }"
        >
          <template #default>
            <span
              class="pointer-events-none absolute right-3 bottom-2 text-xs text-muted"
              aria-live="polite"
            >
              {{ formValue.title.length }}/80
            </span>
          </template>
        </UInput>
      </UFormField>

      <UFormField v-bind="formFieldProps" name="titleZh" label="中文标题">
        <UInput
          class="w-full"
          v-model="formValue.titleZh"
          placeholder="请输入中文标题"
          maxlength="80"
          :spellcheck="false"
          :ui="{ base: 'pr-18' }"
        >
          <template #default>
            <span
              class="pointer-events-none absolute right-3 bottom-2 text-xs text-muted"
              aria-live="polite"
            >
              {{ formValue.titleZh.length }}/80
            </span>
          </template>
        </UInput>
      </UFormField>

      <UFormField v-bind="formFieldProps" name="cover" label="封面链接">
        <div class="flex w-full flex-col gap-1.5">
          <UInput
            class="w-full"
            v-model="formValue.cover"
            placeholder="请输入封面链接"
            :spellcheck="false"
          />
          <span class="text-warning">
            <b>* 如果已经有封面就不要修改，其他人会认不出来</b>
          </span>
        </div>
      </UFormField>

      <UFormField v-bind="formFieldProps" name="authors" label="作者">
        <UInputTags
          v-model="formValue.authors"
          class="w-full"
          placeholder="添加作者"
          duplicate
          add-on-blur
          delimiter=""
        />
      </UFormField>

      <UFormField v-bind="formFieldProps" name="artists" label="画师">
        <UInputTags
          v-model="formValue.artists"
          class="w-full"
          placeholder="添加画师"
          duplicate
          add-on-blur
          delimiter=""
        />
      </UFormField>

      <UFormField v-bind="formFieldProps" name="level" label="分级">
        <URadioGroup
          v-model="formValue.level"
          :items="levelOptions"
          orientation="horizontal"
          variant="card"
          indicator="hidden"
          :ui="{
            fieldset: 'flex flex-wrap gap-1',
            item: 'flex-none px-3 py-1.5',
          }"
        />
      </UFormField>

      <UFormField v-bind="formFieldProps" name="introduction" label="简介">
        <UTextarea
          class="w-full"
          v-model="formValue.introduction"
          autoresize
          placeholder="请输入小说简介"
          :rows="8"
          :maxrows="24"
          maxlength="1000"
          :spellcheck="false"
          :ui="{ base: 'pr-18' }"
        >
          <template #default>
            <span
              class="pointer-events-none absolute right-3 bottom-2 text-xs text-muted"
              aria-live="polite"
            >
              {{ formValue.introduction.length }}/1000
            </span>
          </template>
        </UTextarea>
      </UFormField>

      <UFormField v-bind="formFieldProps" label="标签">
        <div
          class="divide-y divide-default leading-[1.6] text-default text-sm rounded-[3px] border border-default w-full"
        >
          <div class="relative min-w-0 px-5 py-3">
            <UButton
              v-if="presetKeywords.groups.length > 0"
              color="error"
              variant="link"
              class="rounded-full p-0 leading-none"
              @click="showKeywordsModal = true"
            >
              用前必读
            </UButton>
            <p
              class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0"
              v-else
            >
              暂不支持标签。
            </p>
          </div>
          <div
            class="relative min-w-0 px-5 py-3"
            v-for="group of presetKeywords.groups"
            :key="group.title"
          >
            <div class="flex flex-wrap gap-x-2 gap-y-1">
              <n-tag :bordered="false" size="small">
                <b>{{ group.title }}</b>
              </n-tag>
              <n-tag
                v-for="keyword of group.presetKeywords"
                :key="keyword"
                size="small"
                checkable
                :checked="formValue.keywords.includes(keyword)"
                @update:checked="
                  (checked: boolean) => togglePresetKeyword(checked, keyword)
                "
              >
                {{ keyword }}
              </n-tag>
            </div>
          </div>
        </div>
      </UFormField>

      <UFormField
        v-bind="formFieldProps"
        label="分卷"
        v-if="formValue.volumes.length > 0"
      >
        <div class="w-full text-[12px] leading-[1.6] text-default">
          <vue-draggable
            v-model="formValue.volumes"
            class="divide-y divide-default"
            :animation="150"
            handle=".drag-trigger"
          >
            <div
              class="relative min-w-0 py-3"
              v-for="volume of formValue.volumes"
              :key="volume.asin"
            >
              <div
                class="flex w-full min-w-0 items-start gap-3 text-sm text-default"
              >
                <div class="mt-0.5 shrink-0">
                  <div>
                    <n-image
                      class="drag-trigger cursor-move! rounded-[2px]"
                      width="88"
                      :src="volume.cover"
                      :preview-src="volume.coverHires ?? volume.cover"
                      :alt="volume.asin"
                      lazy
                    />
                  </div>
                </div>

                <div class="min-w-0 flex-1 break-words">
                  <div
                    class="mb-1 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span class="text-[12px] text-default">
                      ASIN：
                      <ULink
                        :href="`https://www.amazon.co.jp/zh/dp/${volume.asin}`"
                      >
                        {{ volume.asin }}
                      </ULink>
                    </span>

                    <div class="flex gap-1.5">
                      <UTooltip text="置顶">
                        <UButton
                          :icon="KeyboardDoubleArrowUpOutlined"
                          color="neutral"
                          size="xs"
                          variant="soft"
                          square
                          class="rounded-full"
                          @click="topVolume(volume.asin)"
                          aria-label="置顶"
                        />
                      </UTooltip>

                      <UTooltip text="置底">
                        <UButton
                          :icon="KeyboardDoubleArrowDownOutlined"
                          color="neutral"
                          size="xs"
                          variant="soft"
                          square
                          class="rounded-full"
                          @click="bottomVolume(volume.asin)"
                          aria-label="置底"
                        />
                      </UTooltip>

                      <UTooltip text="删除">
                        <UButton
                          :icon="DeleteOutlineOutlined"
                          size="xs"
                          variant="soft"
                          square
                          color="error"
                          class="rounded-full"
                          @click="deleteVolume(volume.asin)"
                          aria-label="删除"
                        />
                      </UTooltip>
                    </div>
                  </div>

                  <div>
                    <div class="flex items-center">
                      <span class="text-[12px] break-keep text-default">
                        标题：
                      </span>
                      <UInput
                        class="w-full"
                        v-model="volume.title"
                        placeholder="标题"
                        :spellcheck="false"
                        size="sm"
                        :ui="{ base: 'text-[12px]!' }"
                      />
                    </div>
                    <span class="text-[12px] text-default">
                      缩略：{{ volume.cover }}
                      <br />
                      高清：{{ volume.coverHires }}
                      <br />
                      出版：
                      {{ volume.publisher ?? '未知出版商' }}
                      /
                      {{ volume.imprint ?? '未知文库' }}
                      /
                      <XTime
                        v-if="volume.publishAt"
                        :time="volume.publishAt * 1000"
                        format="yyyy-MM-dd"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </vue-draggable>
        </div>
      </UFormField>
    </UForm>

    <USeparator class="my-6" />

    <div v-if="novelId" class="submit-action">
      <UButton
        :icon="UploadOutlined"
        class="min-h-11 rounded-full"
        :loading="submitting"
        @click="submit"
      >
        提交
      </UButton>
    </div>

    <ol
      v-else
      role="list"
      aria-label="创建文库小说步骤"
      class="ml-6 list-none p-0"
    >
      <li
        v-for="step in submitSteps"
        :key="step.value"
        :aria-current="submitCurrentStep === step.value ? 'step' : undefined"
        class="relative border-l border-default pb-8 pl-7 last:border-transparent last:pb-0"
      >
        <span
          aria-hidden="true"
          class="absolute -left-4 top-0 flex size-8 items-center justify-center rounded-full border text-sm"
          :class="
            submitCurrentStep === step.value
              ? 'border-primary bg-primary text-inverted'
              : submitCurrentStep > step.value
                ? 'border-primary bg-default text-primary'
                : 'border-default bg-default text-muted'
          "
        >
          {{ step.value }}
        </span>
        <h3
          class="mb-3 min-h-8 text-base font-medium leading-8"
          :class="
            submitCurrentStep >= step.value ? 'text-default' : 'text-muted'
          "
        >
          {{ step.title }}
        </h3>
        <template v-if="step.value === 1">
          <p class="my-3 text-sm leading-[1.6] text-default">
            创建文库页面前，请先确定你要创建的小说页面不存在，不要重复创建。你可以通过下面的搜索按钮搜索章节标题，注意自动搜索不总是能正确提取出关键词，如果关键词不正确，请手动搜索日文标题。
          </p>
          <p class="my-3 text-sm leading-[1.6] text-default">
            自动搜索关键词：
            <b>{{ similarQuery }}</b>
          </p>
          <div v-if="similarNovels !== null" class="my-[1em]">
            <template v-if="similarNovels.length === 0">
              没有相似的小说
            </template>
            <div v-else class="@container w-full">
              <div class="grid grid-cols-3 gap-3 @[600px]:grid-cols-6">
                <div
                  v-for="item in similarNovels"
                  :key="item.id"
                  class="min-w-0"
                >
                  <router-link :to="`/wenku/${item.id}`">
                    <ImageCard
                      :src="item.cover"
                      :title="item.titleZh ? item.titleZh : item.title"
                    />
                  </router-link>
                </div>
              </div>
            </div>
          </div>
          <div v-if="submitCurrentStep === 1" class="flex flex-wrap gap-3">
            <UButton
              color="warning"
              :disabled="similarNovels === null"
              @click="moveToNextStep"
            >
              我确定小说不存在
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              :loading="searching"
              @click="findSimilarNovels"
            >
              自动搜索相似小说
            </UButton>
          </div>
        </template>
        <template v-else-if="step.value === 2">
          <p class="my-3 text-sm leading-[1.6] text-default">
            创建文库页面前，请先确认你有可以上传的小说文件。不要创建文库页再去寻找资源，最后发现资源用不了或者找不到，留下一个空的文库页。尤其禁止创建空页面来求书，会被封号。
          </p>
          <p class="my-3 text-sm leading-[1.6] text-default">
            PDF、或者内容只有图片的EPUB是无法上传的。
          </p>

          <div v-if="submitCurrentStep === 2" class="flex flex-wrap gap-3">
            <UButton color="warning" @click="moveToNextStep">
              我确定我有可以上传的文件
            </UButton>
            <UButton color="neutral" variant="outline" @click="moveToPrevStep">
              上一步
            </UButton>
          </div>
        </template>
        <template v-else>
          <div v-if="submitCurrentStep === 3" class="mt-4 flex flex-wrap gap-3">
            <UButton
              :icon="UploadOutlined"
              :loading="submitting"
              @click="submit"
            >
              提交
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              :disabled="submitting"
              @click="moveToPrevStep"
            >
              上一步
            </UButton>
          </div>
        </template>
      </li>
    </ol>
  </XPage>

  <UModal
    title="使用说明"
    v-model:open="showKeywordsModal"
    class="w-150"
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
  >
    <template #body>
      <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
        标签的意义在于辅助搜索。一个标签是否合适，要看标签相关情节的比例。仅仅是存在相关情节，不足以作为添加标签的依据。在实际操作中，可以思考搜索该标签的用户想不想看到这本书。
      </p>
      <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
        下面是一些标签的具体解释。注意，同一个标签在一般向和R18下可能存在区别。
      </p>
      <USeparator class="my-6" />
      <p
        class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0"
        v-for="row of presetKeywords.explanations"
        :key="row.word"
      >
        <b>{{ row.word }}</b>
        <br />
        {{ row.explanation }}
      </p>
    </template>
  </UModal>
</template>

<style scoped>
/* 定位外层容器，避免与按钮组件自身的 position 样式竞争。 */
.submit-action {
  position: fixed;
  right: max(40px, env(safe-area-inset-right, 0px));
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 20;
  border-radius: 9999px;
  box-shadow: rgb(0 0 0 / 40%) 2px 2px 8px 0px;
}

@media (max-width: 600px) {
  .submit-action {
    right: calc(12px + env(safe-area-inset-right, 0px));
  }
}
</style>
