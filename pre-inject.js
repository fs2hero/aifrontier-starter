// pre-inject.js
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

console.log('🔨 准备 SEA 注入...');

function preInject() {
  try {
    // 1. 查找 node.exe 路径
    let nodePath;
    
    if (process.platform === 'win32') {
      // Windows: 使用 where 命令
      try {
        nodePath = execSync('where node', { encoding: 'utf8' }).trim().split('\n')[0];
      } catch (error) {
        console.error('❌ 未找到 Node.js');
        process.exit(1);
      }
    } else {
      // Unix: 使用 which 命令
      try {
        nodePath = execSync('which node', { encoding: 'utf8' }).trim();
      } catch (error) {
        console.error('❌ 未找到 Node.js');
        process.exit(1);
      }
    }
    
    console.log(`找到 Node.js: ${nodePath}`);
    
    // 2. 确保 dist 目录存在
    const distDir = 'dist';
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    
    // 3. 复制 node 可执行文件
    const outputName = process.platform === 'win32' ? 'aifrontier.exe' : 'aifrontier';
    const outputPath = path.join(distDir, outputName);
    
    fs.copyFileSync(nodePath, outputPath);
    console.log(`✅ 已复制到 ${outputPath}`);
    
    // 4. 处理代码签名（仅 macOS）
    if (process.platform === 'darwin') {
      try {
        execSync(`codesign --remove-signature "${outputPath}"`);
        console.log('✅ 已移除代码签名');
      } catch (error) {
        console.log('⚠️  代码签名移除失败（可能不需要）');
      }
    } else {
      console.log('ℹ️  非 macOS 系统，跳过代码签名步骤');
    }
    
    console.log('✅ 预注入准备完成！');
    
  } catch (error) {
    console.error('❌ 预注入失败:', error.message);
    process.exit(1);
  }
}

preInject();