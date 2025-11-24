const { execFile, exec } = require("node:child_process");
const { promisify } = require("node:util");

const execP = promisify(exec);

class EnvironmentManager {
  constructor() {
    this.cachedEnv = null;
    this.lastRefresh = 0;
  }
  
  async getEnvironment(forceRefresh = false) {
    if(process.platform === 'darwin') {
        return { ...process.env };
    }

    // 缓存 30 秒
    if (!forceRefresh && this.cachedEnv && (Date.now() - this.lastRefresh < 30000)) {
      return this.cachedEnv;
    }
    
    try {
      const { stdout } = await execP(`/bin/bash -c '
        # 加载用户环境
        [ -f ~/.bashrc ] && source ~/.bashrc >/dev/null 2>&1
        [ -f ~/.bash_profile ] && source ~/.bash_profile >/dev/null 2>&1
        # 加载 conda
        [ -f ~/miniconda3/etc/profile.d/conda.sh ] && source ~/miniconda3/etc/profile.d/conda.sh >/dev/null 2>&1
        [ -f ~/anaconda3/etc/profile.d/conda.sh ] && source ~/anaconda3/etc/profile.d/conda.sh >/dev/null 2>&1
        # 输出环境
        env
      '`, {
        timeout: 30000,
        env: { ...process.env }
      });
      
      const freshEnv = {};
      stdout.toString().split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          freshEnv[key] = valueParts.join('=');
        }
      });
      
      this.cachedEnv = freshEnv;
      this.lastRefresh = Date.now();
      return freshEnv;
      
    } catch (e) {
      console.error('Failed to refresh environment, using cached:', e.message);
      return this.cachedEnv || { ...process.env };
    }
  }
  
}

// 全局环境管理器
const envManager = new EnvironmentManager();

module.exports = {
  envManager
};
