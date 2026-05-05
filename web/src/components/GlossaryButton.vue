<script lang="ts" setup>
import { DeleteOutlineOutlined } from '@vicons/material';

import { WebNovelApi, WenkuNovelApi } from '@/api';
import { GenericNovelId } from '@/model/Common';
import { Glossary } from '@/model/Glossary';
import {
  GlossaryGroup,
  type GlossaryGroupMap,
  type GlossaryEntry,
} from '@/model/GlossaryGroup';
import { copyToClipBoard, doAction } from '@/pages/util';
import { useLocalVolumeStore, useWhoamiStore } from '@/stores';
import { downloadFile } from '@/util';
import { useWindowSize } from '@vueuse/core';
import GlossaryTermTable from './GlossaryTermTable.vue';
import GlossaryGroupTabs from './GlossaryGroupTabs.vue';

const props = defineProps<{
  gnid?: GenericNovelId;
  value: Glossary;
}>();

const message = useMessage();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const glossary = ref<Glossary>({});

const showGlossaryModal = ref(false);

const novelId = computed(() => {
  const gnid = props.gnid;
  if (!gnid) return '';
  return GenericNovelId.toString(gnid);
});

const { width } = useWindowSize();
const isNarrow = computed(() => width.value < 600);

const toggleGlossaryModal = () => {
  if (showGlossaryModal.value === false) {
    glossary.value = { ...props.value };
    GlossaryGroup.syncUngrouped(novelId.value, glossary.value);
    loadGroups();
    selectedGroup.value = undefined;
    selectedTerms.value = new Set();
  }
  showGlossaryModal.value = !showGlossaryModal.value;
};

// ========== 分组相关 ==========
const groups = ref<GlossaryGroupMap>({});
const groupOrder = ref<string[]>([]);
const selectedGroup = ref<string | undefined>(undefined);
const newGroupName = ref('');
const showNewGroupInput = ref(false);
const editingGroupName = ref<string | null>(null);
const editingGroupNewName = ref('');

function loadGroups() {
  if (!novelId.value) return;
  groups.value = GlossaryGroup.getGroups(novelId.value);
  groupOrder.value = GlossaryGroup.getGroupOrder(novelId.value);
}

function saveGroups() {
  if (!novelId.value) return;
  GlossaryGroup.saveGroups(novelId.value, groups.value, groupOrder.value);
}

// 监听跨标签页变更
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (
      e.key === GlossaryGroup.storageKeyFor(novelId.value) &&
      e.newValue !== null
    ) {
      try {
        groups.value = GlossaryGroup.getGroups(novelId.value);
        groupOrder.value = GlossaryGroup.getGroupOrder(novelId.value);
      } catch {
        /* ignore */
      }
    }
  });
}

const displayData = computed<GlossaryGroupMap>(() => {
  if (!novelId.value) {
    const result: GlossaryGroupMap = {};
    result['未分组'] = Object.entries(glossary.value).map(([jp, zh]) => ({
      jp,
      zh,
    }));
    return result;
  }
  return GlossaryGroup.buildDisplayData(
    groups.value,
    glossary.value,
    groupOrder.value,
  );
});

const groupNames = computed(() => {
  return groupOrder.value.filter((n) => n in displayData.value);
});

const currentGroupEntries = computed<GlossaryEntry[]>(() => {
  const name = selectedGroup.value;
  if (!name) return [];
  return displayData.value[name] ?? [];
});

const ungroupedEntries = computed<GlossaryEntry[]>(() => {
  return displayData.value['未分组'] ?? [];
});

function isInServerGlossary(jp: string): boolean {
  return jp in glossary.value;
}

function getLocalZh(jp: string): string | undefined {
  if (!novelId.value) return undefined;
  const g = GlossaryGroup.getGroups(novelId.value);
  for (const entries of Object.values(g)) {
    const found = entries.find((e) => e.jp === jp);
    if (found) return found.zh;
  }
  return undefined;
}

function isZhConflict(jp: string): boolean {
  const localZh = getLocalZh(jp);
  return localZh !== undefined && localZh !== glossary.value[jp];
}

