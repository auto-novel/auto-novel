import { onScopeDispose, shallowRef } from 'vue';

export interface WorkspaceLogEntry {
  id: number;
  time: string;
  source: string;
  message: string;
  level: 'info' | 'warn';
}

const MAX_ENTRIES = 1000;
const MAX_TEXT_LENGTH = 1000;

export function useWorkspaceLog() {
  const logs = shallowRef<WorkspaceLogEntry[]>([]);
  let pending: WorkspaceLogEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextId = 0;
  let disposed = false;

  function clearLogs() {
    clearTimeout(timer);
    timer = undefined;
    pending = [];
    logs.value = [];
  }

  function appendLog(
    source: string,
    message: string,
    level: WorkspaceLogEntry['level'] = 'info',
    secrets: string[] = [],
  ) {
    if (disposed || message.startsWith('思考：')) return;
    const sanitize = (text: string) => {
      for (const secret of secrets) {
        if (secret) text = text.split(secret).join('[已隐藏]');
      }
      text = text
        .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [已隐藏]')
        .replace(
          /((?:api[_-]?key|authorization|token)["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
          '$1[已隐藏]',
        );
      return text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH) + '…（已截断）'
        : text;
    };
    pending.push({
      id: nextId++,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      // 来源只是翻译器名或任务名，本身不含凭据；若一并替换，
      // Key 恰好与名称相同时整段来源会变成 [已隐藏]，无法分辨日志归属。
      source,
      message: sanitize(message),
      level,
    });
    if (pending.length > MAX_ENTRIES)
      pending.splice(0, pending.length - MAX_ENTRIES);
    timer ??= setTimeout(() => {
      logs.value = [...logs.value, ...pending].slice(-MAX_ENTRIES);
      pending = [];
      timer = undefined;
    }, 100);
  }

  onScopeDispose(() => {
    disposed = true;
    clearLogs();
  });

  return { logs, appendLog, clearLogs };
}
