import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 当前请求的登录人，给拿不到 `request` 的深调用用。
 *
 * 存在的原因：`@AppCrud()` 生成的路由直接调 `service.update(id, dto)`，
 * 而 service 又是普通单例，没法像控制器那样用 `@CurrentUser()`。
 * 想「不能禁用/删除自己的账号」这类判断，必须知道操作者是谁，
 * 于是由 `RequestContextInterceptor` 在守卫之后把登录人挂进这里，
 * 比把整个 service 改成请求作用域（会连带影响所有依赖它的 service）更轻。
 *
 * 线程安全：Node 的 AsyncLocalStorage 按异步链隔离，并发请求互不影响。
 */
interface RequestContext {
  /** 登录账号 id；`@Public()` 路由没有登录人，为 undefined。 */
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** 在上下文里执行 `fn`；`fn` 内部任意深度的调用都能读到同一份上下文。 */
export function runInRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** 当前请求的登录账号 id；不在请求链路里（如定时任务、脚本）时为 undefined。 */
export function currentUserId(): string | undefined {
  return storage.getStore()?.userId;
}
