import { useQueryCache } from '@pinia/colada';

// 模块会在 app.use(pinia) 前导入，只在实际操作时获取缓存。
export const getQueryCache = () => useQueryCache();

export function withOnSuccess<TArgs extends unknown[], TReturn>(
  apiCall: (...args: TArgs) => Promise<TReturn>,
  onSuccess: (ret: TReturn, ...args: TArgs) => void,
) {
  return (...args: TArgs) =>
    apiCall(...args).then((ret) => {
      onSuccess(ret, ...args);
      return ret;
    });
}
