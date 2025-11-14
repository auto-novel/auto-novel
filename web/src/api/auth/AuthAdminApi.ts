import type { PageX } from '@/model/Page';
import type { UserRole } from '@/model/User';
import { client } from '../novel/client';

import { AuthUrl } from '@/util/useUserData/api';

const clientAuth = client.extend({
  prefixUrl: AuthUrl + '/api/v1/admin',
  credentials: 'include',
});

export interface UserResponse {
  name: string;
  email: string;
  role: UserRole;
  createdAt: number;
  lastLogin: number;
  attr: object;
}

const listUser = (params: {
  page: number;
  pageSize: number;
  q?: string;
  role?: UserRole;
  create_after?: number;
  create_before?: number;
}) =>
  clientAuth.get('user', { searchParams: params }).json<PageX<UserResponse>>();

interface RestrictUserRequest {
  username: string;
  role: UserRole;
}

const restrictUser = (json: RestrictUserRequest) =>
  clientAuth.post(`user/restrict`, { json });

interface BanUserRequest {
  username: string;
  role: UserRole;
}

const banUser = (json: BanUserRequest) => clientAuth.post(`user/ban`, { json });

interface StrikeUserRequest {
  username: string;
  reason: string;
  evidence: string;
}

const strikeUser = (json: StrikeUserRequest) =>
  clientAuth.post(`user/strike`, { json });

export const AuthAdminApi = {
  listUser,
  restrictUser,
  banUser,
  strikeUser,
};
