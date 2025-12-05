#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const https = require('https');
const http = require('http');
const { execSyncAsync } = require('./sys_utils')

class CoreutilsInstaller {
  constructor(options = {}) {
    this.platform = os.platform();
    this.arch = os.arch();
    this.silent = options.silent !== false;
    this.installMethod = options.installMethod || 'auto';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    this.logger =  options.logger ? options.logger : (msg) => console.log(msg);
  }

  // 检查是否已安装 coreutils
  async isCoreutilsInstalledAsync() {
    try {
      if (this.platform === 'win32') {
        // Windows: 检查常见的位置
        const testCommands = [
          'ls --version',
          'grep --version',
          'find --version'
        ];
        
        for(const cmd of testCommands) {
          try {
            await execSyncAsync(cmd, { stdio: 'ignore' });
            return true;
          } catch {
            return false;
          }
        }
      } else {
        // Unix-like 系统通常已安装
        const cmd = this.platform === 'darwin' ? 'command -v greadlink && greadlink --version' : 'command -v readlink && readlink --version';
        await execSyncAsync(cmd, { stdio: 'ignore' });
        return true;
      }
    } catch {
      return false;
    }
  }

  // 检测已安装的 coreutils 环境
  async detectCoreutilsEnvironmentAsync() {
    try {
      // 检查 Git Bash
      try {
        await execSyncAsync('git --version', { stdio: 'ignore' });
        const gitBashPath = 'C:\\Program Files\\Git\\bin\\ls.exe';
        if (fs.existsSync(gitBashPath)) {
          return 'git-bash';
        }
      } catch {}

      // 检查 WSL
      try {
        await execSyncAsync('wsl ls --version', { stdio: 'ignore' });
        return 'wsl';
      } catch {}

      // 检查 Cygwin
      const cygwinPaths = [
        'C:\\cygwin64\\bin\\ls.exe',
        'C:\\cygwin\\bin\\ls.exe'
      ];
      if (cygwinPaths.some(path => fs.existsSync(path))) {
        return 'cygwin';
      }

      // 检查 MSYS2
      const msys2Paths = [
        'C:\\msys64\\usr\\bin\\ls.exe',
        'C:\\msys32\\usr\\bin\\ls.exe'
      ];
      if (msys2Paths.some(path => fs.existsSync(path))) {
        return 'msys2';
      }

      // 检查 Chocolatey coreutils
      try {
        await execSyncAsync('choco list --local-only | findstr coreutils', { stdio: 'ignore' });
        return 'chocolatey';
      } catch {}

      return null;
    } catch {
      return null;
    }
  }

  // 获取安装方法推荐
  async getRecommendedInstallMethodAsync() {
    if (this.platform !== 'win32') {
      return 'native'; // Unix-like 系统通常已安装
    }

    const existingEnv = await this.detectCoreutilsEnvironmentAsync();
    if (existingEnv) {
      return existingEnv;
    }

    // 根据系统环境推荐
    try {
      // 检查是否已安装 Chocolatey
      await execSyncAsync('choco --version', { stdio: 'ignore' });
      return 'chocolatey';
    } catch {}

    try {
      // 检查是否已安装 Git
      await execSyncAsync('git --version', { stdio: 'ignore' });
      return 'git-bash';
    } catch {}

    return 'git-bash'; // 默认推荐 Git Bash
  }

  // 安装 Git for Windows (包含 coreutils)
  async installGitBash() {
    this.logger('📦 Installing Git for Windows (includes coreutils)...');

    const tempDir = os.tmpdir();
    const downloadUrl = 'https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe';
    const installerPath = path.join(tempDir, 'GitInstaller.exe');

    try {
      // 下载
      await this.downloadFile(downloadUrl, installerPath);
      
      this.logger('🔧 Installing Git for Windows...');
      
      // 静默安装参数
      const args = [
        '/VERYSILENT',
        '/NORESTART',
        '/NOCANCEL',
        '/SP-',
        '/CLOSEAPPLICATIONS',
        '/RESTARTAPPLICATIONS',
        '/COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"'
      ];

      return new Promise((resolve, reject) => {
        const installProcess = spawn(installerPath, args, {
          stdio: this.silent ? 'ignore' : 'inherit'
        });

        installProcess.on('close', (code) => {
          if (code === 0) {
            this.logger('✅ Git for Windows installed successfully!');
            this.logger('💡 Coreutils are available in Git Bash and added to PATH');
            resolve(true);
          } else {
            reject(new Error(`Git installation failed with exit code: ${code}`));
          }
        });

        installProcess.on('error', reject);
      });

    } catch (error) {
      throw new Error(`Git Bash installation failed: ${error.message}`);
    } finally {
      if (fs.existsSync(installerPath)) {
        fs.unlinkSync(installerPath);
      }
    }
  }

