import { createApp } from 'vue';
// 组件由 unplugin-vue-components 按需注入；这几个是命令式 API，样式要自己引
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/loading/style/css';
import 'element-plus/es/components/notification/style/css';
import './styles/global.css';
import App from './App.vue';
import router from './router/index.ts';

const app = createApp(App);

app.use(router);
app.mount('#app');
