import { CollectError, CollectClient, type SourceRuntime } from './client.ts';
import { parseClassList, type SourceClass } from './parser.ts';

export interface ClassFetchResult {
  classes: SourceClass[];
  /** 命中的请求方式，用于测试接口回显 */
  via: string;
}

/** 把地址里的 /at/xml/ 换成 /at/json/，没有该片段时返回 null */
export function swapToJsonPath(url: string): string | null {
  if (!/\/at\/xml\/?/i.test(url)) return null;
  return url.replace(/\/at\/xml\/?/i, '/at/json/');
}

/**
 * 获取分类。不管源站配的是什么格式，一律按 JSON 解析。
 * - json 源：直接请求 at=json。
 * - xml 源：先把地址里的 /at/xml/ 换成 /at/json/，不成立再退回到 at=json 参数。
 */
export async function fetchClassList(
  client: CollectClient,
  source: SourceRuntime,
  params: Record<string, string | number | undefined> = {},
): Promise<ClassFetchResult> {
  const attempts: { via: string; run: () => Promise<unknown> }[] = [];

  if (source.apiFormat === 'json') {
    attempts.push({
      via: 'at=json',
      run: () => client.request({ ...params, ac: 'list', at: 'json' }, 'json'),
    });
  } else {
    const swapped = swapToJsonPath(source.apiUrl);
    if (swapped) {
      attempts.push({
        via: '路径 /at/json/',
        run: () => client.request({ ...params, ac: 'list' }, 'json', { url: swapped }),
      });
    }
    attempts.push({
      via: '参数 at=json',
      run: () => client.request({ ...params, ac: 'list', at: 'json' }, 'json'),
    });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const raw = await attempt.run();
      const classes = parseClassList(raw, 'json');
      if (classes.length > 0) return { classes, via: attempt.via };
      errors.push(`${attempt.via}：未返回分类`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.via}：${message}`);
    }
  }

  throw new CollectError(`获取分类失败（${errors.join('；')}）`);
}
