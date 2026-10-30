// 本站社区及项目相关的外部链接。
export const siteUrls = {
  repository: 'https://github.com/auto-novel/auto-novel',
  addonRepository: 'https://github.com/auto-novel/Addon',
  androidApp: 'https://github.com/nobYoQ/novelia',
  qqGroup: 'https://qm.qq.com/q/wCCkZFaWC4',
  telegram: 'https://t.me/+hgUSCmuBReQzNmU1',
  sakuraMonitor:
    'https://monitor.novelia.cc/public-dashboards/be71c46fcc0e40eeaf06d9e7a2e26f95?refresh=auto&from=now-5m&to=now&timezone=browser',
} as const;

export const forumUrl = 'https://forum.novelia.cc';
export const forumApiUrl = forumUrl;
// Entry point linked from the web menu (forum community section).
export const forumCommunityUrl = `${forumUrl}/c/novel`;

export const forumPostUrls = {
  usageGuide: `${forumUrl}/p/1`, // /posts/64f3d63f794cbb1321145c07
  glossaryGuide: `${forumUrl}/p/66`, // /posts/660ab4da55001f583649a621
  sakuraDeployGuide: `${forumUrl}/p/8`, // /posts/656d60530286f15e3384fcf8
  sakuraAutoDlGuide: `${forumUrl}/p/9`, // /posts/65719bf16843e12bd3a4dc98
} as const;

export const externalImageUrls = {
  wenkuCoverPlaceholder:
    'https://n-cdn.novelia.cc/static/no_cover.c90924af53e4.webp',
} as const;
