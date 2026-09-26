import type { PageX } from '@/model/Page';
import type { UserRole } from '@/model/User';
import { authApi, authUrl } from './session';
import { client } from '../novel/client';

const baseUrl = new URL('api/v1/admin/', authUrl).toString();
const clientAuth =
  authApi?.createClient(baseUrl) ?? client.extend({ prefix: baseUrl });

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastLogin: string;
  attr: object;
}

const listUser = (params: {
  page: number;
  pageSize: number;
  q?: string;
  role?: UserRole;
  createdAfter?: number;
  createdBefore?: number;
}) =>
  clientAuth
    .get('user', {
      searchParams: {
        page: params.page,
        page_size: params.pageSize,
        q: params.q,
        role: params.role,
        created_after: params.createdAfter,
        created_before: params.createdBefore,
      },
    })
    .json<PageX<UserResponse>>();

export const AuthAdminApi = { listUser };
