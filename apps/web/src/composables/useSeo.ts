import { watchEffect } from 'vue';
import { site } from '../site';

export interface SeoOptions {
  title: string;
  description?: string;
  noindex?: boolean;
}

function setMeta(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * 页面级 SEO：标题、描述、robots。
 * 规则见 docs/技术方案.md 7.4；页面卸载后由下一个页面覆盖，不做恢复。
 */
export function useSeo(source: () => SeoOptions): void {
  watchEffect(() => {
    const opts = source();
    document.title = opts.title;
    setMeta('description', opts.description ?? site.config.siteSubtitle);
    setMeta('robots', opts.noindex ? 'noindex,follow' : 'index,follow');
  });
}
