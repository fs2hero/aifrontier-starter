#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const https = require('https');
const http = require('http');
const { execSyncAsync } = require('./sys_utils');

class MinicondaInstaller {
  constructor(options = {}) {
    this.platform = os.platform();
    this.arch = os.arch();
    
    // 修复路径处理
    this.installDir = this.normalizePath(options.installDir || path.join(os.homedir(), 'miniconda3'));
    this.silent = options.silent !== false;
    this.initializeShell = options.initializeShell !== false;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    this.logger = options.logger ? options.logger : (msg) => console.log(msg);
  }

  // 标准化路径，处理 Windows 路径问题
  normalizePath(dirPath) {
    if(!path.isAbsolute(dirPath)) {
      dirPath = path.join(process.cwd(), dirPath);
    }
    let normalized = path.resolve(dirPath);
    
    // 确保目录存在
    if (!fs.existsSync(normalized)) {
      fs.mkdirSync(normalized, { recursive: true });
    }
    
    // Windows 下返回带引号的路径，防止空格问题
    if (this.platform === 'win32') {
      return `"${normalized}"`;
    }
    
    return normalized;
  }

  // 获取平台特定的下载 URL
  getDownloadUrl() {
    const baseUrl = 'https://repo.anaconda.com/miniconda';
    
    const urlMap = {
      'win32': {
        'x64': `${baseUrl}/Miniconda3-latest-Windows-x86_64.exe`,
        'arm64': `${baseUrl}/Miniconda3-latest-Windows-arm64.exe`
      },
      'darwin': {
        'x64': `${baseUrl}/Miniconda3-latest-MacOSX-x86_64.sh`,
        'arm64': `${baseUrl}/Miniconda3-latest-MacOSX-arm64.sh`
      },
      'linux': {
        'x64': `${baseUrl}/Miniconda3-latest-Linux-x86_64.sh`,
        'arm64': `${baseUrl}/Miniconda3-latest-Linux-aarch64.sh`
      }
    };

    const platformUrls = urlMap[this.platform];
    if (!platformUrls) {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }

    const url = platformUrls[this.arch] || platformUrls.x64;
    if (!url) {
      throw new Error(`Unsupported architecture: ${this.arch} for platform: ${this.platform}`);
    }

    return url;
  }