function addNewGroup() {
  const name = newGroupName.value.trim();
  if (!name) return;
  if (name === '未分组') {
    message.warning('不能使用保留名称');
    return;
  }
  if (groups.value[name]) {
    message.warning('分组名已存在');
    return;
  }
  groups.value[name] = [];
  saveGroups();
  newGroupName.value = '';
  showNewGroupInput.value = false;
}

function startRename(groupName: string) {
  editingGroupName.value = groupName;
  editingGroupNewName.value = groupName;
}

function finishRename() {
  const oldName = editingGroupName.value;
  const newName = editingGroupNewName.value.trim();
  if (oldName && newName && oldName !== newName) {
    if (newName === '未分组') {
      message.warning('不能使用保留名称');
    } else if (groups.value[newName]) {
      message.warning('分组名已存在');
    } else {
      GlossaryGroup.renameGroup(novelId.value, oldName, newName);
      loadGroups();
      if (selectedGroup.value === oldName) selectedGroup.value = newName;
    }
  }
  editingGroupName.value = null;
  editingGroupNewName.value = '';
}

function deleteCurrentGroup(groupName?: string) {
  const name = groupName ?? selectedGroup.value;
  if (!name) return;
  GlossaryGroup.deleteGroup(novelId.value, name);
  loadGroups();
  if (selectedGroup.value === name) selectedGroup.value = undefined;
}

function removeTermFromCurrentGroup(jp: string) {
  if (!novelId.value) return;
  const zh = glossary.value[jp] ?? getLocalZh(jp) ?? '';
  GlossaryGroup.removeTerm(novelId.value, jp);
  GlossaryGroup.addToUngrouped(novelId.value, jp, zh);
  loadGroups();
}

function onDropTerm(jp: string | string[], groupName: string | undefined) {
  if (!novelId.value) return;
  const jps = Array.isArray(jp) ? jp : [jp];
  for (const j of jps) {
    if (!groupName || groupName === '未分组') {
      const zh = glossary.value[j] ?? getLocalZh(j) ?? '';
      GlossaryGroup.removeTerm(novelId.value, j);
      GlossaryGroup.addToUngrouped(novelId.value, j, zh);
    } else {
      const zh = glossary.value[j] ?? getLocalZh(j) ?? '';
      GlossaryGroup.moveTerm(novelId.value, j, zh, groupName);
    }
  }
  loadGroups();
}

function onDeleteGroupRequest(name: string) {
  const entries = displayData.value[name];
  if (!entries || entries.length === 0) {
    GlossaryGroup.deleteGroup(novelId.value, name);
    loadGroups();
    if (selectedGroup.value === name) selectedGroup.value = undefined;
  } else {
    deleteGroupConfirmName.value = name;
  }
}

const deleteGroupConfirmName = ref<string | null>(null);
const showDeleteGroupConfirm = computed({
  get: () => deleteGroupConfirmName.value !== null,
  set: (v: boolean) => {
    if (!v) deleteGroupConfirmName.value = null;
  },
});
const deleteGroupConfirmCount = computed(() => {
  const name = deleteGroupConfirmName.value;
  if (!name) return 0;
  return displayData.value[name]?.length ?? 0;
});

function confirmDeleteGroup() {
  const name = deleteGroupConfirmName.value;
  if (!name || !novelId.value) return;
  GlossaryGroup.deleteGroup(novelId.value, name);
  deleteGroupConfirmName.value = null;
  loadGroups();
  if (selectedGroup.value === name) selectedGroup.value = undefined;
}

function onReorderGroups(from: string, to: string) {
  if (!novelId.value) return;
  const order = [...groupOrder.value];
  const fromIdx = order.indexOf(from);
  if (fromIdx === -1) return;
  order.splice(fromIdx, 1);
  if (to) {
    const toIdx = order.indexOf(to);
    if (toIdx === -1) return;
    order.splice(toIdx, 0, from);
  } else {
    order.push(from);
  }
  groupOrder.value = order;
  GlossaryGroup.saveGroups(novelId.value, groups.value, order);
}

function handleSortByTime() {
  if (!novelId.value) return;
  const name = selectedGroup.value ?? '未分组';
  GlossaryGroup.sortGroupByTime(novelId.value, name, glossary.value, false);
  loadGroups();
}

