const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
var SingleInstance = require('single-instance');

class FirefoxLauncher {
  constructor(firefoxPath, defaultUrl) {
    this.defaultUrl = defaultUrl;
    this.firefoxPath = firefoxPath;

    this.appName = this.extractAppName(firefoxPath);
    
    // 根据URL生成唯一的profileId
    const urlHash = crypto.createHash('md5').update(defaultUrl).digest('hex').substring(0, 12);
    this.profileId = `firefox-${urlHash}`;
    
    // 使用持久化目录
    const homeDir = os.homedir();
    this.profileBaseDir = path.join(homeDir, '.firefox-launcher-profiles');
    this.profileDir = path.join(this.profileBaseDir, this.profileId);
    
    this.process = null;
    this.sessionManager = new SessionManager(this.profileBaseDir);

    this.appLocker = new SingleInstance('my-aifrontier-app');
  }

  extractAppName(exePath) {
    // 从路径提取应用名称
    const appMatch = exePath.match(/\/([^\/]+)\.app\//);

    console.log(`extractAppName ${exePath} ====> ${appMatch}`)
    return appMatch ? appMatch[1] : 'Acefox';
  }

  async getRunningProcesses() {
    return new Promise((resolve) => {
      const cmd = `ps aux | grep "${this.appName}" | grep -v grep`;
      exec(cmd, (error, stdout) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }
        
        const processes = [];
        const lines = stdout.trim().split('\n');
        
        lines.forEach(line => {
          const parts = line.split(/\s+/);
          if (parts.length >= 11) {
            processes.push({
              pid: parseInt(parts[1]),
              user: parts[0],
              cpu: parts[2],
              mem: parts[3],
              command: parts.slice(10).join(' '),
            });
          }
        });
        
        resolve(processes);
      });
    });
  }
  
  // async isAcefoxExist() {
  //   try {
  //     const processes = await this.getRunningProcesses();

  //     return processes.length > 0 ? true : false;
  //   } catch(err) {
  //     console.log(`firefox.isExist ${err.message}`)
  //     return false;
  //   }
    
  // }
  async isAcefoxExist() {
    return new Promise(resolve => {
      this.appLocker.lock()
      .then(function() {
        // We just locked our application,
        // now we can do what we want !
        console.log(`app locker success`)
        resolve(false)
      })
      .catch(function(err) {
        console.log(err);
        // Quit the application
        console.log(`app locker fail ${err}`)
        resolve(true)
      })
    })
  }


  // 获取或创建配置文件
  async getOrCreateProfile() {
    console.log(`配置文件目录: ${this.profileDir}`);
    
    // 检查是否已有此URL的配置
    const existingSession = this.sessionManager.getSessionByUrl(this.defaultUrl);
    const profileExists = fs.existsSync(this.profileDir);
    
    if (profileExists && existingSession) {
      console.log(`复用现有配置: ${this.profileId}`);
      
      // 清理可能损坏的会话文件
      this.cleanupCorruptedFiles();
      
      // 更新会话信息
      this.sessionManager.updateSession(this.profileId, {
        url: this.defaultUrl,
        lastLaunched: new Date().toISOString(),
        launchCount: (existingSession.launchCount || 0) + 1
      });
      
      return path.join(this.profileDir, this.profileId);
    }
    
    // 创建新配置
    console.log(`创建新配置: ${this.profileId}`);
    return await this.createNewProfile();
  }

  // 创建新配置
  async createNewProfile() {
    // 确保目录存在
    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }

    // 创建配置文件目录
    const profileDataDir = path.join(this.profileDir, this.profileId);
    fs.mkdirSync(profileDataDir, { recursive: true });

    // 创建配置文件
    this.createProfileFiles(profileDataDir);

    // 记录新会话
    this.sessionManager.addSession({
      id: this.profileId,
      url: this.defaultUrl,
      profileDir: this.profileDir,
      created: new Date().toISOString(),
      lastLaunched: new Date().toISOString(),
      launchCount: 1
    });

    return profileDataDir;
  }

  // 创建配置文件
  createProfileFiles(profileDataDir) {
    // user.js
    const userJsPath = path.join(profileDataDir, 'user.js');
    fs.writeFileSync(userJsPath, this.createUserConfig());

    // prefs.js
    const prefsPath = path.join(profileDataDir, 'prefs.js');
    fs.writeFileSync(prefsPath, this.createPrefsConfig());

    // profiles.ini
    const profilesIni = path.join(this.profileDir, 'profiles.ini');
    const iniContent = `
[General]
StartWithLastProfile=0

[Profile0]
Name=${this.profileId}
IsRelative=1
Path=${this.profileId}
Default=1
    `.trim();
    fs.writeFileSync(profilesIni, iniContent);
  }

  // 创建用户配置
  createUserConfig() {
    return `
user_pref("browser.startup.homepage", "${this.defaultUrl}");
user_pref("browser.startup.page", 1);
user_pref("browser.newtab.url", "${this.defaultUrl}");
user_pref("browser.newtabpage.enabled", false);
user_pref("browser.sessionstore.enabled", false);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.restore_on_demand", false);
user_pref("browser.sessionstore.resume_session_once", false);
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.systemAddon.update.enabled", false);
user_pref("lightweightThemes.update.enabled", false);
user_pref("app.update.auto", false);
user_pref("app.update.enabled", false);
user_pref("browser.cache.disk.enable", true);
user_pref("signon.rememberSignons", true);
user_pref("network.cookie.lifetimePolicy", 0);
user_pref("privacy.clearOnShutdown.cookies", false);
user_pref("privacy.clearOnShutdown.history", false);
user_pref("browser.startup.firstrun", false);
user_pref("datareporting.policy.firstRunURL", "");
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("devtools.chrome.enabled", true);
user_pref("devtools.debugger.remote-enabled", true);
user_pref("marionette.enabled", true);
    `.trim();
  }

  createPrefsConfig() {
    return `
user_pref("browser.startup.homepage", "${this.defaultUrl}");
user_pref("browser.startup.page", 1);
user_pref("browser.shell.checkDefaultBrowser", false);
    `.trim();
  }

  // 清理可能损坏的文件
  cleanupCorruptedFiles() {
    const profileDataDir = path.join(this.profileDir, this.profileId);
    
    if (!fs.existsSync(profileDataDir)) return;
    
    // 清理可能引起问题的文件
    const filesToClean = [
      'addonStartup.json.lz4',
      'extensions.json',
      'sessionCheckpoints.json',
      'xulstore.json'
    ];
    
    filesToClean.forEach(file => {
      const filePath = path.join(profileDataDir, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {}
      }
    });
  }

  // 主启动方法
  async launch(options = {}) {
    console.log(`启动 Firefox: ${this.defaultUrl}`);
    
    // 尝试多种启动方法
    let process = null;
    
    try {
      // 方法1：直接启动
      process = await this.launchDirect(options);
    } catch (error) {
      console.log(`直接启动失败: ${error.message}`);
      
      // 方法2：使用 open 命令（macOS）
      if (process.platform === 'darwin') {
        try {
          process = await this.launchWithOpenCommand(options);
        } catch (openError) {
          console.log(`open 命令启动失败: ${openError.message}`);
          
          // 方法3：终止其他实例后重试
          if (options.forceKillOtherInstances) {
            await this.killOtherFirefoxInstances();
            process = await this.launchDirect(options);
          }
        }
      }
    }
    
    if (!process) {
      throw new Error('所有启动方法都失败了');
    }
    
    this.process = process;
    this.setupProcessListeners(options);
    
    return process;
  }

  // 直接启动方法
  async launchDirect(options) {
    const profileDir = await this.getOrCreateProfile();
    
    const args = this.buildLaunchArgs(profileDir, options);
    console.log(`启动命令: ${this.firefoxPath} ${args.join(' ')}`);
    
    const env = {
      ...process.env,
      MOZ_NO_REMOTE: '1',
      MOZ_DISABLE_AUTO_SAFE_MODE: '1'
    };
    
    return spawn(this.firefoxPath, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env
    });
  }

  // 构建启动参数
  buildLaunchArgs(profileDir, options) {
    const args = [
      '--profile', profileDir,
      '--new-instance',
      '--no-remote',
      '--silent'
    ];
    
    // macOS 特定参数
    if (process.platform === 'darwin') {
      args.push('--new-window');
      args.push('--foreground');
    }
    
    // 自定义参数
    if (options.width && options.height) {
      args.push('--width', options.width.toString());
      args.push('--height', options.height.toString());
    }
    
    if (options.headless) {
      args.push('--headless');
    }
    
    if (options.debugPort) {
      args.push(`--remote-debugging-port=${options.debugPort}`);
    }
    
    // URL 参数
    args.push('-url', this.defaultUrl);
    
    return args;
  }

  // 使用 open 命令启动（macOS）
  async launchWithOpenCommand(options) {
    return new Promise((resolve, reject) => {
      const profileDir = path.join(this.profileDir, this.profileId);
      
      const args = [
        '-a', 'Firefox',
        '--args',
        '--profile', profileDir,
        '--new-instance',
        '--no-remote',
        '--silent',
        '-url', this.defaultUrl
      ];
      
      if (options.debugPort) {
        args.push(`--remote-debugging-port=${options.debugPort}`);
      }
      
      console.log(`使用 open 命令: open ${args.join(' ')}`);
      
      const process = spawn('open', args, {
        detached: true,
        stdio: 'ignore'
      });
      
      process.on('error', reject);
      
      process.on('exit', (code) => {
        if (code === 0) {
          // 创建一个伪进程对象以便管理
          const pseudoProcess = {
            killed: false,
            exited: false,
            kill: () => {
              console.log('通过 open 命令启动的进程，无法直接终止');
            }
          };
          resolve(pseudoProcess);
        } else {
          reject(new Error(`open 命令退出码: ${code}`));
        }
      });
    });
  }

  // 杀死其他 Firefox 实例
  async killOtherFirefoxInstances() {
    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        exec('pkill -f "Firefox.app" 2>/dev/null || true', () => {
          console.log('已终止其他 Firefox 实例');
          // 等待一下确保进程完全终止
          setTimeout(resolve, 1000);
        });
      } else {
        exec('taskkill /F /IM firefox.exe 2>nul', () => {
          console.log('已终止其他 Firefox 实例');
          setTimeout(resolve, 1000);
        });
      }
    });
  }

  // 设置进程监听器
  setupProcessListeners(options) {
    if (!this.process) return;
    
    // 输出处理
    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`[${this.profileId}]`, output);
      });
    }
    
    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.error(`[${this.profileId}]`, output);
      });
    }
    
    // 事件监听
    this.process.on('exit', (code, signal) => {
      console.log(`[${this.profileId}] 退出 - 代码: ${code}, 信号: ${signal}`);
      
      this.sessionManager.updateSession(this.profileId, {
        lastExited: new Date().toISOString(),
        exitCode: code,
        exitSignal: signal
      });
      
      if (options.onExit) options.onExit(code, signal);
    });
  }

  // 关闭实例
  close() {
    if (this.process && typeof this.process.kill === 'function' && !this.process.killed) {
      console.log(`关闭 ${this.profileId}`);
      this.process.kill('SIGTERM');
    }
  }
}

