<script lang="ts" setup>
import {
  DeleteOutlineOutlined,
  KeyboardDoubleArrowDownOutlined,
  KeyboardDoubleArrowUpOutlined,
  UploadOutlined,
} from '@vicons/material';
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';
import { VueDraggable } from 'vue-draggable-plus';

import { WenkuNovelApi } from '@/api';
import { prettyCover, smartImport } from '@/domain/smart-import';
import { WenkuNovelRepo } from '@/repos';
import coverPlaceholder from '@/image/cover_placeholder.png';
import type { WenkuNovelOutlineDto, WenkuVolumeDto } from '@/model/WenkuNovel';
import { presetKeywordsNonR18, presetKeywordsR18 } from '@/model/WenkuNovel';
import { doAction, useIsWideScreen } from '@/pages/util';
import { useWhoamiStore } from '@/stores';
import { RegexUtil, delay } from '@/util';
import { runCatching } from '@/util/result';

const { novelId } = defineProps<{
  novelId: string | undefined;
}>();

const router = useRouter();
const isWideScreen = useIsWideScreen();
const message = useMessage();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const allowSubmit = ref(novelId === undefined);
const formRef = useTemplateRef<FormInst>('form');
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
const formRules: FormRules = {
  title: [
    {
      validator: (_rule: FormItemRule, value: string) =>
        value.trim().length > 0,
      message: '标题不能为空',
      trigger: 'input',
    },
    {
      validator: (_rule: FormItemRule, value: string) => value.length <= 80,
      message: '标题长度不能超过80个字符',
      trigger: 'input',
    },
  ],
  titleZh: [
    {
      validator: (_rule: FormItemRule, value: string) =>
        value.trim().length > 0,
      message: '标题不能为空',
      trigger: 'input',
    },
    {
      validator: (_rule: FormItemRule, value: string) => value.length <= 80,
      message: '标题长度不能超过80个字符',
      trigger: 'input',
    },
    {
      validator: (_rule: FormItemRule, value: string) =>
        !RegexUtil.hasKanaChars(value),
      message: '不要使用日文当作中文标题，没有公认的标题可以尝试自行翻译',
      trigger: 'input',
    },
  ],
  cover: [
    {
      validator: (_rule: FormItemRule, value: string) => RegexUtil.isUrl(value),
      message: '封面链接必须是有效的URL',
      trigger: 'input',
    },
  ],
  level: [
    {
      validator: (_rule: FormItemRule, value: string) =>
        value !== '成人向' || whoami.value.allowNsfw,
      message: '你太年轻了，无法创建成人向页面',
      trigger: 'input',
    },
  ],
  introduction: [
    {
      validator: (_rule: FormItemRule, value: string) => value.length <= 500,
      message: '简介长度不能超过500个字符',
      trigger: 'input',
    },
  ],
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
    await doAction(
      WenkuNovelRepo.createNovel(body).then((id) => {
        router.push({ path: `/wenku/${id}` });
      }),
      '新建文库',
      message,
    );
  } else {
    await doAction(
      WenkuNovelRepo.updateNovel(novelId, body).then(() => {
        router.push({ path: `/wenku/${novelId}` });
      }),
      '编辑文库',
      message,
    );
  }
};

