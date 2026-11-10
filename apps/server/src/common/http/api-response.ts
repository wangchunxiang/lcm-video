/**
 * 统一响应信封。约定见 docs/架构-v2.md：HTTP 状态码固定 200，语义放在 code。
 * 0 成功，1 失败（默认），其余只在“前端必须分支”时才用专用码。
 */
export const OK = 0;
export const FAIL = 1;
export const CODE_UNAUTHORIZED = 100401;
export const CODE_FORBIDDEN = 100403;
export const CODE_SERVER_ERROR = 100500;

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
  reqId?: string;
}
