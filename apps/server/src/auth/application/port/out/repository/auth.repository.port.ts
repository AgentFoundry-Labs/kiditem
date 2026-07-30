export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface AuthMembershipRecord {
  id: string;
  organizationId: string;
  role: string;
}

export interface AuthIdentityRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  type: string;
  isActive: boolean;
  memberships: AuthMembershipRecord[];
}

export interface AuthUserRecord extends AuthIdentityRecord {
  passwordHash: string | null;
}

export interface AuthSessionRecord {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: AuthIdentityRecord;
}

export interface CreateAuthSessionInput {
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findIdentityById(userId: string): Promise<AuthIdentityRecord | null>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  createSessionAndTouchLogin(input: CreateAuthSessionInput): Promise<void>;
  revokeSession(sessionId: string, userId: string, revokedAt: Date): Promise<void>;
  setPasswordAndRevokeSessions(
    email: string,
    passwordHash: string,
    revokedAt: Date,
  ): Promise<boolean>;
  revokeAllSessionsByEmail(email: string, revokedAt: Date): Promise<boolean>;
}
