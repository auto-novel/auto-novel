// Replace this placeholder with the URL of the external forum.
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
