export type UserRole = 'admin' | 'member' | 'restricted' | 'banned';

export interface UserReference {
  username: string;
  role: UserRole;
}

export interface UserOutline {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: number;
}
