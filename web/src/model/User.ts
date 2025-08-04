export type UserRole = 'admin' | 'trusted' | 'member' | 'restricted' | 'banned';

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
