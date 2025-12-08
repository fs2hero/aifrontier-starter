<script setup>
import { onMounted, ref, computed } from 'vue'
import HelloWorld from './components/HelloWorld.vue'
import LogViewer from './components/LogViewer.vue'
import { SSEClient } from './lib/client'

// 控制日志显示状态
const showFullLogs = ref(false)

// 日志数据
const logs = ref([])
const appProgress = ref('应用启动中...')
const appVer = ref('0.0.0')

// 最新一条日志（用于简洁模式）
const latestLog = computed(() => {
  if (logs.value.length === 0) return null
  return logs.value[logs.value.length - 1]
})

// 添加日志的辅助函数
const addLog = (content, ts = 0, type = 'info') => {
  const time = new Date(ts).toLocaleTimeString()
  logs.value.push({
    time,
    content,
    type
  })
  
  // 限制日志数量
  if (logs.value.length > 1000) {
    logs.value = logs.value.slice(logs.value.length - 500)
  }
}

// 切换日志显示模式
const toggleLogs = () => {
  showFullLogs.value = !showFullLogs.value
}

const getAppVersion = async (params) => {
  return fetch("api/version")
  .then((response) => response.json())
  .then((data) => {
    console.log('version response ',data)
    appVer.value = data.appVersion;

    // location.replace(data?.url)
  });
}

onMounted(async () => {
  // fetch("api/bootstrap")
  // .then((response) => response.json())
  // .then((data) => {
  //   console.log('bootstrap response ',data)
  //   location.replace(data?.url)
  // });
  await getAppVersion();

  const client = new SSEClient('api/bootstrap', (data) => {
    if(data.type == 'log') {
      addLog(`${data.message}`, data.timestamp, 'success')
    } else if(data.type == 'progress') {
      appProgress.value = data.message;
    } else if(data.type == 'redirect') {
      location.replace(data.message)
    }
  });
  client.connect();
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <a href="https://github.com/Avdpro/ai2apps" target="_blank">
        <img src="./assets/aalogo.svg" class="logo aa" alt="aa logo" />
      </a>
    </header>
    <div class="version">{{ `v${appVer}` }}</div>
    <main class="app-main">
      <HelloWorld :msg="appProgress" />
      
      <!-- 日志显示区域 -->
      <div class="log-section">
        <!-- <h3 v-if="showFullLogs">应用日志</h3>
        <div v-else class="latest-log-header">
          <span>最新日志</span>
          <small>(点击"显示日志"查看完整日志)</small>
        </div> -->
        <!-- 日志切换按钮 -->
        <div class="latest-log-header">
          <button @click="toggleLogs" class="log-toggle-btn">
            {{ showFullLogs ? '隐藏详情' : '查看详情' }}
          </button>
        </div>
        <!-- 完整日志模式 -->
        <div class="full-logs">
          <LogViewer :logs="logs" :compact="!showFullLogs" />
        </div>
        
        <!-- 简洁模式：只显示最新一条 -->
        <!-- <div v-else class="compact-logs">
          <div v-if="latestLog" class="latest-log-item">
            <span class="log-time">{{ latestLog.time }}</span>
            <span class="log-content" :class="`log-${latestLog.type}`">
              {{ latestLog.content }}
            </span>
          </div>
          <div v-else class="no-logs">
            暂无日志
          </div>
        </div> -->
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  padding: 20px;
  background-color: #f5f5f5;
  width: 70vw;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e0e0e0;
}

.log-toggle-btn {
  padding: 8px 16px;
  background-color: #646cff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.log-toggle-btn:hover {
  background-color: #535bf2;
}

.app-main {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.log-section {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.log-section h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 18px;
}

.latest-log-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 15px;
}

.latest-log-header span {
  font-weight: bold;
  color: #333;
}

.latest-log-header small {
  color: #666;
  font-size: 12px;
}

.full-logs {
  max-height: 400px;
  overflow: hidden;
}

.compact-logs {
  background-color: #1a1a1a;
  border-radius: 8px;
  padding: 16px;
}

.latest-log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
}

.latest-log-item .log-time {
  color: #888;
  font-size: 11px;
  flex-shrink: 0;
}

.latest-log-item .log-content {
  flex-grow: 1;
  word-break: break-all;
  white-space: pre-wrap;
}

/* 日志类型颜色 */
.log-info {
  color: #e0e0e0;
}

.log-success {
  color: #4CAF50;
}

.log-warning {
  color: #FFC107;
}

.log-error {
  color: #F44336;
}

.no-logs {
  color: #999;
  font-style: italic;
  text-align: center;
  padding: 10px;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.version {
  color: black;
  text-align: left;
}
</style>
