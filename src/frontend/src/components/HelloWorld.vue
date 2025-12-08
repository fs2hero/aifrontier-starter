<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
// import comLogo from '../assets/comlogo.png'

defineProps({
  msg: String,
})

const comLogo = ref('')

const count = ref(0)
const dots = ref('')

// 粒子系统相关
const particles = ref([])
const animationId = ref(null)

// 创建粒子类
class Particle {
  constructor() {
    this.reset()
    this.x = Math.random() * window.innerWidth
    this.y = Math.random() * window.innerHeight
  }
  
  reset() {
    this.x = Math.random() * window.innerWidth
    this.y = Math.random() * window.innerHeight
    this.size = Math.random() * 3 + 1
    this.speedX = Math.random() * 2 - 1
    this.speedY = Math.random() * 2 - 1
    this.color = `hsl(${Math.random() * 60 + 180}, 100%, 70%)` // 青色系
    this.opacity = Math.random() * 0.5 + 0.3
    this.pulseSpeed = Math.random() * 0.05 + 0.02
    this.pulsePhase = Math.random() * Math.PI * 2
  }
  
  update() {
    this.x += this.speedX
    this.y += this.speedY
    
    // 边界检查
    if (this.x < 0 || this.x > window.innerWidth) this.speedX *= -1
    if (this.y < 0 || this.y > window.innerHeight) this.speedY *= -1
    
    // 脉动效果
    this.pulsePhase += this.pulseSpeed
    const pulse = Math.sin(this.pulsePhase) * 0.5 + 0.5
    this.currentSize = this.size * (0.7 + pulse * 0.3)
    this.currentOpacity = this.opacity * (0.7 + pulse * 0.3)
  }
}

// 初始化粒子
const initParticles = () => {
  particles.value = []
  const particleCount = Math.min(50, Math.floor(window.innerWidth * window.innerHeight / 15000))
  
  for (let i = 0; i < particleCount; i++) {
    particles.value.push(new Particle())
  }
}

// 绘制连接线
const drawConnections = (ctx) => {
  const maxDistance = 150
  
  for (let i = 0; i < particles.value.length; i++) {
    for (let j = i + 1; j < particles.value.length; j++) {
      const dx = particles.value[i].x - particles.value[j].x
      const dy = particles.value[i].y - particles.value[j].y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < maxDistance) {
        const opacity = 1 - (distance / maxDistance)
        ctx.beginPath()
        ctx.strokeStyle = `rgba(100, 200, 255, ${opacity * 0.2})`
        ctx.lineWidth = 0.5
        ctx.moveTo(particles.value[i].x, particles.value[i].y)
        ctx.lineTo(particles.value[j].x, particles.value[j].y)
        ctx.stroke()
      }
    }
  }
}

// 动画循环
const animate = () => {
  const canvas = document.getElementById('ai-canvas')
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // 更新和绘制粒子
  particles.value.forEach(particle => {
    particle.update()
    
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.currentSize, 0, Math.PI * 2)
    ctx.fillStyle = particle.color
    ctx.globalAlpha = particle.currentOpacity
    ctx.fill()
    ctx.globalAlpha = 1
  })
  
  // 绘制连接线
  drawConnections(ctx)
  
  animationId.value = requestAnimationFrame(animate)
}

// 动态加载点
onMounted(() => {
  if (typeof __COM_LOGO_DATA__ !== 'undefined') {
    comLogo.value = `data:image/png;base64,${__COM_LOGO_DATA__}`
  } else {
    comLogo.value = '../assets/comlogo.png'
  }

  // 加载点动画
  const dotInterval = setInterval(() => {
    dots.value = dots.value.length >= 3 ? '' : dots.value + '.'
  }, 500)
  
  // 初始化canvas
  const canvas = document.getElementById('ai-canvas')
  if (canvas) {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    
    // 初始化粒子
    initParticles()
    
    // 开始动画
    animate()
  }
  
  // 窗口大小变化时重置
  const handleResize = () => {
    if (canvas) {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initParticles()
    }
  }
  
  window.addEventListener('resize', handleResize)
  
  onUnmounted(() => {
    clearInterval(dotInterval)
    if (animationId.value) {
      cancelAnimationFrame(animationId.value)
    }
    window.removeEventListener('resize', handleResize)
  })
})
</script>

