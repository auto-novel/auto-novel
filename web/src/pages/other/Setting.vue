<script lang="ts" setup>
import SoundAllTaskCompleted from '@/sound/all_task_completed.mp3';
import {
  Setting,
  useSettingStore,
  useWebSearchHistoryStore,
  useWenkuSearchHistoryStore,
} from '@/stores';
import { InfoOutlined } from '@vicons/material';

const message = useMessage();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const clearWebSearchHistory = () => {
  useWebSearchHistoryStore().clear();
  message.success('清空成功');
};

const clearWenkuSearchHistory = () => {
  useWenkuSearchHistoryStore().clear();
  message.success('清空成功');
};

const playSound = (source: string) => {
  return new Audio(source).play();
};
</script>

<template>
  <div class="layout-content">
    <n-h1>设置</n-h1>

    <n-list bordered>
      <n-list-item>
        <n-flex vertical>
          <b>主题</b>
          <c-radio-group
            v-model:value="setting.theme"
            :options="Setting.themeOptions"
            size="small"
          />
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical>
          <b>快捷键说明</b>
          <n-ul>
            <n-li>列表页面，可以使用左右方向键翻页。</n-li>
            <n-li>
              GPT/Sakura/Murasaki排队按钮，按住Ctrl键点击，会将任务自动置顶。
            </n-li>
            <n-li>阅读页面，可以使用左右方向键跳转上/下一章。</n-li>
            <n-li>阅读页面，可以使用数字键1～5快速切换翻译。</n-li>
          </n-ul>
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical>
          <b>网络小说目录</b>
          <n-checkbox v-model:checked="setting.tocCollapseInNarrowScreen">
            目录折叠在侧边栏 (移动端)
          </n-checkbox>
          <n-checkbox v-model:checked="setting.tocExpandAll">
            目录默认展开所有章节
            <n-tooltip trigger="hover" placement="top" style="max-width: 400px">
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
            </n-tooltip>
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
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical>
          <b>工作区</b>
          <n-checkbox v-model:checked="setting.autoTopJobWhenAddTask">
            工作区添加时自动置顶
          </n-checkbox>
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical>
          <b>列表分页方式</b>
          <c-radio-group
            v-model:value="setting.paginationMode"
            :options="Setting.paginationModeOptions"
            size="small"
          />
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical>
          <b>显示的翻译按钮</b>
          <translator-check
            v-model:value="setting.enabledTranslator"
            size="small"
          />
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical>
          <b>工作区语音提醒</b>
          <n-flex :wrap="false" :size="0">
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
          </n-flex>
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical align="start">
          <b>清空搜索历史</b>
          <n-flex>
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
          </n-flex>
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical>
          <b>黑名单</b>
          <n-flex>
            <user-block-button />
          </n-flex>
        </n-flex>
      </n-list-item>

      <n-list-item>
        <n-flex vertical>
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
        </n-flex>
      </n-list-item>
    </n-list>
  </div>
</template>
