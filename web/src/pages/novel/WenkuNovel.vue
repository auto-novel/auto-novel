<script lang="ts" setup>
import { EditNoteOutlined, LanguageOutlined } from '@vicons/material';
import { createReusableTemplate } from '@vueuse/core';

import { Locator } from '@/data';
import coverPlaceholder from '@/image/cover_placeholder.png';
import { GenericNovelId } from '@/model/Common';
import { doAction, useIsWideScreen } from '@/pages/util';

import { useWenkuNovelStore } from './WenkuNovelStore';
import TranslateOptions from './components/TranslateOptions.vue';

const { novelId } = defineProps<{ novelId: string }>();

const [DefineTagGroup, ReuseTagGroup] = createReusableTemplate<{
  label: string;
  tags: string[];
}>();

const isWideScreen = useIsWideScreen(600);
const message = useMessage();
const vars = useThemeVars();

const { setting } = Locator.settingRepository();
const { whoami } = Locator.authRepository();

const store = useWenkuNovelStore(novelId);
const { novelResult } = storeToRefs(store);

store.loadNovel().then((result) => {
  if (result?.ok) {
    document.title = result.value.title;
  }
});

const translateOptions = ref<InstanceType<typeof TranslateOptions>>();

const deleteVolume = (volumeId: string) =>
  doAction(store.deleteVolume(volumeId), '删除', message);

const buildSearchLink = (tag: string) => `/wenku?query="${tag}"`;

const showWebNovelsModal = ref(false);
</script>