<template>
  <div class="ai-loading-container">
    <!-- 背景canvas动画 -->
    <canvas 
      id="ai-canvas" 
      class="particle-canvas"
    ></canvas>
    
    <!-- 主内容 -->
    <div class="loading-content">
      <!-- AI标志 -->
      <div class="ai-logo">
        <div class="brain-icon">
          <!-- <div class="left-lobe"></div>
          <div class="right-lobe"></div>
          <div class="center-line"></div> -->
          <div class="logo-aura"></div>
          <img class="center-logo company-logo" :src="comLogo" alt="aa logo" />
          <div class="pulse-ring ring-1"></div>
          <div class="pulse-ring ring-2"></div>
          <div class="pulse-ring ring-3"></div>
        </div>
      </div>
      
      <!-- 标题 -->
      <h1 class="ai-title">
        <span class="text-gradient">{{ msg }}</span>
        <span class="loading-dots">{{ dots }}</span>
      </h1>
      
      <!-- 进度指示 -->
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill"></div>
          <div class="progress-pulse"></div>
        </div>
        <div class="progress-text">
          <!-- <span class="processing-text">Processing AI Request</span> -->
          <!-- <span class="percentage">{{ count % 101 }}%</span> -->
        </div>
      </div>
      
      <!-- 二进制流效果 -->
      <div class="binary-stream">
        <div 
          v-for="n in 20" 
          :key="n" 
          class="binary-digit"
          :style="{
            animationDelay: `${n * 0.1}s`,
            left: `${Math.random() * 100}%`
          }"
        >
          {{ Math.random() > 0.5 ? '1' : '0' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-loading-container {
  position: relative;
  width: 100%;
  height: 30vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #0a0e17 0%, #1a1f2e 100%);
}

.particle-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.loading-content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 800px;
  padding: 2rem;
}

/* AI大脑图标 */
.ai-logo {
  margin-bottom: 2rem;
}

.brain-icon {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto;
}

.left-lobe, .right-lobe {
  position: absolute;
  width: 50px;
  height: 80px;
  background: linear-gradient(45deg, #00dc82, #36e4da);
  border-radius: 50% 50% 40% 40%;
  top: 20px;
}

.left-lobe {
  left: 15px;
  transform: rotate(-15deg);
}

.right-lobe {
  right: 15px;
  transform: rotate(15deg);
}

.center-line {
  position: absolute;
  width: 20px;
  height: 100px;
  background: linear-gradient(to bottom, #00dc82, #36e4da);
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  border-radius: 10px;
}

.center-logo {
  position: absolute;
  width: 80px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.pulse-ring {
  position: absolute;
  border: 2px solid #36e4da;
  border-radius: 50%;
  width: 120px;
  height: 120px;
  left: 0;
  top: 0;
  opacity: 0;
}

.ring-1 {
  animation: pulse-ring 3s infinite linear;
}

.ring-2 {
  animation: pulse-ring 3s infinite linear 1s;
}

.ring-3 {
  animation: pulse-ring 3s infinite linear 2s;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* 标题样式 */
.ai-title {
  font-size: 2.5rem;
  margin-bottom: 2rem;
  font-weight: 700;
}

.text-gradient {
  background: linear-gradient(90deg, #00dc82, #36e4da, #00a8ff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  background-size: 200% auto;
  animation: gradient-shift 3s infinite linear;
}

.loading-dots {
  color: #36e4da;
}

@keyframes gradient-shift {
  0%, 100% {
    background-position: 0% center;
  }
  50% {
    background-position: 100% center;
  }
}

/* 进度条 */
.progress-container {
  margin: 2rem auto;
  width: 80%;
  max-width: 400px;
}

.progress-bar {
  position: relative;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  position: absolute;
  height: 100%;
  width: 30%;
  background: linear-gradient(90deg, #00dc82, #36e4da);
  border-radius: 4px;
  animation: progress-flow 2s infinite ease-in-out;
}

.progress-pulse {
  position: absolute;
  height: 100%;
  width: 20px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
  filter: blur(3px);
  animation: pulse-move 2s infinite linear;
}

@keyframes progress-flow {
  0%, 100% {
    width: 30%;
  }
  50% {
    width: 70%;
  }
}

@keyframes pulse-move {
  0% {
    left: -20px;
  }
  100% {
    left: calc(100% + 20px);
  }
}

.progress-text {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: #a0a0a0;
}

.processing-text {
  color: #36e4da;
}

.percentage {
  font-weight: bold;
  color: #00dc82;
}

/* 二进制流 */
.binary-stream {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.binary-digit {
  position: absolute;
  color: rgba(0, 220, 130, 0.3);
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
  animation: binary-fall 10s infinite linear;
}

@keyframes binary-fall {
  0% {
    transform: translateY(-100px);
    opacity: 0;
  }
  10% {
    opacity: 0.8;
  }
  90% {
    opacity: 0.8;
  }
  100% {
    transform: translateY(100vh);
    opacity: 0;
  }
}

/* 提示信息 */
.hint-text {
  margin-top: 3rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.hint-item {
  color: #888;
  font-size: 0.9rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  animation: hint-fade 6s infinite;
}

.hint-item:nth-child(2) {
  animation-delay: 2s;
}

.hint-item:nth-child(3) {
  animation-delay: 4s;
}

@keyframes hint-fade {
  0%, 100% {
    opacity: 0.3;
    transform: translateY(10px);
  }
  50% {
    opacity: 1;
    transform: translateY(0);
  }
}
.company-logo {
  z-index: 3;
  object-fit: contain;
  filter: 
    drop-shadow(0 0 20px rgba(0, 220, 130, 0.7))
    brightness(1.1);
  animation: spectrum-glow 3s infinite alternate;
}

.logo-aura {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 160px;
  height: 160px;
  background: radial-gradient(
    circle at center,
    rgba(0, 220, 130, 0.3) 0%,
    rgba(54, 228, 218, 0.2) 30%,
    transparent 70%
  );
  filter: blur(20px);
  animation: aura-pulse 4s infinite alternate;
}

/* .data-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border: 1px dashed rgba(0, 220, 130, 0.4);
  border-radius: 50%;
  animation: ring-rotate 20s linear infinite;
} */

@keyframes logo-float {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-10px) scale(1.05);
  }
}



@keyframes aura-pulse {
  0% {
    opacity: 0.4;
    transform: translate(-50%, -50%) scale(0.9);
  }
  100% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(1.1);
  }
}

@keyframes logo-glow {
  0% {
    filter: 
      brightness(1) 
      drop-shadow(0 0 5px rgba(0, 220, 130, 0.3))
      drop-shadow(0 0 10px rgba(0, 220, 130, 0.2));
  }
  50% {
    filter: 
      brightness(1.5) 
      drop-shadow(0 0 15px rgba(0, 220, 130, 0.8))
      drop-shadow(0 0 30px rgba(54, 228, 218, 0.6))
      drop-shadow(0 0 45px rgba(0, 168, 255, 0.3));
  }
  100% {
    filter: 
      brightness(1) 
      drop-shadow(0 0 5px rgba(0, 220, 130, 0.3))
      drop-shadow(0 0 10px rgba(0, 220, 130, 0.2));
  }
}

@keyframes energy-burst {
  0%, 70% {
    filter: 
      brightness(1)
      drop-shadow(0 0 5px rgba(0, 220, 130, 0.3));
  }
  75% {
    filter: 
      brightness(2.5)
      drop-shadow(0 0 30px rgba(0, 220, 130, 1))
      drop-shadow(0 0 60px rgba(54, 228, 218, 0.8))
      drop-shadow(0 0 90px rgba(255, 255, 255, 0.6));
  }
  85% {
    filter: 
      brightness(2)
      drop-shadow(0 0 20px rgba(0, 220, 130, 0.8))
      drop-shadow(0 0 40px rgba(54, 228, 218, 0.6));
  }
  100% {
    filter: 
      brightness(1)
      drop-shadow(0 0 5px rgba(0, 220, 130, 0.3));
  }
}

@keyframes spectrum-glow {
  0% {
    filter: 
      brightness(1.2)
      drop-shadow(0 0 15px rgba(255, 0, 100, 0.7))
      drop-shadow(0 0 25px rgba(255, 100, 0, 0.5));
  }
  33% {
    filter: 
      brightness(1.2)
      drop-shadow(0 0 15px rgba(0, 220, 130, 0.7))
      drop-shadow(0 0 25px rgba(54, 228, 218, 0.5));
  }
  66% {
    filter: 
      brightness(1.2)
      drop-shadow(0 0 15px rgba(0, 100, 255, 0.7))
      drop-shadow(0 0 25px rgba(100, 0, 255, 0.5));
  }
  100% {
    filter: 
      brightness(1.2)
      drop-shadow(0 0 15px rgba(255, 0, 100, 0.7))
      drop-shadow(0 0 25px rgba(255, 100, 0, 0.5));
  }
}
</style>