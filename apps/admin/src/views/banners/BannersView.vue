<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Toast, XDialog, getApiErrorMessage } from '@novelia/web-kit';
import { useBannerApi, type Banner } from '../../api';
import BannerUploader from './BannerUploader.vue';
import BannerPreview from './BannerPreview.vue';
import { validateBannerConfig } from './bannerConfig';
import { defaultBannerFocal, validateBannerFocal } from './bannerFocal';

const activeTab = ref('manage');
const tabs = [
  { value: 'manage', label: '管理' },
  { value: 'upload', label: '上传' },
];
function navigateTabs(event: KeyboardEvent) {
  const direction =
    event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!direction && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  const index = tabs.findIndex((tab) => tab.value === activeTab.value);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + direction + tabs.length) % tabs.length;
  activeTab.value = tabs[next]!.value;
  const tablist = event.currentTarget as HTMLElement;
  tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}
const uploading = ref(false);

const api = useBannerApi();
const items = ref<Banner[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
const busy = ref<number | null>(null);
const deleting = ref<Banner | null>(null);
const selectedId = ref<number>();
const selected = computed(
  () =>
    items.value.find((item) => item.id === selectedId.value) ?? items.value[0],
);

const editing = ref(false);
const saving = ref(false);
const editError = ref('');
const draftLink = ref('');
const draftSortOrder = ref(0);
const draftFocalX = ref(defaultBannerFocal);
const draftFocalY = ref(defaultBannerFocal);
const previewFocalX = computed({
  get: () =>
    editing.value
      ? draftFocalX.value
      : selected.value?.focalX ?? defaultBannerFocal,
  set: (value: number) => {
    draftFocalX.value = value;
  },
});
const previewFocalY = computed({
  get: () =>
    editing.value
      ? draftFocalY.value
      : selected.value?.focalY ?? defaultBannerFocal,
  set: (value: number) => {
    draftFocalY.value = value;
  },
});

watch(activeTab, (tab) => {
  if (tab !== 'manage') cancelEdit();
});

let reloadRequested = false;
async function load() {
  if (loading.value) {
    reloadRequested = true;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    items.value = await api.list();
    loaded.value = true;
  } catch (cause) {
    error.value = getApiErrorMessage(cause, '操作失败');
  } finally {
    loading.value = false;
    if (reloadRequested) {
      reloadRequested = false;
      void load();
    }
  }
}

async function toggle(banner: Banner) {
  if (busy.value !== null || loading.value) return;
  busy.value = banner.id;
  const isActive = !banner.isActive;
  const action = isActive ? '启用' : '停用';
  await Toast.promise(api.setActive(banner.id, isActive), {
    loading: { message: `正在${action} Banner…`, duration: 0 },
    success: `Banner #${banner.id} 已${action}`,
    error: (reason) => getApiErrorMessage(reason, `${action}失败`),
  })
    .then(() => {
      banner.isActive = isActive;
    })
    .catch(() => {});
  busy.value = null;
}

async function remove() {
  const banner = deleting.value;
  if (!banner || busy.value !== null) return;
  busy.value = banner.id;
  await Toast.promise(api.remove(banner.id), {
    loading: { message: '正在删除 Banner…', duration: 0 },
    success: `Banner #${banner.id} 已删除`,
    error: (reason) => getApiErrorMessage(reason, '删除失败'),
  })
    .then(() => {
      items.value = items.value.filter((item) => item.id !== banner.id);
      deleting.value = null;
    })
    .catch(() => {});
  busy.value = null;
}

function startEdit() {
  const banner = selected.value;
  if (!banner) return;
  draftLink.value = banner.linkUrl ?? '';
  draftSortOrder.value = banner.sortOrder;
  draftFocalX.value = banner.focalX;
  draftFocalY.value = banner.focalY;
  editError.value = '';
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  editError.value = '';
}

async function saveEdit() {
  const banner = selected.value;
  if (!banner || saving.value) return;
  editError.value =
    validateBannerConfig(draftLink.value, draftSortOrder.value) ||
    validateBannerFocal(draftFocalX.value, draftFocalY.value);
  if (editError.value) return;
  saving.value = true;
  await Toast.promise(
    api.update(banner.id, {
      type: banner.type,
      key: banner.key,
      linkUrl: draftLink.value.trim() || null,
      sortOrder: draftSortOrder.value,
      focalX: draftFocalX.value,
      focalY: draftFocalY.value,
    }),
    {
      loading: { message: '正在保存 Banner…', duration: 0 },
      success: 'Banner 已保存',
      error: (reason) => getApiErrorMessage(reason, '保存失败'),
    },
  )
    .then((updated) => {
      Object.assign(banner, updated);
      editing.value = false;
    })
    .catch(() => {});
  saving.value = false;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}
onMounted(load);
</script>

<template>
  <header class="page-heading">
    <div>
      <h1>Banner 管理</h1>
      <p class="subtitle">管理首页轮播图片，让值得关注的内容被看见。</p>
    </div>
  </header>

  <div
    class="banner-tabs"
    role="tablist"
    aria-label="Banner 操作"
    @keydown="navigateTabs"
  >
    <button
      v-for="tab in tabs"
      :id="`banner-tab-${tab.value}`"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="activeTab === tab.value"
      :aria-controls="`banner-panel-${tab.value}`"
      :tabindex="activeTab === tab.value ? 0 : -1"
      @click="activeTab = tab.value"
    >
      {{ tab.label }}
    </button>
  </div>

  <section
    id="banner-panel-upload"
    v-show="activeTab === 'upload'"
    role="tabpanel"
    aria-labelledby="banner-tab-upload"
    tabindex="0"
  >
    <BannerUploader
      :disabled="activeTab !== 'upload' || !!deleting || busy !== null"
      @busy="uploading = $event"
      @saved="load"
    />
  </section>

  <section
    id="banner-panel-manage"
    v-show="activeTab === 'manage'"
    role="tabpanel"
    aria-labelledby="banner-tab-manage"
    tabindex="0"
  >
    <p v-if="error" class="error-notice" role="alert">{{ error }}</p>

    <section class="banner-panel" :aria-busy="loading">
      <div v-if="error && !loaded && !loading" class="panel-toolbar">
        <button
          class="btn btn-small"
          :disabled="busy !== null || uploading"
          @click="load"
        >
          重试
        </button>
      </div>
      <div v-if="loading" class="empty-state" role="status">
        正在加载 Banner…
      </div>
      <div v-else-if="loaded && !items.length" class="empty-state">
        <h2>还没有 Banner</h2>
        <p>首页轮播目前是空的，上传图片后就能在这里管理和排序。</p>
        <div class="empty-actions">
          <button
            type="button"
            class="btn btn-primary"
            @click="activeTab = 'upload'"
          >
            上传 Banner
          </button>
          <button
            type="button"
            class="btn"
            :disabled="busy !== null || uploading"
            @click="load"
          >
            刷新
          </button>
        </div>
      </div>
      <template v-else-if="loaded && selected">
        <BannerPreview
          :src="selected.imageUrl"
          :alt="`Banner #${selected.id}`"
          :editable="editing"
          :disabled="saving"
          v-model:focal-x="previewFocalX"
          v-model:focal-y="previewFocalY"
        >
          <template #actions>
            <button
              v-if="!editing"
              type="button"
              class="btn"
              :disabled="loading || busy !== null || uploading"
              @click="load"
            >
              刷新
            </button>
          </template>
        </BannerPreview>
        <div class="banner-thumbnails" aria-label="Banner 原图列表">
          <button
            v-for="banner in items"
            :key="banner.id"
            type="button"
            class="banner-thumbnail"
            :class="{ selected: selected.id === banner.id }"
            :aria-pressed="selected.id === banner.id"
            :aria-label="`选择 Banner #${banner.id}`"
            :title="`Banner #${banner.id} · ${banner.isActive ? '展示中' : '已停用'}`"
            :disabled="editing || saving"
            @click="selectedId = banner.id"
          >
            <img
              :src="banner.imageUrl"
              :alt="`Banner #${banner.id}`"
              loading="lazy"
            />
          </button>
        </div>
        <div class="selected-banner-details">
          <div class="selected-banner-heading">
            <strong>Banner #{{ selected.id }}</strong>
            <span class="status-badge" :class="{ active: selected.isActive }">
              {{ selected.isActive ? '展示中' : '已停用' }}
            </span>
          </div>
          <form v-if="editing" class="banner-form" @submit.prevent="saveEdit">
            <fieldset :disabled="saving">
              <div class="form-grid">
                <label class="field">
                  <span>
                    跳转地址
                    <small>可选</small>
                  </span>
                  <input
                    v-model="draftLink"
                    type="text"
                    placeholder="/novel 或 https://example.com"
                    autocomplete="off"
                  />
                  <small>留空则不跳转。支持站内路径或完整 HTTP(S) 地址。</small>
                </label>
                <label class="field">
                  <span>排序值</span>
                  <input
                    v-model.number="draftSortOrder"
                    type="number"
                    step="1"
                    min="-2147483648"
                    max="2147483647"
                    required
                  />
                  <small>数值越小越靠前；相同时按 ID 排序。</small>
                </label>
              </div>
            </fieldset>
            <p class="hint">
              更换图片请删除后重新上传；在预览中切换到“桌面模拟”或“移动模拟”可调整图片焦点。
            </p>
            <p v-if="editError" class="error-notice" role="alert">
              {{ editError }}
            </p>
            <div class="row-actions">
              <button
                type="button"
                class="btn"
                :disabled="saving"
                @click="cancelEdit"
              >
                取消
              </button>
              <button type="submit" class="btn btn-primary" :disabled="saving">
                {{ saving ? '正在保存…' : '保存' }}
              </button>
            </div>
          </form>
          <template v-else>
            <p class="hint">跳转地址：{{ selected.linkUrl || '不跳转' }}</p>
            <p class="hint">
              排序：{{ selected.sortOrder }} · 更新于
              {{ formatDate(selected.updatedAt) }}
            </p>
            <div class="row-actions">
              <button
                class="btn btn-small"
                :disabled="busy !== null || uploading"
                @click="startEdit"
              >
                编辑
              </button>
              <button
                class="btn btn-small"
                :disabled="busy !== null || uploading"
                @click="toggle(selected)"
              >
                {{
                  busy === selected.id
                    ? '处理中…'
                    : selected.isActive
                      ? '停用'
                      : '启用'
                }}
              </button>
              <button
                class="btn btn-small danger"
                :disabled="busy !== null || uploading"
                @click="deleting = selected"
              >
                删除
              </button>
            </div>
          </template>
        </div>
      </template>
      <footer class="panel-footer">
        首页轮播 · 按排序值从小到大展示，排序相同时按 ID 排序。
      </footer>
    </section>
  </section>

  <XDialog
    :open="!!deleting"
    title="删除 Banner"
    description="删除后无法恢复，关联图片也会被清理。"
    :closable="busy === null"
    @update:open="!$event && (deleting = null)"
  >
    <p class="delete-description">
      确定删除 Banner #{{ deleting?.id }} 吗？{{
        deleting?.isActive ? '此图片目前正在首页展示。' : ''
      }}
    </p>
    <div class="form-actions">
      <button
        class="btn"
        :disabled="busy !== null || uploading"
        @click="deleting = null"
      >
        取消
      </button>
      <button
        class="btn btn-danger"
        :disabled="busy !== null || uploading"
        @click="remove"
      >
        {{ busy !== null ? '正在删除…' : '确认删除' }}
      </button>
    </div>
  </XDialog>
</template>

<style scoped src="./banner.shared.css"></style>

<style scoped>
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
}
.subtitle {
  margin: 8px 0 0;
  color: var(--color-muted);
  font-size: 14px;
}
.banner-tabs {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 24px;
  padding: 4px;
  border-radius: 10px;
  background: var(--color-neutral-soft);
}
.banner-tabs button {
  min-width: 88px;
  padding: 8px 20px;
  border: none;
  border-radius: 7px;
  color: var(--color-muted);
  font-size: 14px;
}
.banner-tabs button[aria-selected='true'] {
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 600;
}
.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
.selected-banner-details {
  padding: 20px;
  overflow-wrap: anywhere;
}
.selected-banner-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.selected-banner-details .hint {
  margin: 12px 0;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  border-radius: 20px;
  background: var(--color-hover);
  color: var(--color-muted);
  padding: 4px 9px;
}
.status-badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.status-badge.active {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
}
.panel-footer {
  padding: 14px 20px;
  color: var(--color-muted);
  font-size: 12px;
}
.delete-description {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
  margin: 12px 0 20px;
}
@media (max-width: 767px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