<template>
  <DefineTagGroup v-slot="{ label, tags }">
    <n-flex v-if="tags.length > 0" :wrap="false">
      <n-tag :bordered="false" size="small">
        {{ label }}
      </n-tag>
      <n-flex :size="[4, 4]">
        <router-link v-for="tag of tags" :key="tag" :to="buildSearchLink(tag)">
          <novel-tag :tag="tag" />
        </router-link>
      </n-flex>
    </n-flex>
  </DefineTagGroup>

  <div
    v-if="novelResult?.ok"
    :style="{
      background: `url(${novelResult.value.cover})`,
    }"
    style="
      width: 100%;
      clip: rect(0, auto, auto, 0);
      background-size: cover;
      background-position: center 15%;
    "
  >
    <div
      :style="{
        background: `linear-gradient(to bottom, ${
          vars.bodyColor == '#fff' ? '#ffffff80' : 'rgba(16, 16, 20, 0.5)'
        }, ${vars.bodyColor})`,
      }"
      style="width: 100%; height: 100%; backdrop-filter: blur(8px)"
    >
      <div class="layout-content">
        <n-flex :wrap="false" style="padding-top: 20px; padding-bottom: 21px">
          <div>
            <n-image
              width="160"
              :src="
                novelResult.value.cover
                  ? novelResult.value.cover
                  : coverPlaceholder
              "
              alt="cover"
              show-toolbar-tooltip
              style="border-radius: 2px"
            />
          </div>
          <n-flex vertical style="min-width: 0">
            <n-h2
              prefix="bar"
              style="margin: 8px 0"
              :style="{ 'font-size': isWideScreen ? '22px' : '18px' }"
            >
              <b>
                {{
                  novelResult.value.titleZh
                    ? novelResult.value.titleZh
                    : novelResult.value.title
                }}
              </b>
            </n-h2>

            <ReuseTagGroup label="作者" :tags="novelResult.value.authors" />
            <ReuseTagGroup label="画师" :tags="novelResult.value.artists" />
            <ReuseTagGroup
              label="出版"
              :tags="[
                novelResult.value.publisher ?? '未知出版商',
                novelResult.value.imprint ?? '未知文库',
              ]"
            />
          </n-flex>
        </n-flex>
      </div>
    </div>
  </div>

  <div class="layout-content">
    <c-result :result="novelResult" v-slot="{ value: metadata }">
      <n-flex>
        <router-link
          v-if="whoami.allowAdvancedFeatures"
          :to="`/wenku-edit/${novelId}`"
        >
          <c-button label="编辑" :icon="EditNoteOutlined" />
        </router-link>

        <favorite-button
          v-model:favored="metadata.favored"
          :novel="{ type: 'wenku', novelId }"
        />

        <c-button
          v-if="metadata.webIds.length > 0"
          label="网络"
          :icon="LanguageOutlined"
          @action="showWebNovelsModal = true"
        />

        <c-modal
          title="相关网络小说"
          v-model:show="showWebNovelsModal"
          :extra-height="100"
        >
          <n-ul>
            <n-li v-for="webId of metadata.webIds" :key="webId">
              <c-a :to="`/novel/${webId}`">
                {{ webId }}
              </c-a>
            </n-li>
          </n-ul>
        </c-modal>
      </n-flex>

      <n-p>原名：{{ metadata.title }}</n-p>
      <n-p v-if="metadata.latestPublishAt">
        最新出版于
        <n-time :time="metadata.latestPublishAt * 1000" type="date" />
      </n-p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <n-p v-html="metadata.introduction.replace(/\n/g, '<br />')" />

      <n-flex :size="[4, 4]">
        <router-link
          v-for="keyword of metadata.keywords"
          :key="keyword"
          :to="`/wenku?query=${keyword}\$`"
        >
          <novel-tag :tag="keyword" />
        </router-link>
      </n-flex>

      <template v-if="metadata.volumes.length">
        <c-x-scrollbar style="margin-top: 16px">
          <n-image-group show-toolbar-tooltip>
            <n-flex :size="4" :wrap="false" style="margin-bottom: 16px">
              <n-image
                v-for="volume of metadata.volumes"
                :key="volume.asin"
                width="104"
                :src="volume.cover"
                :preview-src="volume.coverHires ?? volume.cover"
                :alt="volume.asin"
                lazy
                style="border-radius: 2px"
              />
            </n-flex>
          </n-image-group>
        </c-x-scrollbar>
      </template>

      <section-header title="目录" />
      <template v-if="whoami.isSignedIn">
        <upload-button :allow-zh="whoami.isAdmin" :novel-id="novelId" />

        <translate-options
          ref="translateOptions"
          :gnid="GenericNovelId.wenku(novelId)"
          :glossary="metadata.glossary"
          style="margin-top: 16px"
        />
        <n-divider style="margin: 16px 0 0" />

        <n-list>
          <n-list-item
            v-for="volume of metadata.volumeJp"
            :key="volume.volumeId"
          >
            <WenkuVolume
              :novel-id="novelId"
              :volume="volume"
              :get-params="() => translateOptions!.getTranslateTaskParams()"
              @delete="deleteVolume(volume.volumeId)"
            />
          </n-list-item>
        </n-list>

        <template v-if="whoami.isAdmin">
          <n-divider style="margin: 0" />

          <n-ul>
            <n-li v-for="volumeId in metadata.volumeZh" :key="volumeId">
              <n-a
                :href="`/files-wenku/${novelId}/${encodeURIComponent(volumeId)}`"
                target="_blank"
                :download="volumeId"
              >
                {{ volumeId }}
              </n-a>

              <c-button-confirm
                v-if="whoami.asAdmin"
                :hint="`真的要删除《${volumeId}》吗？`"
                label="删除"
                text
                type="error"
                style="margin-left: 16px"
                @action="deleteVolume(volumeId)"
              />
            </n-li>
          </n-ul>
        </template>

        <n-empty
          v-if="
            metadata.volumeJp.length === 0 && metadata.volumeZh.length === 0
          "
          description="请不要创建一个空页面"
        />

        <n-empty
          v-if="
            !whoami.isAdmin &&
            metadata.volumeJp.length === 0 &&
            metadata.volumeZh.length > 0
          "
          description="网站已撤下中文小说板块，请上传日文生成翻译"
        />
      </template>
      <n-p v-else>游客无法查看内容，请先登录。</n-p>

      <comment-list
        v-if="!setting.hideCommmentWenkuNovel"
        :site="`wenku-${novelId}`"
        :locked="false"
      />
    </c-result>
  </div>
</template>
