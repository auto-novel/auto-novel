export type ProviderId =
  | 'alphapolis'
  | 'hameln'
  | 'kakuyomu'
  | 'novelup'
  | 'pixiv'
  | 'syosetu';

export type ProviderConfig = {
  // 需要使用 Addon 才能更新元数据
  requiresAddonMetadataUpdate: boolean;

  // 需要使用 Addon 才能更新章节内容
  requiresAddonChapterUpdate: boolean;
};

const defaultProviderConfig: ProviderConfig = {
  requiresAddonMetadataUpdate: false,
  requiresAddonChapterUpdate: false,
};

export const ProviderConfigOverrides: Partial<
  Record<ProviderId, Partial<ProviderConfig>>
> = {
  alphapolis: {
    requiresAddonChapterUpdate: true,
  },
  hameln: {
    requiresAddonChapterUpdate: true,
  },
  pixiv: {
    requiresAddonChapterUpdate: true,
  },
};

export const getProviderConfig = (providerId: string): ProviderConfig => ({
  ...defaultProviderConfig,
  ...ProviderConfigOverrides[providerId as ProviderId],
});

export const requiresAddonChapterUpdate = (providerId: string): boolean =>
  getProviderConfig(providerId).requiresAddonChapterUpdate;

export const requiresAddonMetadataUpdate = (providerId: string): boolean =>
  getProviderConfig(providerId).requiresAddonMetadataUpdate;
