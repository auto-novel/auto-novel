<script lang="ts" setup>
import { EditNoteOutlined, LanguageOutlined } from '@vicons/material';
import { createReusableTemplate } from '@vueuse/core';

import { WenkuNovelRepo } from '@/repos';
import coverPlaceholder from '@/image/cover_placeholder.png';
import { GenericNovelId } from '@/model/Common';
import { doAction, useIsWideScreen } from '@/pages/util';
import { useSettingStore, useWhoamiStore } from '@/stores';
import type { VolumeJpDto } from '@/model/WenkuNovel';

const { novelId } = defineProps<{ novelId: string }>();

const [DefineTagGroup, ReuseTagGroup] = createReusableTemplate<{
  label: string;
  tags: string[];
}>();

const isWideScreen = useIsWideScreen(600);
const message = useMessage();
const vars = useThemeVars();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const { data: novel, error } = WenkuNovelRepo.useWenkuNovel(novelId);

watch(novel, (novel) => {
  if (novel) {
    document.title = novel.title;
  }
});

const translateOptions = useTemplateRef('translateOptions');

const deleteVolume = (volumeId: string) =>
  doAction(WenkuNovelRepo.deleteVolume(novelId, volumeId), '删除', message);

const buildSearchLink = (tag: string) => `/wenku?query="${tag}"`;

const showWebNovelsModal = ref(false);

function normalize(title: string) {
  return title
    .normalize('NFKC') // 归一化、全角转半角
    .replace(/\((\d+)\)/g, (_, p1: string) => p1.padStart(2, '0')) // (\d+) -> \d+
    .replace(/\[(\d+)\]/g, (_, p1: string) => p1.padStart(2, '0')) // [\d+] -> \d+
    .replace(/\d+/g, (m) => m.padStart(2, '0')) // \d+ -> \d+
    .replace(/\[[^\]]*\]/g, '') // 移除 [..]
    .replace(/【[^】]*】/g, '') // 移除 【..】
    .replace(/\([^\)]*\)/g, '') // 移除 (..)
    .replace(/\s+/g, ''); // 去除空格
}
function sortJpVolumes(volumeJp: VolumeJpDto[]) {
  return volumeJp.slice().sort((a, b) => {
    const na = normalize(a.volumeId);
    const nb = normalize(b.volumeId);
    return na.localeCompare(nb, 'ja', { numeric: true, sensitivity: 'base' });
  });
}
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
    v-if="novel"
    :style="{
      background: `url(${novel.cover})`,
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
              :src="novel.cover ? novel.cover : coverPlaceholder"
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
                {{ novel.titleZh ? novel.titleZh : novel.title }}
              </b>
            </n-h2>

            <ReuseTagGroup label="作者" :tags="novel.authors" />
            <ReuseTagGroup label="画师" :tags="novel.artists" />
            <ReuseTagGroup
              label="出版"
              :tags="[
                novel.publisher ?? '未知出版商',
                novel.imprint ?? '未知文库',
              ]"
            />
          </n-flex>
        </n-flex>
      </div>
    </div>
  </div>

  <div class="layout-content">
    <template v-if="novel">
      <n-flex>
        <router-link
          v-if="whoami.allowAdvancedFeatures"
          :to="`/wenku-edit/${novelId}`"
        >
          <c-button label="编辑" :icon="EditNoteOutlined" />
        </router-link>

        <favorite-button
          v-model:favored="novel.favored"
          :novel="{ type: 'wenku', novelId }"
        />

        <c-button
          v-if="novel.webIds.length > 0"
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
            <n-li v-for="webId of novel.webIds" :key="webId">
              <c-a :to="`/novel/${webId}`">
                {{ webId }}
              </c-a>
            </n-li>
          </n-ul>
        </c-modal>
      </n-flex>

      <n-p>原名：{{ novel.title }}</n-p>
      <n-p v-if="novel.latestPublishAt">
        最新出版于
        <n-time :time="novel.latestPublishAt * 1000" type="date" />
      </n-p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <n-p v-html="novel.introduction.replace(/\n/g, '<br />')" />

      <n-flex :size="[4, 4]">
        <router-link
          v-for="keyword of novel.keywords"
          :key="keyword"
          :to="`/wenku?query=${keyword}\$`"
        >
          <novel-tag :tag="keyword" />
        </router-link>
      </n-flex>

      <template v-if="novel.volumes.length">
        <c-x-scrollbar style="margin-top: 16px">
          <n-image-group show-toolbar-tooltip>
            <n-flex :size="4" :wrap="false" style="margin-bottom: 16px">
              <n-image
                v-for="volume of novel.volumes"
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

        <TranslateOptions
          ref="translateOptions"
          :gnid="GenericNovelId.wenku(novelId)"
          :glossary="novel.glossary"
          style="margin-top: 16px"
        />
        <n-divider style="margin: 16px 0 0" />

        <n-list>
          <n-list-item
            v-for="volume of sortJpVolumes(novel.volumeJp)"
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
            <n-li v-for="volumeId in novel.volumeZh" :key="volumeId">
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
          v-if="novel.volumeJp.length === 0 && novel.volumeZh.length === 0"
          description="请不要创建一个空页面"
        />

        <n-empty
          v-if="
            !whoami.isAdmin &&
            novel.volumeJp.length === 0 &&
            novel.volumeZh.length > 0
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
    </template>

    <n-result
      v-else-if="error"
      status="error"
      title="加载错误"
      :description="error.message"
    />
  </div>
</template>
