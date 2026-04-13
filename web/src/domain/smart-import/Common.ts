export const extractAsin = (url: string) => {
  const asinRegex = /(?:[/dp/]|$)([A-Z0-9]{10})/g;
  return asinRegex.exec(url)?.[1];
};

export const prettyCover = (cover: string) =>
  cover
    .replace('_PJku-sticker-v7,TopRight,0,-50.', '')
    .replace('m.media-amazon.com', 'images-cn.ssl-images-amazon.cn')
    .replace(/\.[A-Z0-9_]+\.jpg$/, '.jpg')
    .replace(/\.[A-Z0-9_]+ControlCacheEqualizer\.jpg$/, '.jpg');