function handleSortByTimeReverse() {
  if (!novelId.value) return;
  const name = selectedGroup.value ?? '未分组';
  GlossaryGroup.sortGroupByTime(novelId.value, name, glossary.value, true);
  loadGroups();
}

function handleSortByKana() {
  if (!novelId.value) return;
  const name = selectedGroup.value ?? '未分组';
  GlossaryGroup.sortGroupByKana(novelId.value, name, false);
  loadGroups();
}

function handleSortByKanaReverse() {
  if (!novelId.value) return;
  const name = selectedGroup.value ?? '未分组';
  GlossaryGroup.sortGroupByKana(novelId.value, name, true);
  loadGroups();
}

// ========== 多选相关 ==========
const selectedTerms = ref<Set<string>>(new Set());
const lastClickedJp = ref<string | null>(null);

function toggleSelect(jp: string, event: MouseEvent) {
  if (event.ctrlKey || event.metaKey) {
    const next = new Set(selectedTerms.value);
    if (next.has(jp)) next.delete(jp);
    else next.add(jp);
    selectedTerms.value = next;
    lastClickedJp.value = jp;
  } else if (event.shiftKey && lastClickedJp.value) {
    const entries = currentListEntries();
    const prevIdx = entries.findIndex((e) => e.jp === lastClickedJp.value);
    const curIdx = entries.findIndex((e) => e.jp === jp);
    if (prevIdx >= 0 && curIdx >= 0) {
      const start = Math.min(prevIdx, curIdx);
      const end = Math.max(prevIdx, curIdx);
      const next = new Set(selectedTerms.value);
      for (let i = start; i <= end; i++) next.add(entries[i].jp);
      selectedTerms.value = next;
    }
  } else {
    if (selectedTerms.value.size === 1 && selectedTerms.value.has(jp)) {
      selectedTerms.value = new Set();
      lastClickedJp.value = null;
    } else {
      selectedTerms.value = new Set([jp]);
      lastClickedJp.value = jp;
    }
  }
}

function currentListEntries(): GlossaryEntry[] {
  if (selectedGroup.value) return currentGroupEntries.value;
  return ungroupedEntries.value;
}

function clearSelection() {
  selectedTerms.value = new Set();
  lastClickedJp.value = null;
}

function batchDeleteSelected() {
  const toDelete = [...selectedTerms.value].filter((jp) =>
    isInServerGlossary(jp),
  );
  if (toDelete.length === 0) return;
  for (const jp of toDelete) {
    deletedTerms.value.push([jp, glossary.value[jp]]);
    delete glossary.value[jp];
  }
  if (novelId.value) {
    for (const jp of toDelete) GlossaryGroup.removeTerm(novelId.value, jp);
    loadGroups();
  }
  clearSelection();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Delete' && selectedTerms.value.size > 0) {
    batchDeleteSelected();
  }
  if (e.key === 'Escape') {
    clearSelection();
  }
}

// ========== 单向同步 ==========
/** 远程 → 本地：用服务端术语表覆盖当前编辑 */
function syncRemoteToLocal() {
  glossary.value = { ...props.value };
  loadGroups();
  message.success('已从远程同步到本地编辑');
}

/** 本地 → 编辑区：将本地分组中缓存的 zh 批量写入当前编辑术语表 */
function syncLocalToEditing() {
  if (!novelId.value) return;
  let count = 0;
  const localGroups = GlossaryGroup.getGroups(novelId.value);
  for (const entries of Object.values(localGroups)) {
    for (const e of entries) {
      if (e.jp in glossary.value && glossary.value[e.jp] !== e.zh) {
        glossary.value[e.jp] = e.zh;
        count++;
      }
    }
  }
  message.success(`已将 ${count} 条本地 zh 同步到编辑区`);
}

// ========== 术语 CRUD ==========
const importGlossaryRaw = ref('');
const termsToAdd = ref<[string, string]>(['', '']);
const deletedTerms = ref<[string, string][]>([]);

const lastDeletedTerm = computed(() => {
  const last = deletedTerms.value[deletedTerms.value.length - 1];
  if (last === undefined) return undefined;
  return `${last[0]} => ${last[1]}`;
});

