import { createForumApi } from '@novelia/forum-api';
import ky from 'ky';

import { forumApiUrl } from '@/config';
import { authApi, localAuthToken } from '../auth/session';

const client = authApi
  ? authApi.createClient(forumApiUrl, { timeout: 60_000 })
  : ky.create({
      timeout: 60_000,
      retry: 0,
      headers: { Authorization: `Bearer ${localAuthToken}` },
    });

export const CommentApi = createForumApi({
  client,
  url: forumApiUrl,
  type: 'novel',
});