  // 通过 Chocolatey 安装 coreutils
  async installWithChocolatey() {
    this.logger('🍫 Installing coreutils via Chocolatey...');

    try {
      // 检查 Chocolatey 是否已安装
      try {
        await execSyncAsync('choco --version', { stdio: 'ignore' });
      } catch {
        throw new Error('Chocolatey is not installed. Please install Chocolatey first.');
      }

      await execSyncAsync('choco install coreutils -y', {
        stdio: this.silent ? 'ignore' : 'inherit'
      });

      this.logger('✅ Coreutils installed via Chocolatey!');
      return true;

    } catch (error) {
      throw new Error(`Chocolatey installation failed: ${error.message}`);
    }
  }

  // 安装 WSL (Windows Subsystem for Linux)
  async installWSL() {
    this.logger('🐧 Installing Windows Subsystem for Linux...');

    try {
      // 检查是否已启用 WSL
      try {
        await execSyncAsync('wsl --list', { stdio: 'ignore' });
        this.logger('✅ WSL is already installed');
        return true;
      } catch {}

      // 启用 WSL 功能
      this.logger('🔧 Enabling WSL feature...');
      await execSyncAsync('dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', {
        stdio: this.silent ? 'ignore' : 'inherit'
      });

      // 安装默认的 Linux 发行版 (Ubuntu)
      this.logger('📥 Installing Ubuntu...');
      await execSyncAsync('wsl --install -d Ubuntu', {
        stdio: this.silent ? 'ignore' : 'inherit'
      });

      this.logger('✅ WSL installed successfully!');
      this.logger('💡 Coreutils are available in WSL Ubuntu environment');
      return true;

    } catch (error) {
      throw new Error(`WSL installation failed: ${error.message}`);
    }
  }

  // Unix-like 系统安装/更新 coreutils
  async installOnUnix() {
    this.logger('🔧 Ensuring coreutils are available...');

    try {
      if (this.platform === 'darwin') {
        // macOS: 使用 Homebrew 安装最新版本
        try {
          await execSyncAsync('brew --version', { stdio: 'ignore' });
          this.logger('📦 Updating coreutils via Homebrew...');
          await execSyncAsync('brew install coreutils', {
            stdio: this.silent ? 'ignore' : 'inherit'
          });
        } catch {
          this.logger('ℹ️  Coreutils are available via system commands');
        }
      } else {
        // Linux: 使用包管理器
        if (fs.existsSync('/etc/debian_version')) {
          // Debian/Ubuntu
          await execSyncAsync('sudo apt update && sudo apt install -y coreutils', {
            stdio: this.silent ? 'ignore' : 'inherit'
          });
        } else if (fs.existsSync('/etc/redhat-release')) {
          // RedHat/CentOS
          await execSyncAsync('sudo yum install -y coreutils', {
            stdio: this.silent ? 'ignore' : 'inherit'
          });
        } else if (fs.existsSync('/etc/alpine-release')) {
          // Alpine
          await execSyncAsync('sudo apk add coreutils', {
            stdio: this.silent ? 'ignore' : 'inherit'
          });
        }
      }

      this.logger('✅ Coreutils are ready!');
      return true;

    } catch (error) {
      this.logger(`⚠️  Coreutils setup note:, ${error.message}`);
      return true; // Unix-like 系统通常已有基本 coreutils
    }
  }