  // 下载文件
  async downloadFile(url, destination, retries = 3) {
    return new Promise((resolve, reject) => {
      const attemptDownload = (attempt = 1) => {
        this.logger(`📥 Downloading Miniconda from: ${url} (attempt ${attempt}/${retries})`);
        this.logger(`➡️  Download to temp dir: ${destination}`);
        
        const file = fs.createWriteStream(destination);
        const protocol = url.startsWith('https') ? https : http;
        
        const options = {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': '*/*'
          }
        };

        const request = protocol.get(url, options, (response) => {
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const redirectUrl = new URL(response.headers.location, url).href;
            file.destroy();
            if (fs.existsSync(destination)) {
              fs.unlinkSync(destination);
            }
            this.downloadFile(redirectUrl, destination, retries)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (response.statusCode === 403) {
            file.destroy();
            if (fs.existsSync(destination)) {
              fs.unlinkSync(destination);
            }
            if (attempt < retries) {
              this.logger(`⚠️  Got 403, retrying... (${attempt}/${retries})`);
              setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
            } else {
              reject(new Error('Download failed: 403 Forbidden'));
            }
            return;
          }

          if (response.statusCode !== 200) {
            file.destroy();
            if (fs.existsSync(destination)) {
              fs.unlinkSync(destination);
            }
            reject(new Error(`Download failed with status: ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloaded = 0;

          response.on('data', (chunk) => {
            downloaded += chunk.length;
            if (totalSize && !this.silent) {
              const percent = ((downloaded / totalSize) * 100).toFixed(1);
              process.stdout.write(`\r📥 Download progress: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)}MB/${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            if (!this.silent) this.logger('\n✅ Download completed!');
            resolve();
          });

          file.on('error', (err) => {
            if (fs.existsSync(destination)) {
              fs.unlinkSync(destination);
            }
            reject(err);
          });
        });

        request.on('error', (err) => {
          if (fs.existsSync(destination)) {
            fs.unlinkSync(destination);
          }
          if (attempt < retries) {
            this.logger(`⚠️  Network error, retrying... (${attempt}/${retries})`);
            setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
          } else {
            reject(err);
          }
        });

        request.setTimeout(30000, () => {
          request.destroy();
          if (attempt < retries) {
            this.logger(`⚠️  Timeout, retrying... (${attempt}/${retries})`);
            setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
          } else {
            reject(new Error('Download timeout'));
          }
        });
      };

      attemptDownload();
    });
  }

    // 等待文件可用的方法
  async waitForFileAvailable(filePath, maxWaitTime = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkFile = () => {
        try {
          // 尝试以读写模式打开文件
          const fd = fs.openSync(filePath, 'r+');
          fs.closeSync(fd);
          resolve();
        } catch (error) {
          if (Date.now() - startTime > maxWaitTime) {
            reject(new Error(`File still busy after ${maxWaitTime}ms: ${filePath}`));
          } else {
            // 等待 100ms 后重试
            setTimeout(checkFile, 100);
          }
        }
      };
      
      checkFile();
    });
  }

  // 执行安装命令 - 修复版本
  async executeInstall(installerPath) {
    return new Promise(async (resolve, reject) => {

      this.logger('⏳ Waiting for file to be ready...');
      await this.waitForFileAvailable(installerPath, 10000);

      this.logger(`🔧 Installing Miniconda to: ${this.installDir}`);

      if (this.platform === 'win32') {
        // Windows 安装 - 修复参数传递
        const installDir = this.installDir.replace(/"/g, ''); // 移除引号用于目录检查
        
        // 确保安装目录存在
        if (!fs.existsSync(installDir)) {
          fs.mkdirSync(installDir, { recursive: true });
        }

        const args = [
          '/InstallationType=JustMe',
          '/AddToPath=0',
          '/RegisterPython=0',
          '/NoRegistry=1',
          '/S',
          `/D=${installDir}`  // 使用不带引号的路径
        ];

        this.logger(`Running: ${installerPath} ${args.join(' ')}`);

        const installProcess = spawn(installerPath, args, {
          stdio: this.silent ? 'ignore' : 'inherit',
          windowsVerbatimArguments: true  // 重要：防止 Windows 参数解析问题
        });

        installProcess.on('close', (code) => {
          if (code === 0) {
            this.logger('✅ Windows installation completed!');
            resolve();
          } else {
            reject(new Error(`Installation failed with exit code: ${code}`));
          }
        });

        installProcess.on('error', reject);

      } else {
        // macOS/Linux 安装
        fs.chmodSync(installerPath, 0o755);
        
        const installDir = this.installDir.replace(/"/g, '');
        
        // 确保安装目录存在
        if (!fs.existsSync(installDir)) {
          fs.mkdirSync(installDir, { recursive: true });
        }

        const installProcess = spawn('bash', [installerPath, '-b', '-u', '-p', installDir], {
          stdio: this.silent ? 'ignore' : 'inherit'
        });

        installProcess.on('close', (code) => {
          if (code === 0) {
            this.logger('✅ Installation completed!');
            resolve();
          } else {
            reject(new Error(`Installation failed with exit code: ${code}`));
          }
        });

        installProcess.on('error', reject);
      }
    });
  }

  // 修复的初始化方法
  async initializeShellConfig() {
    if (!this.initializeShell) {
      this.logger('ℹ️  Shell initialization skipped by user request');
      return;
    }

    try {
      // 获取实际的安装目录（不带引号）
      const actualInstallDir = this.installDir.replace(/"/g, '');
      const condaPath = path.join(actualInstallDir, this.platform === 'win32' ? 'Scripts' : 'bin', this.platform === 'win32' ? 'conda.exe' : 'conda');
      
      this.logger(`Looking for conda at: ${condaPath}`);

      if (!fs.existsSync(condaPath)) {
        throw new Error(`Conda executable not found at: ${condaPath}`);
      }

      if (this.platform === 'win32') {
        this.logger('Initializing for Windows...');
        // Windows 初始化
        await execSyncAsync(`"${condaPath}" init cmd.exe`, { stdio: 'inherit' });
        await execSyncAsync(`"${condaPath}" init powershell`, { stdio: 'inherit' });
      } else {
        const shell = process.env.SHELL || '';
        const initCmd = shell.includes('zsh') ? 'zsh' : 'bash';
        this.logger(`Initializing for ${initCmd}...`);
        await execSyncAsync(`"${condaPath}" init ${initCmd}`, { stdio: 'inherit' });
      }

      this.logger('✅ Shell initialization completed!');
    } catch (error) {
      console.warn('⚠️  Shell initialization failed:', error.message);
      this.logger('You may need to manually run: conda init');
    }
  }

  async isCondaInstalledAsync() {
    const actualInstallDir = this.installDir.replace(/"/g, '');
    const condaExecutable = this.platform === 'win32' 
      ? path.join(actualInstallDir, 'Scripts', 'conda.exe')
      : path.join(actualInstallDir, 'bin', 'conda');

    if(fs.existsSync(condaExecutable)) {
      this.logger(`conda already installed at: ${condaExecutable}`);
      const version = await execSyncAsync(`"${condaExecutable}" --version`, { encoding: 'utf8' });
      
      this.logger(`✅ Miniconda installed version: ${version}`);

      return true
    } else {
      return false;
    }
    
  }

  // 修复的验证方法
  async verifyInstallation() {
    try {
      // 获取实际的安装目录（不带引号）
      const actualInstallDir = this.installDir.replace(/"/g, '');
      const condaExecutable = this.platform === 'win32' 
        ? path.join(actualInstallDir, 'Scripts', 'conda.exe')
        : path.join(actualInstallDir, 'bin', 'conda');

      this.logger(`Checking conda at: ${condaExecutable}`);

      if (!fs.existsSync(condaExecutable)) {
        // 列出目录内容以便调试
        const dir = path.dirname(condaExecutable);
        if (fs.existsSync(dir)) {
          this.logger(`Directory contents of ${dir}:`);
          try {
            const files = fs.readdirSync(dir);
            files.forEach(file => this.logger(`  - ${file}`));
          } catch (e) {
            this.logger(`Cannot read directory: ${e.message}`);
          }
        }
        throw new Error(`Conda executable not found at: ${condaExecutable}`);
      }

      // 测试 conda 命令
      const version = await execSyncAsync(`"${condaExecutable}" --version`, { encoding: 'utf8' }).trim();
      
      this.logger(`✅ Miniconda installed successfully: ${version}`);
      this.logger(`📍 Installation directory: ${actualInstallDir}`);
      
      return true;
    } catch (error) {
      console.error('❌ Installation verification failed:', error.message);
      return false;
    }
  }

  // 主安装方法
  async install() {
    this.logger(`🚀 Starting Miniconda installation for ${this.platform}-${this.arch}...`);
    this.logger(`📁 Target directory: ${this.installDir}`);

    const tempDir = os.tmpdir();
    const downloadUrl = this.getDownloadUrl();
    const installerFilename = downloadUrl.split('/').pop();
    const installerPath = path.join(tempDir, installerFilename);

    try {
      //检查是否安装
      if(await this.isCondaInstalledAsync()) {
        return;
      }

      // 下载
      await this.downloadFile(downloadUrl, installerPath);
      
      // 安装
      await this.executeInstall(installerPath);
      
      // 验证
      const verified = await this.verifyInstallation();
      
      if (verified) {
        // 初始化
        await this.initializeShellConfig();
        
        this.logger('\n🎉 Miniconda installation completed successfully!');
        this.logger('\n📋 Next steps:');
        this.logger('1. Restart your terminal or run:');
        
        const actualInstallDir = this.installDir.replace(/"/g, '');
        if (this.platform === 'win32') {
          this.logger(`cmd.exe /K ""${path.join(actualInstallDir, 'Scripts', 'conda.exe')}" init cmd.exe"`);
        } else {
          this.logger(`source ~/.bashrc  # or ~/.zshrc`);
        }
        
        this.logger('2. Create environment: conda create -n myenv python=3.9');
      } else {
        throw new Error('Installation verification failed');
      }
      
      // 清理
      if (fs.existsSync(installerPath)) {
        fs.unlinkSync(installerPath);
      }
      
    } catch (error) {
      console.error('❌ Installation failed:', error.message);
      
      if (fs.existsSync(installerPath)) {
        fs.unlinkSync(installerPath);
      }
      
      process.exit(1);
    }
  }
}

// CLI 参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    installDir: null,
    silent: false,
    initializeShell: true
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dir':
        options.installDir = args[++i];
        break;
      case '--silent':
        options.silent = true;
        break;
      case '--no-init':
        options.initializeShell = false;
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
Miniconda Installer - Cross-platform silent installation

Usage:
  node miniconda_env.js [options]

Options:
  --dir <path>      Installation directory (default: ~/miniconda3)
  --silent          Silent mode
  --no-init         Skip shell initialization
  --help            Show this help message

Example:
  node src\\\\backend\\\\miniconda_env.js --silent --dir D:/Workspace/continueAI/aifrontier-starter/install-local
  `);
}

// 主执行函数
async function main() {
  const options = parseArgs();
  const installer = new MinicondaInstaller(options);
  
  await installer.install();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = MinicondaInstaller;