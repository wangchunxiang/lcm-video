import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router/index.ts';
import './styles/tokens.css';
import './styles/site.css';

createApp(App).use(router).mount('#app');
