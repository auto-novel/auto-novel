<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';
import { vHorizontalDrag } from '@/util/dragScroll';
import { getApiErrorMessage, Toast, XPage, XTime } from '@novelia/web-kit';
import { EditNoteOutlined, LanguageOutlined } from '@vicons/material';
import { createReusableTemplate } from '@vueuse/core';

import { externalImageUrls } from '@/config';
import { subjectKeys } from '@/api/commentSubject';
import { GenericNovelId } from '@/model/Common';
import type { VolumeJpDto } from '@/model/WenkuNovel';
import NovelBottomTabs from '@/pages/novel/components/NovelBottomTabs.vue';
import { useIsWideScreen } from '@/pages/util';
import { WenkuNovelRepo } from '@/repos';
import { useSettingStore, useWhoamiStore } from '@/stores';
import NovelDetailSkeleton from './components/NovelDetailSkeleton.vue';

const { novelId } = defineProps<{ novelId: string }>();

const [DefineTagGroup, ReuseTagGroup] = createReusableTemplate<{
  label: string;
  tags: string[];
}>();

const isWideScreen = useIsWideScreen(600);

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
  Toast.promise(WenkuNovelRepo.deleteVolume(novelId, volumeId), {
    success: '删除成功',
    error: (reason) => getApiErrorMessage(reason, '删除失败'),
  }).catch(() => {});

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
    <div class="flex gap-x-3" v-if="tags.length > 0">
      <n-tag :bordered="false" size="small">
        {{ label }}
      </n-tag>
      <div class="flex flex-wrap gap-1">
        <router-link v-for="tag of tags" :key="tag" :to="buildSearchLink(tag)">
          <novel-tag :tag="tag" />
        </router-link>
      </div>
    </div>
  </DefineTagGroup>

  <div
    v-if="novel"
    :style="{
      backgroundImage: `url(${novel.cover})`,
    }"
    class="w-full bg-cover bg-position-[center_15%] [clip:rect(0,auto,auto,0)]"
  >
    <div class="relative isolate h-full w-full backdrop-blur-sm">
      <!-- 渐变遮罩固定透明度，背景色沿用全局主题过渡。 -->
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 -z-10 bg-body mask-linear-180 mask-linear-from-black/50 mask-linear-to-black"
      />
      <div class="mx-auto w-full max-w-5xl px-3 sm:px-8">
        <div class="flex gap-x-3 pt-5 pb-5.25">
          <div class="flex-[0_0_160px]">
            <n-image
              width="160"
              :src="
                novel.cover
                  ? novel.cover
                  : externalImageUrls.wenkuCoverPlaceholder
              "
              alt="cover"
              show-toolbar-tooltip
              class="rounded-[2px]"
            />
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-y-2">
            <h2
              class="heading-bar mx-0 my-2"
              :class="isWideScreen ? 'text-[22px]' : 'text-[18px]'"
            >
              <b>
                {{ novel.titleZh ? novel.titleZh : novel.title }}
              </b>
            </h2>

            <ReuseTagGroup label="作者" :tags="novel.authors" />
            <ReuseTagGroup label="画师" :tags="novel.artists" />
            <ReuseTagGroup
              label="出版"
              :tags="[
                novel.publisher ?? '未知出版商',
                novel.imprint ?? '未知文库',
              ]"
            />
          </div>
        </div>
      </div>
    </div>
  </div>

  <XPage>
    <NovelDetailSkeleton wenku v-if="!novel && !error" />
    <UAlert
      color="error"
      variant="soft"
      v-else-if="!novel && error"
      title="加载错误"
      :description="error.message"
    />
    <template v-else-if="novel">
      <div class="flex flex-wrap gap-x-3 gap-y-2">
        <UButton
          :icon="EditNoteOutlined"
          v-if="whoami.hasNovelAccess"
          :to="`/wenku-edit/${novelId}`"
          color="neutral"
          variant="outline"
        >
          编辑
        </UButton>

        <favorite-button
          :favored="novel.favored"
          :novel="{ type: 'wenku', novelId }"
        />

        <UButton
          :icon="LanguageOutlined"
          color="neutral"
          variant="outline"
          v-if="novel.webIds.length > 0"
          @click="showWebNovelsModal = true"
        >
          网络
        </UButton>

        <UModal
          :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
          title="相关网络小说"
          v-model:open="showWebNovelsModal"
          class="w-150"
        >
          <template #body>
            <ul class="content-list">
              <li v-for="webId of novel.webIds" :key="webId">
                <ULink :to="`/novel/${webId}`">
                  {{ webId }}
                </ULink>
              </li>
            </ul>
          </template>
        </UModal>
      </div>

      <p class="my-4 text-sm leading-[1.6] text-ink first:mt-0 last:mb-0">
        原名：{{ novel.title }}
      </p>
      <p
        class="my-4 text-sm leading-[1.6] text-ink first:mt-0 last:mb-0"
        v-if="novel.latestPublishAt"
      >
        最新出版于
        <XTime :time="novel.latestPublishAt * 1000" format="yyyy-MM-dd" />
      </p>
      <!-- eslint-disable vue/no-v-html -->
      <p
        class="my-4 text-sm leading-[1.6] text-ink first:mt-0 last:mb-0"
        v-html="novel.introduction.replace(/\n/g, '<br />')"
      />
      <!-- eslint-enable vue/no-v-html -->

      <div class="flex flex-wrap gap-1">
        <router-link
          v-for="keyword of novel.keywords"
          :key="keyword"
          :to="`/wenku?query=${keyword}\$`"
        >
          <novel-tag :tag="keyword" />
        </router-link>
      </div>

      <template v-if="novel.volumes.length">
        <UScrollArea orientation="horizontal" v-horizontal-drag class="mt-4">
          <n-image-group show-toolbar-tooltip>
            <div class="mb-4 flex gap-1">
              <n-image
                v-for="volume of novel.volumes"
                :key="volume.asin"
                width="104"
                :src="volume.cover"
                :preview-src="volume.coverHires ?? volume.cover"
                :alt="volume.asin"
                lazy
                class="w-[104px] flex-[0_0_104px] rounded-[2px]"
              />
            </div>
          </n-image-group>
        </UScrollArea>
      </template>

      <NovelBottomTabs
        :gnid="GenericNovelId.wenku(novelId)"
        :glossary="novel.glossary"
        :site="subjectKeys.novel.wenku(novelId)"
        :hide-comment="setting.hideCommmentWenkuNovel"
        :locked="false"
      >
        <template #commentNotice>
          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="公告"
            :ui="{ description: 'break-words' }"
            role="alert"
            class="mb-3"
          >
            <template #description>
              近期有人在评论区到处冒充文库本的上传者，请勿相信此类评论（世界很奇妙吧，啥人都有）
            </template>
          </UAlert>
        </template>

        <template #wenkuToc>
          <template v-if="whoami.isSignedIn">
            <br />
            <upload-button :allow-zh="whoami.isAdmin" :novel-id="novelId" />

            <TranslateOptions
              ref="translateOptions"
              :gnid="GenericNovelId.wenku(novelId)"
              class="mt-4"
            />
            <div class="mt-4 flex flex-wrap gap-x-3 gap-y-2">
              <DownloadOptionsButton class="rounded-md" />
            </div>
            <USeparator class="mx-0 mt-4 mb-0" />

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
              <USeparator class="m-0" />

              <ul class="content-list">
                <li v-for="volumeId in novel.volumeZh" :key="volumeId">
                  <ULink
                    :href="`/files-wenku/${novelId}/${encodeURIComponent(volumeId)}`"
                    target="_blank"
                    :download="volumeId"
                    external
                  >
                    {{ volumeId }}
                  </ULink>

                  <ConfirmActionButton
                    v-if="whoami.asAdmin"
                    :hint="`真的要删除《${volumeId}》吗？`"
                    color="error"
                    variant="link"
                    class="ml-4 p-0 leading-none"
                    label="删除"
                    :action="() => deleteVolume(volumeId)"
                  />
                </li>
              </ul>
            </template>

            <CEmpty
              inline
              v-if="novel.volumeJp.length === 0 && novel.volumeZh.length === 0"
              title="请不要创建一个空页面"
            />

            <CEmpty
              inline
              v-if="
                !whoami.isAdmin &&
                novel.volumeJp.length === 0 &&
                novel.volumeZh.length > 0
              "
              title="网站已撤下中文小说板块，请上传日文生成翻译"
            />
          </template>
          <p
            class="my-4 text-sm leading-[1.6] text-ink first:mt-0 last:mb-0"
            v-else
          >
            游客无法查看内容，请先登录。
          </p>
        </template>
      </NovelBottomTabs>
    </template>
  </XPage>
</template>
