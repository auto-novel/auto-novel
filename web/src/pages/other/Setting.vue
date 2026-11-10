<script lang="ts" setup>
import {
  Toast,
  useWebKit,
  XPage,
  XPageHeader,
  XTooltip,
} from '@novelia/web-kit';
import SoundAllTaskCompleted from '@/sound/all_task_completed.mp3';
import {
  Setting,
  useSettingStore,
  useWebSearchHistoryStore,
  useWenkuSearchHistoryStore,
} from '@/stores';
import { InfoOutlined } from '@vicons/material';

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const clearWebSearchHistory = () => {
  useWebSearchHistoryStore().clear();
  Toast.success('清空成功');
};

const clearWenkuSearchHistory = () => {
  useWenkuSearchHistoryStore().clear();
  Toast.success('清空成功');
};

const playSound = (source: string) => {
  return new Audio(source).play();
};
const { theme } = useWebKit();
</script>

<template>
  <XPage>
    <XPageHeader title="设置" />

    <n-list bordered>
      <n-list-item>
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <b>主题</b>
          <c-radio-group
            :value="theme.preference.value"
            @update:value="theme.setPreference($event)"
            :options="Setting.themeOptions"
            size="small"
          />
        </div>
      </n-list-item>

      <n-list-item>
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <b>快捷键说明</b>
          <ul class="content-list">
            <li>列表页面，可以使用左右方向键翻页。</li>
            <li>
              GPT/Sakura排队按钮，按住 Ctrl（macOS 为
              Cmd）键点击，会将任务自动置顶。
            </li>
            <li>
              小说/文库页面，可以用数字键切换底部分页，也可在分页区域内单指左右滑动切换。
            </li>
            <li>阅读页面，可以使用左右方向键跳转上/下一章。</li>
            <li>阅读页面，可以使用数字键1～3快速切换翻译。</li>
          </ul>
        </div>
      </n-list-item>

      <n-list-item>
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <b>网络小说目录</b>
          <n-checkbox v-model:checked="setting.tocCollapseInNarrowScreen">
            目录折叠在侧边栏 (移动端)
          </n-checkbox>
          <n-checkbox v-model:checked="setting.tocExpandAll">
            目录默认展开所有章节
            <XTooltip class="max-w-100">
              <template #trigger>
                <n-button text @click.stop>
                  <n-icon depth="4" :component="InfoOutlined" size="12" />
                </n-button>
              </template>
              开启：默认展开所有章节（可能导致性能问题）
              <br />
              关闭：只展开上次阅读的章节（如无记录则展开第一个章节）
              <br />
              不影响无分章的网络小说
            </XTooltip>
          </n-checkbox>
          <b>评论</b>
          <n-checkbox v-model:checked="setting.hideCommmentWebNovel">
            隐藏网络小说评论
          </n-checkbox>
          <n-checkbox v-model:checked="setting.hideCommmentWenkuNovel">
            隐藏文库小说评论
          </n-checkbox>
          <b>收藏夹</b>
          <n-checkbox v-model:checked="setting.showTagInWebFavored">
            显示收藏夹里网络小说的标签
          </n-checkbox>
          <n-checkbox v-model:checked="setting.favoriteCreateTimeFirst">
            收藏时间排序优先
          </n-checkbox>
        </div>
      </n-list-item>

      <n-list-item>
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <b>工作区</b>
          <n-checkbox v-model:checked="setting.autoTopJobWhenAddTask">
            工作区添加时自动置顶
          </n-checkbox>
        </div>
      </n-list-item>

      <n-list-item>
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <b>列表分页方式</b>
          <c-radio-group
            v-model:value="setting.paginationMode"
            :options="Setting.paginationModeOptions"
            size="small"
          />
        </div>
      </n-list-item>

      <n-list-item>
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <b>显示的翻译按钮</b>
          <translator-check
            v-model:value="setting.enabledTranslator"
            size="small"
          />
        </div>
      </n-list-item>

      <n-list-item>
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <b>工作区语音提醒</b>
          <div class="flex flex-nowrap justify-start gap-0">
            <n-checkbox v-model:checked="setting.workspaceSound">
              任务全部完成
            </n-checkbox>

            [
            <c-button
              label="点击播放"
              text
              type="primary"
              @action="playSound(SoundAllTaskCompleted)"
            />
            ]
          </div>
        </div>
      </n-list-item>

      <n-list-item>
        <div
          class="flex flex-col flex-nowrap justify-start items-start gap-x-3 gap-y-2"
        >
          <b>清空搜索历史</b>
          <div class="flex flex-wrap justify-start gap-x-3 gap-y-2">
            <c-button
              label="清空网络搜索历史"
              size="small"
              @action="clearWebSearchHistory"
            />
            <c-button
              label="清空文库搜索历史"
              size="small"
              @action="clearWenkuSearchHistory"
            />
          </div>
        </div>
      </n-list-item>

      <n-list-item>
        <div class="flex flex-col flex-nowrap justify-start gap-x-3 gap-y-2">
          <b>语言</b>
          简繁转换目前只覆盖web章节内容。
          <c-radio-group
            v-model:value="setting.locale"
            :options="Setting.localeOptions"
            size="small"
          />
          <n-checkbox v-model:checked="setting.searchLocaleAware">
            支持繁体搜索（不稳定）
          </n-checkbox>
        </div>
      </n-list-item>
    </n-list>
  </XPage>
</template>
