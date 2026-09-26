import { roleLabels, type UserRole as AuthUserRole } from '@novelia/auth-api';

export type UserRole = AuthUserRole;

export interface UserReference {
  username: string;
}

export namespace UserRole {
  export function toString(role: UserRole) {
    return roleLabels[role] ?? '未知用户';
  }
}
