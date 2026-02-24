<script lang="ts" setup>
import {
  EditNoteOutlined,
  LanguageOutlined,
  LinkOutlined,
} from '@vicons/material';
import { createReusableTemplate } from '@vueuse/core';

import { WebNovelApi } from '@/api';
import { buildNovelUrl } from '@/util/web/url';
import { WenkuNovelRepo } from '@/repos';
import coverPlaceholder from '@/image/cover_placeholder.png';
import { GenericNovelId } from '@/model/Common';
import type { WebNovelOutlineDto } from '@/model/WebNovel';
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

const showLinkWebModal = ref(false);
const linkSearchQuery = ref('');
const linkSearchLoading = ref(false);
const linkSearchResults = ref<WebNovelOutlineDto[]>([]);
const linkSelectedIds = ref<Set<string>>(new Set());
const linkSubmitting = ref(false);

const allProviders = 'kakuyomu,syosetu,novelup,hameln,pixiv,alphapolis';

async function openLinkWebModal() {
  if (!novel.value) return;
  showLinkWebModal.value = true;
  linkSearchQuery.value = novel.value.title;
  linkSelectedIds.value = new Set(novel.value.webIds);
  await searchWebNovels();
}

async function searchWebNovels() {
  if (!linkSearchQuery.value.trim()) return;
  linkSearchLoading.value = true;
  try {
    const result = await WebNovelApi.listNovel({
      query: linkSearchQuery.value,
      page: 0,
      pageSize: 20,
      provider: allProviders,
      sort: 2,
    });
    linkSearchResults.value = result.items;
  } catch {
    linkSearchResults.value = [];
  } finally {
    linkSearchLoading.value = false;
  }
}

function toggleSelect(webId: string) {
  const ids = new Set(linkSelectedIds.value);
  if (ids.has(webId)) {
    ids.delete(webId);
  } else {
    ids.add(webId);
  }
  linkSelectedIds.value = ids;
}

async function confirmLinkWeb() {
  linkSubmitting.value = true;
  await doAction(
    WenkuNovelRepo.linkWeb(novelId, { webIds: [...linkSelectedIds.value] }),
    '关联',
    message,
  );
  linkSubmitting.value = false;
  showLinkWebModal.value = false;
}

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
          v-if="whoami.hasNovelAccess"
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

        <c-button
          v-if="whoami.hasNovelAccess"
          label="关联网络小说"
          :icon="LinkOutlined"
          @action="openLinkWebModal()"
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

        <c-modal
          title="搜索关联网络小说"
          v-model:show="showLinkWebModal"
          :extra-height="100"
        >
          <n-flex vertical :size="12">
            <n-input-group>
              <n-input
                v-model:value="linkSearchQuery"
                placeholder="输入关键字搜索"
                clearable
                @keyup.enter="searchWebNovels()"
              />
              <n-button
                type="primary"
                :loading="linkSearchLoading"
                @click="searchWebNovels()"
              >
                搜索
              </n-button>
            </n-input-group>

            <n-spin :show="linkSearchLoading">
              <n-empty
                v-if="linkSearchResults.length === 0 && !linkSearchLoading"
                description="无搜索结果"
              />
              <n-list v-else bordered clickable>
                <n-list-item
                  v-for="item of linkSearchResults"
                  :key="`${item.providerId}/${item.novelId}`"
                  @click="toggleSelect(`${item.providerId}/${item.novelId}`)"
                >
                  <n-flex align="center" :size="8" :wrap="false">
                    <n-checkbox
                      :checked="
                        linkSelectedIds.has(
                          `${item.providerId}/${item.novelId}`,
                        )
                      "
                      @update:checked="
                        toggleSelect(`${item.providerId}/${item.novelId}`)
                      "
                      @click.stop
                    />
                    <n-flex vertical :size="2" style="min-width: 0">
                      <router-link
                        :to="`/novel/${item.providerId}/${item.novelId}`"
                        target="_blank"
                        @click.stop
                        style="
                          font-weight: bold;
                          color: inherit;
                          text-decoration: none;
                        "
                      >
                        {{ item.titleJp }}
                      </router-link>
                      <n-text
                        v-if="item.titleZh"
                        depth="3"
                        style="font-size: 13px"
                      >
                        {{ item.titleZh }}
                      </n-text>
                      <n-flex :size="4" align="center">
                        <n-a
                          :href="buildNovelUrl(item.providerId, item.novelId)"
                          target="_blank"
                          @click.stop
                          style="
                            font-size: 12px;
                            color: inherit;
                            text-decoration: none;
                          "
                        >
                          {{ item.providerId }}/{{ item.novelId }}
                        </n-a>
                        <n-tag size="small" :bordered="false">
                          {{ item.total }}话
                        </n-tag>
                        <n-tag
                          v-if="item.wenkuId"
                          size="small"
                          :bordered="false"
                          :type="
                            item.wenkuId === novelId ? 'success' : 'warning'
                          "
                        >
                          {{
                            item.wenkuId === novelId
                              ? '已关联本页'
                              : '已关联其他'
                          }}
                        </n-tag>
                      </n-flex>
                    </n-flex>
                  </n-flex>
                </n-list-item>
              </n-list>
            </n-spin>
          </n-flex>

          <template #action>
            <n-button
              type="primary"
              :loading="linkSubmitting"
              @click="confirmLinkWeb()"
            >
              确认关联
            </n-button>
          </template>
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

    <CResultX v-else :error="error" title="加载错误" />
  </div>
</template>
