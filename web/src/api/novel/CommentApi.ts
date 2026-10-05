import { createForumApi } from '@novelia/forum-api';

import { forumApiUrl } from '@/config';
import { authApi } from '../auth/session';

const client = authApi.createClient(forumApiUrl, { timeout: 60_000 });

export const CommentApi = createForumApi({
  client,
  url: forumApiUrl,
  type: 'novel',
});
