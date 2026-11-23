import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const SERVER_TARGET = 'http://127.0.0.1:3100';

/**
 * 开发时 vite 总是比 nest 先就绪（server 要先编 shared、再 nest --watch 编译、再连库），
 * 而且改后端代码时 nest 会重启，3100 都会短暂关闭。此时页面发来的请求就是
 * `connect ECONNREFUSED 127.0.0.1:3100`。
 *
 * vite 在 `proxy.configure` 之后才注册自己的 error 监听，并且无条件 logger.error，
 * 所以靠 configure 加监听挡不住刷屏；这里在 configureServer 里给 logger.error 加一层过滤，
 * 只吞「代理 + ECONNREFUSED」这一种，其它错误照常打印。
 */
function silenceStartupProxyErrors(): Plugin {
  return {
    name: 'lcm:silence-startup-proxy-errors',
    configureServer(server) {
      const logger = server.config.logger;
      const originalError = logger.error.bind(logger);
      type ErrorOptions = Parameters<typeof logger.error>[1];
      logger.error = (message: string, options?: ErrorOptions): void => {
        const error = (options as { error?: NodeJS.ErrnoException } | undefined)?.error;
        if (error?.code === 'ECONNREFUSED' && message.includes('http proxy error')) return;
        originalError(message, options);
      };
    },
  };
}

export default defineConfig({
  plugins: [silenceStartupProxyErrors(), vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3300,
    strictPort: true,
    // 默认只监听 localhost，手机/平板访问局域网 IP 打不开；这里显式监听所有网卡
    host: true,
    proxy: {
      '/api': {
        target: SERVER_TARGET,
        changeOrigin: false,
        // server 未就绪时别让请求悬着：回一个 503 让前端立刻拿到结果，日志只提示一次
        configure: (proxy) => {
          let warned = false;
          proxy.on('error', (error, _request, response) => {
            if ((error as NodeJS.ErrnoException).code !== 'ECONNREFUSED') return;
            if (!response || !('writeHead' in response)) return;
            if (!warned) {
              warned = true;
              console.warn('[vite] 后端 3100 尚未就绪，接口先返回 503；server 起来后刷新即可');
            }
            if (!response.headersSent && !response.writableEnded) {
              response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
              response.end(JSON.stringify({ code: 503, message: '服务启动中，请稍后刷新' }));
            }
          });
        },
      },
    },
  },
});