  // 下载文件
  async downloadFile(url, destination, retries = 3) {
    return new Promise((resolve, reject) => {
      const attemptDownload = (attempt = 1) => {
        const file = fs.createWriteStream(destination);
        const protocol = url.startsWith('https') ? https : http;
        
        const options = {
          headers: { 'User-Agent': this.userAgent }
        };

        const request = protocol.get(url, options, (response) => {
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const redirectUrl = new URL(response.headers.location, url).href;
            file.destroy();
            if (fs.existsSync(destination)) fs.unlinkSync(destination);
            this.downloadFile(redirectUrl, destination, retries).then(resolve).catch(reject);
            return;
          }

          if (response.statusCode !== 200) {
            file.destroy();
            if (fs.existsSync(destination)) fs.unlinkSync(destination);
            if (attempt < retries) {
              setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
            } else {
              reject(new Error(`Download failed: ${response.statusCode}`));
            }
            return;
          }

          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
          file.on('error', reject);
        });

        request.on('error', (err) => {
          if (fs.existsSync(destination)) fs.unlinkSync(destination);
          if (attempt < retries) {
            setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
          } else {
            reject(err);
          }
        });

        request.setTimeout(30000, () => {
          request.destroy();
          if (attempt < retries) {
            setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
          } else {
            reject(new Error('Download timeout'));
          }
        });
      };

      attemptDownload();
    });
  }

  // 验证安装
  async verifyInstallation() {
    try {
      const testCommands = [
        { cmd: 'timeout --version', name: 'timeout' },
        // { cmd: 'grep --version', name: 'grep' },
        // { cmd: 'find --version', name: 'find' },
        // { cmd: 'sed --version', name: 'sed' },
        // { cmd: 'awk --version', name: 'awk' }
      ];

      const availableTools = [];
      
      for (const test of testCommands) {
        try {
          await execSyncAsync(test.cmd, { stdio: 'ignore' });
          availableTools.push(test.name);
        } catch {
          // 工具不可用
        }
      }

      if (availableTools.length > 0) {
        this.logger(`✅ Coreutils available: ${availableTools.join(', ')}`);
        return true;
      } else {
        throw new Error('No coreutils tools found');
      }

    } catch (error) {
      console.error('❌ Coreutils verification failed:', error.message);
      return false;
    }
  }

  // 显示使用信息
  showUsageInfo(installMethod) {
    this.logger('\n🎉 Coreutils installation completed!');
    this.logger('\n📋 Usage information:');
    
    switch (installMethod) {
      case 'git-bash':
        this.logger('• Use Git Bash for full Unix-like experience');
        this.logger('• Coreutils are available in Git Bash and Windows Command Prompt');
        this.logger('• Common commands: ls, grep, find, sed, awk, wc, sort');
        break;
      case 'wsl':
        this.logger('• Use WSL for full Linux environment');
        this.logger('• Run: wsl  to enter Linux environment');
        this.logger('• All standard coreutils are available');
        break;
      case 'chocolatey':
        this.logger('• Coreutils are available in Windows Command Prompt');
        this.logger('• Use standard Unix commands directly');
        break;
      default:
        this.logger('• Coreutils are now available in your terminal');
    }
    
    this.logger('\n🔧 Test commands:');
    this.logger('   ls -la');
    this.logger('   grep "pattern" filename');
    this.logger('   find . -name "*.txt"');
  }

  // 主安装方法
  async install() {
    this.logger(`🚀 Setting up coreutils for ${this.platform}-${this.arch}...`);

    // 检查是否已安装
    if (await this.isCoreutilsInstalledAsync()) {
      const env = await this.detectCoreutilsEnvironmentAsync();
      this.logger(`ℹ️  Coreutils are already available via ${env || 'system'}`);
      this.showUsageInfo(env);
      return;
    }

    // Unix-like 系统处理
    if (this.platform !== 'win32') {
      await this.installOnUnix();
      await this.verifyInstallation();
      this.showUsageInfo('native');
      return;
    }

    // Windows 系统安装
    try {
      const recommendedMethod = this.getRecommendedInstallMethod();
      this.logger(`💡 Recommended installation method: ${recommendedMethod}`);

      let success = false;
      let usedMethod = this.installMethod === 'auto' ? recommendedMethod : this.installMethod;

      switch (usedMethod) {
        case 'git-bash':
          success = await this.installGitBash();
          break;
        case 'chocolatey':
          success = await this.installWithChocolatey();
          break;
        case 'wsl':
          success = await this.installWSL();
          break;
        default:
          throw new Error(`Unsupported installation method: ${usedMethod}`);
      }

      if (success) {
        const verified = await this.verifyInstallation();
        if (verified) {
          this.showUsageInfo(usedMethod);
        } else {
          this.logger('⚠️  Installation completed but verification failed');
          this.logger('💡 You may need to restart your terminal');
        }
      }

    } catch (error) {
      console.error('❌ Installation failed:', error.message);
      this.logger('\n💡 Alternative options:');
      this.logger('1. Install Git for Windows: https://git-scm.com/download/win');
      this.logger('2. Enable WSL: https://docs.microsoft.com/en-us/windows/wsl/install');
      this.logger('3. Use Chocolatey: choco install coreutils');
      
      process.exit(1);
    }
  }
}

// CLI 参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    silent: false,
    installMethod: 'auto'
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--silent':
        options.silent = true;
        break;
      case '--method':
        options.installMethod = args[++i];
        break;
      case '--help':
        showHelp();
        process.exit(0);
    }
  }
  
  return options;
}

function showHelp() {
  console.log(`
Coreutils Installer - Cross-platform coreutils setup

Usage:
  node coreutils_installer.js [options]

Options:
  --silent              Silent mode
  --method <method>     Installation method (auto, git-bash, chocolatey, wsl)
  --help                Show this help message

Installation methods for Windows:
  auto                 Auto-detect best method (default)
  git-bash             Install Git for Windows (recommended)
  chocolatey           Install via Chocolatey
  wsl                  Install Windows Subsystem for Linux

Examples:
  # Auto-detect and install
  node coreutils_installer.js

  # Install Git for Windows specifically
  node coreutils_installer.js --method git-bash

  # Silent installation
  node coreutils_installer.js --silent
  `);
}

// 主执行函数
async function main() {
  const options = parseArgs();
  const installer = new CoreutilsInstaller(options);
  
  await installer.install();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = CoreutilsInstaller;