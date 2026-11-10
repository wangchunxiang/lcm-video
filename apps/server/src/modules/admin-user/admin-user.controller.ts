import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { AdminUserEntity } from './admin-user.entity';
import { AdminUserService } from './admin-user.service';
import { CreateAdminUserDTO, UpdateAdminUserDTO } from './dto/admin-user.dto';

/**
 * 后台账号管理：`@Crud()` 生成标准 REST。
 * 登录/改自己密码等自助动作在 `AuthController` 里（它们走 `@Public()` 或当前登录人）。
 */
@Crud({
  entity: AdminUserEntity,
  path: 'api/admin/admin-user',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateAdminUserDTO, update: UpdateAdminUserDTO },
  // 密码哈希绝不能出现在响应里
  hiddenFields: ['password', 'passwordVersion'],
  select: ['id', 'username', 'nickname', 'isEnabled', 'lastLoginAt', 'lastLoginIp', 'createdAt', 'updatedAt'],
  messages: { deleted: '账号已删除', noItemsToDelete: '没有要删除的账号' },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class AdminUserController {
  constructor(public readonly service: AdminUserService) {}
}