// 会话管理器（保持不变）
class SessionManager {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.sessionsFile = path.join(baseDir, 'sessions.json');
    this.sessions = this.loadSessions();
    
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  loadSessions() {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        const data = fs.readFileSync(this.sessionsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('加载会话数据失败:', error);
    }
    return {};
  }

  saveSessions() {
    try {
      fs.writeFileSync(this.sessionsFile, JSON.stringify(this.sessions, null, 2));
    } catch (error) {
      console.error('保存会话数据失败:', error);
    }
  }

  addSession(session) {
    this.sessions[session.id] = session;
    this.saveSessions();
  }

  updateSession(id, updates) {
    if (this.sessions[id]) {
      this.sessions[id] = { ...this.sessions[id], ...updates };
      this.saveSessions();
    }
  }

  removeSession(id) {
    if (this.sessions[id]) {
      delete this.sessions[id];
      this.saveSessions();
    }
  }

  getSession(id) {
    return this.sessions[id] || null;
  }

  getSessionByUrl(url) {
    const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
    const profileId = `firefox-${urlHash}`;
    return this.sessions[profileId] || null;
  }

  getAllSessions() {
    return this.sessions;
  }

  cleanupOldSessions(maxAgeDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    
    let cleanedCount = 0;
    
    for (const [id, session] of Object.entries(this.sessions)) {
      const lastLaunched = new Date(session.lastLaunched || session.created);
      
      if (lastLaunched < cutoffDate) {
        const profileDir = path.join(this.baseDir, id);
        if (fs.existsSync(profileDir)) {
          try {
            fs.rmSync(profileDir, { recursive: true, force: true });
          } catch (error) {
            console.error(`清理失败 ${profileDir}:`, error);
          }
        }
        
        delete this.sessions[id];
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.saveSessions();
      console.log(`已清理 ${cleanedCount} 个旧会话`);
    }
    
    return cleanedCount;
  }
}

// 使用示例
async function testReuse() {
  const firefoxPath = '/Users/ganlei/Workspaces/aifrontier/bundle_data/Acefox.app/Contents/MacOS/firefox';
  const url = 'https://github.com';
  
  console.log('=== 第一次启动 ===');
  const launcher1 = new FirefoxLauncher(firefoxPath, url);
  const p1 = await launcher1.launch({
    width: 800,
    height: 600,
    debugPort: 9222,
    onExit: (code) => {
      console.log(`进程退出，代码: ${code}`);
    }
  });
  
  // 等待10秒
  console.log('等待10秒...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  console.log('\n=== 第二次启动（应复用配置） ===');
  const launcher2 = new FirefoxLauncher(firefoxPath, url);
  const p2 = await launcher2.launch({
    width: 1024,
    height: 768,
    debugPort: 9223,
    onExit: (code) => {
      console.log(`进程退出，代码: ${code}`);
    }
  });
  
  // 查看会话信息
  console.log('\n会话信息:');
  console.log(JSON.stringify(launcher2.getSessionInfo(), null, 2));
  
  // 30秒后关闭
  setTimeout(() => {
    console.log('\n关闭实例...');
    launcher1.close();
    launcher2.close();
  }, 30000);
}

// 导出
module.exports = {
  FirefoxLauncher,
  SessionManager
};

// 如果直接运行，执行测试
if (require.main === module) {
  testReuse().catch(console.error);
}