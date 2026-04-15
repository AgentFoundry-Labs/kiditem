import { SetMetadata } from '@nestjs/common';

export const ROLES_METADATA_KEY = 'roles';

/**
 * `@Roles('owner', 'admin')` — 핸들러/컨트롤러에 허용 역할을 지정한다.
 * `RolesGuard` 가 `req.authUser.role` 와 교차 검증. 메타 없으면 pass-through.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_METADATA_KEY, roles);
