import { Pixiv } from './pixiv';
import type { WebNovelProvider } from './types';

export const Providers: Record<string, WebNovelProvider> = {
  pixiv: new Pixiv(),
};
