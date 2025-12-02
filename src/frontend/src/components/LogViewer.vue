<!-- LogViewer.vue -->
<script setup>
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps({
  logs: {
    type: Array,
    required: true,
    default: () => []
  },
  autoScroll: {
    type: Boolean,
    default: true
  },
  compact: {
    type: Boolean,
    default: true
  }
})

const containerRef = ref(null)
const maxLogs = 1000 // 限制日志条数，避免内存问题

// 处理日志，限制最大数量
const processedLogs = computed(() => {
  if(props.compact) {
    return props.logs.slice(-1)
  }

  if (props.logs.length > maxLogs) {
    return props.logs.slice(props.logs.length - maxLogs)
  }
  return props.logs
})

// 最新一条日志
const latestLog = computed(() => {
  if (props.logs.length === 0) return null
  return props.logs[props.logs.length - 1]
})

// 自动滚动到底部
const scrollToBottom = () => {
  if (containerRef.value && props.autoScroll) {
    const el = containerRef.value
    el.scrollTop = el.scrollHeight
  }
}

// 监听日志变化
import { watch } from 'vue'
watch(
  () => props.logs.length,
  () => {
    requestAnimationFrame(scrollToBottom)
  }
)
</script>

<template>
  <div class="log-viewer">
    <div v-if="processedLogs.length === 0" class="no-logs">
      暂无日志
    </div>
    
    <!-- 完整日志视图 -->
    <div 
      v-else
      ref="containerRef"
      class="log-container"
    >
      <div 
        v-for="(log, index) in processedLogs" 
        :key="index"
        class="log-item"
        :class="{
          'log-info': log.type === 'info',
          'log-success': log.type === 'success',
          'log-warning': log.type === 'warning',
          'log-error': log.type === 'error'
        }"
      >
        <span class="log-time">{{ log.time }}</span>
        <span class="log-content">{{ log.content }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-viewer {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
}

.no-logs {
  color: #999;
  padding: 20px;
  text-align: center;
  font-style: italic;
}

.log-container {
  background-color: #1a1a1a;
  color: #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  width: 60vw;
}

.log-item {
  padding: 4px 0;
  border-bottom: 1px solid #333;
  word-break: break-all;
  white-space: pre-wrap;
  text-align: left;
}

.log-item:last-child {
  border-bottom: none;
}

.log-time {
  color: #888;
  margin-right: 12px;
  font-size: 11px;
  user-select: none;
}

.log-content {
  color: inherit;
}

/* 日志类型颜色 */
.log-info .log-content {
  color: #e0e0e0;
}

.log-success .log-content {
  color: #4CAF50;
}

.log-warning .log-content {
  color: #FFC107;
}

.log-error .log-content {
  color: #F44336;
}

/* 滚动条样式 */
.log-container::-webkit-scrollbar {
  width: 8px;
}

.log-container::-webkit-scrollbar-track {
  background: #2a2a2a;
  border-radius: 4px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.log-container::-webkit-scrollbar-thumb:hover {
  background: #666;
}
</style>