const clearTerm = () => {
  glossary.value = {};
  if (novelId.value) GlossaryGroup.clearGroups(novelId.value);
  loadGroups();
};

const showClearConfirm = ref(false);

const undoDeleteTerm = () => {
  if (deletedTerms.value.length === 0) return;
  const [jp, zh] = deletedTerms.value.pop()!;
  glossary.value[jp] = zh;
  loadGroups();
};

const deleteTerm = (jp: string) => {
  if (jp in glossary.value) {
    deletedTerms.value.push([jp, glossary.value[jp]]);
    delete glossary.value[jp];
    loadGroups();
  }
};

const revertTerm = (jp: string) => {
  if (!novelId.value) return;
  const g = GlossaryGroup.getGroups(novelId.value);
  for (const [, entries] of Object.entries(g)) {
    const found = entries.find((e) => e.jp === jp);
    if (found) {
      glossary.value = { ...glossary.value, [jp]: found.zh };
      loadGroups();
      return;
    }
  }
};

const revertToLocalZh = (jp: string) => {
  const localZh = getLocalZh(jp);
  if (localZh !== undefined) glossary.value[jp] = localZh;
};

const clearLocalRecord = (jp: string) => {
  if (!novelId.value) return;
  GlossaryGroup.removeTerm(novelId.value, jp);
  loadGroups();
};

const addTerm = () => {
  const [jp, zh] = termsToAdd.value;
  if (jp && zh) {
    glossary.value[jp.trim()] = zh.trim();
    termsToAdd.value = ['', ''];
    loadGroups();
  }
};

const exportGlossary = async (ev: MouseEvent) => {
  const isSuccess = await copyToClipBoard(
    Glossary.toText(glossary.value),
    ev.target as HTMLElement,
  );
  if (isSuccess) message.success('导出成功：已复制到剪贴板');
  else message.error('导出失败');
};

const importGlossary = () => {
  const importedGlossary = Glossary.fromText(importGlossaryRaw.value);
  if (importedGlossary === undefined) {
    message.error('导入失败：术语表格式不正确');
  } else {
    message.success('导入成功');
    for (const jp in importedGlossary)
      glossary.value[jp] = importedGlossary[jp];
    loadGroups();
  }
};

const downloadGlossaryAsJsonFile = async () => {
  downloadFile(
    `${gnidHint.value ?? 'glossary'}.json`,
    new Blob([Glossary.toJson(glossary.value)], { type: 'text/plain' }),
  );
};

const gnidHint = computed(() => {
  const gnid = props.gnid;
  if (gnid === undefined) return undefined;
  return GenericNovelId.toString(gnid);
});

const updateGlossary = async () => {
  const gnid = props.gnid;
  if (gnid === undefined) return;
  const glossaryValue = toRaw(glossary.value);
  if (gnid.type === 'web') {
    await WebNovelApi.updateGlossary(
      gnid.providerId,
      gnid.novelId,
      glossaryValue,
    );
  } else if (gnid.type === 'wenku') {
    await WenkuNovelApi.updateGlossary(gnid.novelId, glossaryValue);
  } else {
    const repo = await useLocalVolumeStore();
    await repo.updateGlossary(gnid.volumeId, glossaryValue);
  }
};

const submitGlossary = () =>
  doAction(
    updateGlossary().then(() => {
      for (const key in props.value) delete props.value[key];
      for (const key in glossary.value) props.value[key] = glossary.value[key];
      if (novelId.value) saveGroups();
    }),
    '术语表提交',
    message,
  );
</script>