const populateNovelFromAmazon = async (
  urlOrQuery: string,
  forcePopulateVolumes: boolean,
) => {
  const msgReactive = message.create('', {
    type: 'loading',
    duration: 0,
  });

  await smartImport(
    urlOrQuery.trim(),
    formValue.value.volumes,
    forcePopulateVolumes,
    {
      log: (message) => {
        msgReactive.content = message;
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

  formValue.value.cover = formValue.value.volumes[0]?.cover;
  msgReactive.content = '智能导入完成';
  msgReactive.type = 'info';
  delay(3000).then(() => msgReactive.destroy());
};

const submitCurrentStep = ref(1);
const title = computed(() => formValue.value.title);
const similarNovels = ref<WenkuNovelOutlineDto[] | null>(null);

watch(title, () => {
  similarNovels.value = null;
  submitCurrentStep.value = 1;
});
const findSimilarNovels = async () => {
  const query = title.value.split(
    /[^\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/,
    2,
  )[0];
  const result = await runCatching(
    WenkuNovelApi.listNovel({
      page: 0,
      pageSize: 6,
      query,
      level: 0,
    }),
  );
  if (result.ok) {
    similarNovels.value = result.value.items;
  } else {
    message.error('搜索相似小说失败:' + result.error.message);
  }
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
    cover: '',
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
  { label: '文学', value: '严肃向' },
  { label: '非小说', value: '非小说' },
  { label: 'R18男性向', value: '成人向' },
  { label: 'R18女性向', value: '成人向女' },
];
</script>

<template>
  <div class="layout-content">
    <n-h1>{{ novelId === undefined ? '新建' : '编辑' }}文库小说</n-h1>

    <n-card embedded :bordered="false" style="margin-bottom: 20px">
      <n-text type="error">
        <b>创建文库小说注意事项：</b>
      </n-text>
      <n-ul>
        <n-li>
          请先安装机翻站扩展以启用智能导入功能，另外自动机翻简介功能要求你能使用有道机翻。
        </n-li>
        <n-li>
          文库小说只允许已经发行单行本的日语小说，原则上以亚马逊上可以买到为准，系列小说不要分开导入。
        </n-li>
        <n-li>
          在导入栏输入亚马逊系列/单本链接直接导入，或是输入小说日文主标题搜索导入。
        </n-li>
        <n-li>
          导入R18书需要注册机翻站满一个月、使用日本IP，并在亚马逊上点过“已满18岁”。
        </n-li>
      </n-ul>
    </n-card>

    <n-flex style="margin-bottom: 48px; width: 100%">
      <div v-if="isWideScreen">
        <n-image
          width="160"
          :src="formValue.cover ? formValue.cover : coverPlaceholder"
          alt="cover"
        />
      </div>

      <n-flex size="large" vertical style="flex: auto">
        <n-input-group>
          <n-input
            v-model:value="amazonUrl"
            :placeholder="formValue.title"
            :input-props="{ spellcheck: false }"
          />
          <c-button
            label="导入"
            :round="false"
            type="primary"
            @action="populateNovelFromAmazon(amazonUrl, false)"
          />
        </n-input-group>
        <n-flex>
          <c-button
            label="在亚马逊搜索"
            secondary
            tag="a"
            :href="`https://www.amazon.co.jp/s?k=${encodeURIComponent(
              formValue.title,
            )}&i=stripbooks`"
            target="_blank"
          />
          <c-button
            secondary
            label="刷新分卷"
            @action="populateNovelFromAmazon('', true)"
          />
          <c-button
            v-if="whoami.isAdmin"
            type="error"
            secondary
            label="标记重复"
            @action="markAsDuplicate"
          />
        </n-flex>
      </n-flex>
    </n-flex>

    <n-form
      ref="form"
      :model="formValue"
      :rules="formRules"
      :label-placement="isWideScreen ? 'left' : 'top'"
      label-width="auto"
    >
      <n-form-item-row path="title" label="日文标题">
        <n-input
          v-model:value="formValue.title"
          placeholder="请输入日文标题"
          maxlength="80"
          show-count
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-form-item-row path="titleZh" label="中文标题">
        <n-input
          v-model:value="formValue.titleZh"
          placeholder="请输入中文标题"
          maxlength="80"
          show-count
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-form-item-row path="cover" label="封面链接">
        <n-input
          v-model:value="formValue.cover"
          placeholder="请输入封面链接"
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-form-item-row path="authors" label="作者">
        <n-dynamic-tags v-model:value="formValue.authors" />
      </n-form-item-row>

      <n-form-item-row path="artists" label="画师">
        <n-dynamic-tags v-model:value="formValue.artists" />
      </n-form-item-row>

      <n-form-item-row path="level" label="分级">
        <c-radio-group
          v-model:value="formValue.level"
          :options="levelOptions"
        />
      </n-form-item-row>

      <n-form-item-row path="content" label="简介">
        <n-input
          v-model:value="formValue.introduction"
          type="textarea"
          placeholder="请输入小说简介"
          :autosize="{
            minRows: 8,
            maxRows: 24,
          }"
          maxlength="500"
          show-count
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-form-item-row label="标签">
        <n-list bordered style="width: 100%">
          <n-list-item>
            <c-button
              v-if="presetKeywords.groups.length > 0"
              label="用前必读"
              @action="showKeywordsModal = true"
              text
              type="error"
            />
            <n-p v-else>暂不支持标签。</n-p>
          </n-list-item>
          <n-list-item
            v-for="group of presetKeywords.groups"
            :key="group.title"
          >
            <n-flex size="small">
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
            </n-flex>
          </n-list-item>
        </n-list>
      </n-form-item-row>

      <n-form-item-row label="分卷" v-if="formValue.volumes.length > 0">
        <n-list style="width: 100%; font-size: 12px">
          <vue-draggable
            v-model="formValue.volumes"
            :animation="150"
            handle=".drag-trigger"
          >
            <n-list-item v-for="volume of formValue.volumes" :key="volume.asin">
              <n-thing>
                <template #avatar>
                  <div>
                    <n-image
                      class="drag-trigger"
                      width="88"
                      :src="volume.cover"
                      :preview-src="volume.coverHires ?? volume.cover"
                      :alt="volume.asin"
                      lazy
                      style="border-radius: 2px; cursor: move"
                    />
                  </div>
                </template>

                <template #header>
                  <n-text style="font-size: 12px">
                    ASIN：
                    <n-a
                      :href="`https://www.amazon.co.jp/zh/dp/${volume.asin}`"
                    >
                      {{ volume.asin }}
                    </n-a>
                  </n-text>
                </template>

                <template #header-extra>
                  <n-flex :size="6" :wrap="false">
                    <c-icon-button
                      tooltip="置顶"
                      :icon="KeyboardDoubleArrowUpOutlined"
                      @action="topVolume(volume.asin)"
                    />

                    <c-icon-button
                      tooltip="置底"
                      :icon="KeyboardDoubleArrowDownOutlined"
                      @action="bottomVolume(volume.asin)"
                    />

                    <c-icon-button
                      tooltip="删除"
                      :icon="DeleteOutlineOutlined"
                      type="error"
                      @action="deleteVolume(volume.asin)"
                    />
                  </n-flex>
                </template>

                <template #description>
                  <n-flex align="center" :size="0" :wrap="false">
                    <n-text style="word-break: keep-all; font-size: 12px">
                      标题：
                    </n-text>
                    <n-input
                      v-model:value="volume.title"
                      placeholder="标题"
                      :input-props="{ spellcheck: false }"
                      size="small"
                      style="font-size: 12px"
                    />
                  </n-flex>
                  <n-text style="font-size: 12px">
                    缩略：{{ volume.cover }}
                    <br />
                    高清：{{ volume.coverHires }}
                    <br />
                    出版：
                    {{ volume.publisher ?? '未知出版商' }}
                    /
                    {{ volume.imprint ?? '未知文库' }}
                    /
                    <n-time
                      v-if="volume.publishAt"
                      :time="volume.publishAt * 1000"
                      type="date"
                    />
                  </n-text>
                </template>
              </n-thing>
            </n-list-item>
          </vue-draggable>
        </n-list>
      </n-form-item-row>
    </n-form>

    <n-divider />

    <c-button
      v-if="novelId"
      label="提交"
      :icon="UploadOutlined"
      require-login
      size="large"
      type="primary"
      class="float"
      @action="submit"
    />

    <n-steps
      v-else
      :current="submitCurrentStep"
      vertical
      style="margin-left: 8px"
    >
      <n-step title="检查小说是否已经存在">
        <p>
          创建文库页面前，请先确定你要创建的小说页面不存在，不要重复创建。你可以通过下面的搜索按钮搜索章节标题，注意自动搜索不总是能正确提取出关键词，如果关键词不正确，请手动搜索日文标题。
        </p>
        <p>
          自动搜索关键词：
          <b>
            {{
              title.split(
                /[^\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/,
                2,
              )[0]
            }}
          </b>
        </p>
        <p v-if="similarNovels !== null">
          <template v-if="similarNovels.length === 0">没有相似的小说</template>
          <n-grid v-else :x-gap="12" :y-gap="12" cols="3 600:6">
            <n-grid-item v-for="item in similarNovels" :key="item.id">
              <router-link :to="`/wenku/${item.id}`">
                <ImageCard
                  :src="item.cover"
                  :title="item.titleZh ? item.titleZh : item.title"
                />
              </router-link>
            </n-grid-item>
          </n-grid>
        </p>
        <n-button-group v-if="submitCurrentStep === 1">
          <c-button
            label="我确定小说不存在"
            type="warning"
            @click="moveToNextStep"
          />
          <c-button label="自动搜索相似小说" @click="findSimilarNovels" />
        </n-button-group>
      </n-step>

      <n-step title="检查小说文件是否可以上传">
        <p>
          创建文库页面前，请先确认你有可以上传的小说文件。不要创建文库页再去寻找资源，最后发现资源用不了或者找不到，留下一个空的文库页。尤其禁止创建空页面来求书，会被封号。
        </p>
        <p>PDF、或者内容只有图片的EPUB是无法上传的。</p>

        <n-button-group v-if="submitCurrentStep === 2">
          <c-button
            label="我确定我有可以上传的文件"
            type="warning"
            @click="moveToNextStep"
          />
          <c-button label="上一步" @click="moveToPrevStep" />
        </n-button-group>
      </n-step>

      <n-step title="创建文库小说">
        <n-button-group v-if="submitCurrentStep === 3" style="margin-top: 16px">
          <c-button
            label="提交"
            :icon="UploadOutlined"
            require-login
            type="primary"
            @action="submit"
          />
          <c-button label="上一步" @click="moveToPrevStep" />
        </n-button-group>
      </n-step>
    </n-steps>
  </div>

  <c-modal title="使用说明" v-model:show="showKeywordsModal">
    <n-p>
      标签的意义在于辅助搜索。一个标签是否合适，要看标签相关情节的比例。仅仅是存在相关情节，不足以作为添加标签的依据。在实际操作中，可以思考搜索该标签的用户想不想看到这本书。
    </n-p>
    <n-p>
      下面是一些标签的具体解释。注意，同一个标签在一般向和R18下可能存在区别。
    </n-p>
    <n-divider />
    <n-p v-for="row of presetKeywords.explanations" :key="row.word">
      <b>{{ row.word }}</b>
      <br />
      {{ row.explanation }}
    </n-p>
  </c-modal>
</template>
