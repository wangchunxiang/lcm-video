import { AppCrud } from '../../common/crud/app-crud.decorator';
import { AdminUserEntity } from './admin-user.entity';
import { AdminUserService } from './admin-user.service';
import { CreateAdminUserDTO, UpdateAdminUserDTO } from './dto/admin-user.dto';

/**
 * 后台账号管理：`@Crud()` 生成标准 REST。
 * 登录/改自己密码等自助动作在 `AuthController` 里（它们走 `@Public()` 或当前登录人）。
 */
@AppCrud({
  entity: AdminUserEntity,
  path: 'api/admin/admin-user',
  dto: { create: CreateAdminUserDTO, update: UpdateAdminUserDTO },
  // 密码哈希绝不能出现在响应里
  hiddenFields: ['password', 'passwordVersion'],
  select: ['id', 'username', 'nickname', 'isEnabled', 'lastLoginAt', 'lastLoginIp', 'createdAt', 'updatedAt'],
})
export class AdminUserController {
  constructor(public readonly service: AdminUserService) {}
}