<template>
  <c-button
    :label="`术语表[${Object.keys(value).length}]`"
    v-bind="$attrs"
    @action="toggleGlossaryModal()"
  />

  <c-modal
    title="编辑术语表"
    v-model:show="showGlossaryModal"
    :extra-height="120"
  >
    <template #header-extra>
      <n-flex
        vertical
        size="large"
        style="max-width: 600px; margin-bottom: 16px"
      >
        <template v-if="gnidHint">
          <n-text style="font-size: 12px">{{ gnidHint }}</n-text>
          <n-text>
            使用前务必先阅读
            <c-a to="/forum/660ab4da55001f583649a621">术语表使用指南</c-a>
            ，不要滥用术语表。
          </n-text>
        </template>

        <n-input-group>
          <n-input
            pair
            v-model:value="termsToAdd"
            size="small"
            separator="=>"
            :placeholder="['日文', '中文']"
            :input-props="{ spellcheck: false }"
          />
          <c-button
            label="添加"
            :round="false"
            size="small"
            @action="addTerm"
          />
        </n-input-group>

        <n-input
          v-model:value="importGlossaryRaw"
          type="textarea"
          size="small"
          placeholder="批量导入术语表"
          :input-props="{ spellcheck: false }"
          :rows="1"
        />

        <n-flex align="center" :wrap="false">
          <c-button
            label="导出"
            :round="false"
            size="small"
            @action="exportGlossary"
          />
          <c-button
            label="导入"
            :round="false"
            size="small"
            @action="importGlossary"
          />
          <c-button
            label="下载json"
            :round="false"
            size="small"
            @action="downloadGlossaryAsJsonFile"
          />
          <n-text
            v-if="lastDeletedTerm !== undefined"
            depth="3"
            style="font-size: 12px"
          >
            {{ lastDeletedTerm }}
          </n-text>
          <c-button
            :disabled="deletedTerms.length === 0"
            label="撤销删除"
            :round="false"
            size="small"
            @action="undoDeleteTerm"
          />
          <n-text
            v-if="selectedTerms.size > 0"
            depth="3"
            style="font-size: 12px"
          >
            已选 {{ selectedTerms.size }} 项 — Delete 键批量删除
          </n-text>
        </n-flex>
      </n-flex>
    </template>

    <!-- 主内容区 -->
    <div v-if="novelId" tabindex="0" style="outline: none" @keydown="onKeydown">
      <!-- ======== 桌面端：标签页 + 表格 ======== -->
      <div
        v-if="!isNarrow"
        :style="{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: '300px',
        }"
      >
        <div style="padding-bottom: 4px; border-bottom: 1px solid #eee">
          <GlossaryGroupTabs
            :group-names="groupNames"
            :display-data="displayData"
            :selected-group="selectedGroup"
            :editing-group-name="editingGroupName"
            :editing-group-new-name="editingGroupNewName"
            :show-new-group-input="showNewGroupInput"
            :new-group-name="newGroupName"
            :ungrouped-count="ungroupedEntries.length"
            :is-admin="whoami.isAdmin"
            @sync-remote-to-local="syncRemoteToLocal"
            @sync-local-to-editing="syncLocalToEditing"
            @clear-request="showClearConfirm = true"
            @select="
              (name) => {
                selectedGroup = name;
                clearSelection();
              }
            "
            @start-rename="startRename"
            @finish-rename="finishRename"
            @update:editing-group-new-name="editingGroupNewName = $event"
            @add-new-group="addNewGroup"
            @update:new-group-name="newGroupName = $event"
            @show-new-group="showNewGroupInput = true"
            @delete-group="deleteCurrentGroup"
            @drop-term="onDropTerm"
            @delete-group-request="onDeleteGroupRequest"
            @reorder-groups="onReorderGroups"
            @sort-by-time="handleSortByTime"
            @sort-by-time-reverse="handleSortByTimeReverse"
            @sort-by-kana="handleSortByKana"
            @sort-by-kana-reverse="handleSortByKanaReverse"
          />
        </div>

        <div style="flex: 1; min-width: 0">
          <template v-if="selectedGroup && currentGroupEntries.length > 0">
            <GlossaryTermTable
              :entries="currentGroupEntries"
              :glossary="glossary"
              :selected-terms="selectedTerms"
              :is-in-server-glossary="isInServerGlossary"
              :is-zh-conflict="isZhConflict"
              :get-local-zh="getLocalZh"
              :novel-id="novelId"
              :in-group="true"
              :group-name="selectedGroup"
              @toggle-select="toggleSelect"
              @delete-term="deleteTerm"
              @remove-from-group="removeTermFromCurrentGroup"
              @revert-term="revertTerm"
              @revert-to-local-zh="revertToLocalZh"
              @clear-local-record="clearLocalRecord"
              @reorder-term="
                (from, to) => {
                  GlossaryGroup.reorderTerm(novelId, selectedGroup!, from, to);
                  loadGroups();
                }
              "
            />
          </template>

          <template v-else-if="!selectedGroup && ungroupedEntries.length > 0">
            <GlossaryTermTable
              :entries="ungroupedEntries"
              :glossary="glossary"
              :selected-terms="selectedTerms"
              :is-in-server-glossary="isInServerGlossary"
              :is-zh-conflict="isZhConflict"
              :get-local-zh="getLocalZh"
              :novel-id="novelId"
              :in-group="false"
              @toggle-select="toggleSelect"
              @delete-term="deleteTerm"
              @remove-from-group="removeTermFromCurrentGroup"
              @revert-term="revertTerm"
              @revert-to-local-zh="revertToLocalZh"
              @clear-local-record="clearLocalRecord"
              @reorder-term="
                (from, to) => {
                  GlossaryGroup.reorderTerm(novelId, '未分组', from, to);
                  loadGroups();
                }
              "
            />
          </template>

          <n-text v-else depth="3" style="font-size: 12px">暂无术语</n-text>
        </div>
      </div>

      <!-- ======== 移动端：简易表格（不启用分组） ======== -->
      <div v-else>
        <n-table
          v-if="Object.keys(glossary).length !== 0"
          striped
          size="small"
          style="font-size: 12px; max-width: 400px"
        >
          <tr v-for="wordJp in Object.keys(glossary).reverse()" :key="wordJp">
            <td>
              <c-button
                :icon="DeleteOutlineOutlined"
                text
                type="error"
                size="small"
                @action="deleteTerm(wordJp)"
              />
            </td>
            <td>{{ wordJp }}</td>
            <td nowrap="nowrap">=></td>
            <td style="padding-right: 16px">
              <n-input
                v-model:value="glossary[wordJp]"
                size="tiny"
                placeholder="请输入中文翻译"
                :theme-overrides="{ border: '0', color: 'transprent' }"
              />
            </td>
          </tr>
        </n-table>
        <n-text v-else depth="3" style="font-size: 12px">暂无术语</n-text>
      </div>
    </div>

    <!-- 无 novelId 时的降级视图 -->
    <div v-else>
      <n-table
        v-if="Object.keys(glossary).length !== 0"
        striped
        size="small"
        style="font-size: 12px; max-width: 400px"
      >
        <tr v-for="wordJp in Object.keys(glossary).reverse()" :key="wordJp">
          <td>
            <c-button
              :icon="DeleteOutlineOutlined"
              text
              type="error"
              size="small"
              @action="deleteTerm(wordJp)"
            />
          </td>
          <td>{{ wordJp }}</td>
          <td nowrap="nowrap">=></td>
          <td style="padding-right: 16px">
            <n-input
              v-model:value="glossary[wordJp]"
              size="tiny"
              placeholder="请输入中文翻译"
              :theme-overrides="{ border: '0', color: 'transprent' }"
            />
          </td>
        </tr>
      </n-table>
    </div>

    <template #action>
      <c-button label="提交" type="primary" @action="submitGlossary()" />
    </template>
  </c-modal>

  <!-- 删除非空分组确认对话框 -->
  <c-modal v-model:show="showDeleteGroupConfirm" title="确认删除分组">
    <n-text>
      分组 "{{ deleteGroupConfirmName }}" 中有
      {{ deleteGroupConfirmCount }} 个术语，删除分组后这些术语将移到未分组。
    </n-text>
    <template #action>
      <c-button label="取消" @action="deleteGroupConfirmName = null" />
      <c-button label="确认删除" type="error" @action="confirmDeleteGroup" />
    </template>
  </c-modal>

  <!-- 清空确认对话框 -->
  <c-modal v-model:show="showClearConfirm" title="确认清空">
    <n-text>确定要清空术语表吗？此操作将同时清空本地分组数据。</n-text>
    <template #action>
      <c-button label="取消" @action="showClearConfirm = false" />
      <c-button
        label="确认清空"
        type="error"
        @action="
          clearTerm();
          showClearConfirm = false;
        "
      />
    </template>
  </c-modal>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
