/**
 * ECharts 按需注册（后台只有概览页画图，全量引入约 1MB，按需约 200KB）。
 *
 * 新增图表类型时在这里 `use([...])` 即可，别在组件里重复注册：
 * `<script setup>` 的顶层代码会在每个组件实例上跑一遍。

 * 同时导出 `VChart` 组件，避免每个页面各写一遍 `import VChart from 'vue-echarts'`。
 */
import { use } from 'echarts/core';
import { LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export { default as VChart } from 'vue-echarts';
export type { EChartsOption } from 'echarts';
