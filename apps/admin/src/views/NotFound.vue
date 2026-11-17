<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <el-card shadow="never">
    <el-result icon="warning" title="页面不存在" sub-title="地址可能已经变更，或者你没有访问权限。">
      <template #extra>
        <el-button type="primary" @click="router.push('/dashboard')">回到数据概览</el-button>
      </template>
    </el-result>
  </el-card>
</template>
