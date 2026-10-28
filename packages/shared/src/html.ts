const BLOCK_TAGS = /<\/?(?:p|div|section|article|h[1-6]|li|ul|ol|dl|dt|dd|table|thead|tbody|tr|td|th|blockquote|pre)\b[^>]*>/gi;
const BR_TAGS = /<br\s*\/?>/gi;
const SCRIPT_STYLE = /<(script|style|iframe|noscript)\b[\s\S]*?<\/\1>/gi;
const ANY_TAG = /<\/?[a-z][^>]*>/gi;
const NUMERIC_ENTITY = /&#(x?)([0-9a-f]+);/gi;
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  times: '×',
  copy: '©',
  reg: '®',
};

function decodeEntitiesOnce(input: string): string {
  return input
    .replace(NUMERIC_ENTITY, (_, hex: string, code: string) => {
      const value = Number.parseInt(code, hex ? 16 : 10);
      if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return ' ';
      try {
        return String.fromCodePoint(value);
      } catch {
        return ' ';
      }
    })
    .replace(/&([a-z][a-z0-9]*);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * 反复解码，处理源站常见的双重编码（&amp;nbsp; → &nbsp; → 空格）
 */
export function decodeEntities(input: string): string {
  let text = input;
  for (let i = 0; i < 3; i++) {
    const next = decodeEntitiesOnce(text);
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * 把采集来的 HTML 片段转成纯文本。
 * paragraph=true 时段落之间用空行分隔（前台用 white-space: pre-wrap 呈现），
 * 否则所有内容连成一行（用于 intro 这种摘要）。
 */
export function htmlToText(input: string | null | undefined, options: { paragraph?: boolean } = {}): string {
  if (!input) return '';
  const paragraph = options.paragraph !== false;
  let text = String(input).replace(SCRIPT_STYLE, '');
  text = text.replace(BR_TAGS, '\n');
  text = text.replace(BLOCK_TAGS, '\n');
  text = text.replace(ANY_TAG, '');
  text = decodeEntities(text);
  const lines = text
    .split('\n')
    .map((line) => line.replace(/[\s\u00a0]+/g, ' ').trim())
    .filter((line) => line.length > 0);
  return lines.join(paragraph ? '\n\n' : ' ');
}

/**
 * 摘要用：转纯文本并压成一行
 */
export function htmlToSummary(input: string | null | undefined): string {
  return htmlToText(input, { paragraph: false });
}
