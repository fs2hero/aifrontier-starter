#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const https = require('https');
const http = require('http');

class CurlInstaller {
  constructor(options = {}) {
    this.platform = os.platform();
    this.arch = os.arch();
    this.silent = options.silent !== false;
    this.useSystemPackageManager = options.useSystemPackageManager !== false;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  }

  // 检查系统是否已安装 curl
  isCurlInstalled() {
    try {
      if (this.platform === 'win32') {
        // Windows 下检查多个可能的位置
        const possiblePaths = [
          'curl.exe',
          path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'curl.exe'),
          path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'curl', 'bin', 'curl.exe')
        ];
        
        return possiblePaths.some(cmd => {
          try {
            execSync(`where ${cmd}`, { stdio: 'ignore' });
            return true;
          } catch {
            return false;
          }
        });
      } else {
        // Unix-like 系统
        execSync('which curl', { stdio: 'ignore' });
        return true;
      }
    } catch {
      return false;
    }
  }

  // 获取 curl 版本
  getCurlVersion() {
    try {
      const version = execSync('curl --version', { encoding: 'utf8' }).split('\n')[0];
      return version;
    } catch {
      return null;
    }
  }

  // 使用系统包管理器安装
  async installWithPackageManager() {
    console.log('📦 Installing curl using system package manager...');

    try {
      switch (this.platform) {
        case 'linux':
          // 检测 Linux 发行版
          if (fs.existsSync('/etc/debian_version')) {
            // Debian/Ubuntu
            console.log('🐧 Debian/Ubuntu detected, using apt...');
            execSync('sudo apt update && sudo apt install -y curl', { 
              stdio: this.silent ? 'ignore' : 'inherit' 
            });
          } else if (fs.existsSync('/etc/redhat-release') || fs.existsSync('/etc/centos-release')) {
            // RedHat/CentOS
            console.log('🎩 RedHat/CentOS detected, using yum...');
            execSync('sudo yum install -y curl', { 
              stdio: this.silent ? 'ignore' : 'inherit' 
            });
          } else if (fs.existsSync('/etc/alpine-release')) {
            // Alpine Linux
            console.log('🏔️ Alpine Linux detected, using apk...');
            execSync('sudo apk add curl', { 
              stdio: this.silent ? 'ignore' : 'inherit' 
            });
          } else {
            throw new Error('Unsupported Linux distribution');
          }
          break;

        case 'darwin':
          // macOS
          console.log('🍎 macOS detected, using Homebrew...');
          try {
            // 检查是否已安装 Homebrew
            execSync('which brew', { stdio: 'ignore' });
          } catch {
            console.log('🔧 Installing Homebrew first...');
            const brewInstallScript = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
            execSync(brewInstallScript, { stdio: this.silent ? 'ignore' : 'inherit' });
          }
          execSync('brew install curl', { 
            stdio: this.silent ? 'ignore' : 'inherit' 
          });
          break;

        case 'win32':
          // Windows - 使用 Chocolatey 或 Winget
          await this.installOnWindows();
          break;

        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }

      console.log('✅ Package manager installation completed!');
      return true;
    } catch (error) {
      console.warn(`⚠️ Package manager installation failed: ${error.message}`);
      return false;
    }
  }

  // Windows 安装
  async installOnWindows() {
    console.log('🪟 Installing curl on Windows...');

    try {
      // 尝试使用 Winget (Windows 11/10 1809+)
      try {
        console.log(' Trying winget...');
        execSync('winget install --id curl.curl -e', { 
          stdio: this.silent ? 'ignore' : 'inherit' 
        });
        return true;
      } catch (wingetError) {
        console.log(' Winget failed, trying Chocolatey...');
      }

      // 尝试使用 Chocolatey
      try {
        // 检查是否已安装 Chocolatey
        execSync('choco --version', { stdio: 'ignore' });
      } catch {
        console.log('🔧 Installing Chocolatey first...');
        const chocoInstallScript = 'powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString(\'https://community.chocolatey.org/install.ps1\'))"';
        execSync(chocoInstallScript, { stdio: this.silent ? 'ignore' : 'inherit' });
      }

      execSync('choco install curl -y', { 
        stdio: this.silent ? 'ignore' : 'inherit' 
      });
      return true;

    } catch (error) {
      console.warn('⚠️ Windows package manager installation failed, falling back to direct download...');
      return await this.downloadWindowsBinary();
    }
  }

  // 下载 Windows 绿色版
  async downloadWindowsBinary() {
    console.log('💾 Downloading Windows curl binary...');

    const tempDir = os.tmpdir();
    const downloadUrl = 'https://curl.se/windows/dl-8.5.0/curl-8.5.0-win64-mingw.zip';
    const zipPath = path.join(tempDir, 'curl-windows.zip');
    const extractDir = path.join(tempDir, 'curl-extract');
    const targetDir = path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'curl');

    try {
      // 下载
      await this.downloadFile(downloadUrl, zipPath);
      
      // 解压
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });

      await this.extractZip(zipPath, extractDir);

      // 复制到目标目录
      const extractedItems = fs.readdirSync(extractDir);
      const curlDir = extractedItems.find(item => 
        item.toLowerCase().includes('curl') && 
        fs.statSync(path.join(extractDir, item)).isDirectory()
      );

      if (curlDir) {
        const sourceDir = path.join(extractDir, curlDir);
        
        // 确保目标目录存在
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        this.copyRecursiveSync(sourceDir, targetDir);

        // 添加到系统 PATH
        await this.addToWindowsPath(path.join(targetDir, 'bin'));
        
        console.log('✅ Windows binary installation completed!');
        return true;
      } else {
        throw new Error('Could not find curl directory in extracted files');
      }

    } catch (error) {
      throw new Error(`Windows binary download failed: ${error.message}`);
    } finally {
      // 清理
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }

  // 下载文件
  async downloadFile(url, destination, retries = 3) {
    return new Promise((resolve, reject) => {
      const attemptDownload = (attempt = 1) => {
        console.log(`📥 Downloading from: ${url} (attempt ${attempt}/${retries})`);
        
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

          if (response.statusCode !== 200) {
            file.destroy();
            if (fs.existsSync(destination)) {
              fs.unlinkSync(destination);
            }
            if (attempt < retries) {
              console.log(`⚠️  Got ${response.statusCode}, retrying... (${attempt}/${retries})`);
              setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
            } else {
              reject(new Error(`Download failed with status: ${response.statusCode}`));
            }
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
            if (!this.silent) console.log('\n✅ Download completed!');
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
            console.log(`⚠️  Network error, retrying... (${attempt}/${retries})`);
            setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
          } else {
            reject(err);
          }
        });

        request.setTimeout(30000, () => {
          request.destroy();
          if (attempt < retries) {
            console.log(`⚠️  Timeout, retrying... (${attempt}/${retries})`);
            setTimeout(() => attemptDownload(attempt + 1), 1000 * attempt);
          } else {
            reject(new Error('Download timeout'));
          }
        });
      };

      attemptDownload();
    });
  }

  // 解压 ZIP 文件
  async extractZip(zipPath, extractDir) {
    console.log('📦 Extracting files...');
    
    try {
      // 使用系统工具解压
      if (this.platform === 'win32') {
        // Windows 使用 PowerShell
        const psScript = `
          Add-Type -AssemblyName System.IO.Compression.FileSystem
          [System.IO.Compression.ZipFile]::ExtractToDirectory("${zipPath}", "${extractDir}")
        `;
        execSync(`powershell -Command "${psScript}"`, { stdio: 'inherit' });
      } else {
        // Unix-like 使用 unzip
        execSync(`unzip -q "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });
      }
    } catch (error) {
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  // 递归复制目录
  copyRecursiveSync(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        this.copyRecursiveSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // 添加到 Windows PATH
  async addToWindowsPath(binDir) {
    try {
      console.log(`🔧 Adding to Windows PATH: ${binDir}`);
      
      // 获取当前用户 PATH
      const currentPath = execSync('reg query "HKCU\\Environment" /v PATH', { encoding: 'utf8' });
      let userPath = '';
      
      if (currentPath.includes('PATH')) {
        const match = currentPath.match(/PATH\s+REG_(?:EXPAND_)?SZ\s+(.*)/);
        if (match) {
          userPath = match[1];
        }
      }
      
      // 检查是否已包含该路径
      if (!userPath.includes(binDir)) {
        const newPath = userPath ? `${userPath};${binDir}` : binDir;
        execSync(`setx PATH "${newPath}"`, { stdio: 'inherit' });
        console.log('✅ Added to Windows PATH');
      } else {
        console.log('ℹ️  PATH already contains curl directory');
      }
    } catch (error) {
      console.warn('⚠️  Failed to update Windows PATH:', error.message);
    }
  }

  // 验证安装
  async verifyInstallation() {
    try {
      if (this.isCurlInstalled()) {
        const version = this.getCurlVersion();
        console.log(`✅ curl installed successfully: ${version}`);
        return true;
      } else {
        throw new Error('curl is not available in PATH');
      }
    } catch (error) {
      console.error('❌ Installation verification failed:', error.message);
      return false;
    }
  }

  // 主安装方法
  async install() {
    // 检查是否已安装
    if (this.isCurlInstalled()) {
      const version = this.getCurlVersion();
      console.log(`ℹ️  curl is already installed: ${version}`);
      return;
    }

    console.log(`🚀 Starting curl installation for ${this.platform}-${this.arch}...`);

    let success = false;

    // 首先尝试使用系统包管理器
    if (this.useSystemPackageManager) {
      success = await this.installWithPackageManager();
    }

    // 如果包管理器失败，回退到其他方法
    if (!success) {
      console.log('🔄 Falling back to alternative installation method...');
      
      switch (this.platform) {
        case 'win32':
          success = await this.downloadWindowsBinary();
          break;
        case 'linux':
          console.log('💡 On Linux, you can manually install with:');
          console.log('   Ubuntu/Debian: sudo apt install curl');
          console.log('   RedHat/CentOS: sudo yum install curl');
          console.log('   Alpine: sudo apk add curl');
          break;
        case 'darwin':
          console.log('💡 On macOS, you can manually install with:');
          console.log('   brew install curl');
          break;
      }
    }

    // 验证安装
    if (success) {
      const verified = await this.verifyInstallation();
      
      if (verified) {
        console.log('\n🎉 curl installation completed successfully!');
        console.log('\n📋 Next steps:');
        console.log('1. Restart your terminal');
        console.log('2. Test: curl --version');
      } else {
        throw new Error('Installation verification failed');
      }
    } else {
      throw new Error('All installation methods failed');
    }
  }
}

// CLI 参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    silent: false,
    useSystemPackageManager: true
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--silent':
        options.silent = true;
        break;
      case '--no-package-manager':
        options.useSystemPackageManager = false;
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
curl Installer - Cross-platform installation

Usage:
  node curl_installer.js [options]

Options:
  --silent              Silent mode
  --no-package-manager  Skip system package manager (direct download only)
  --help                Show this help message

Examples:
  # Default installation (uses package manager)
  node curl_installer.js

  # Silent installation
  node curl_installer.js --silent

  # Direct download only (no package manager)
  node curl_installer.js --no-package-manager
  `);
}

// 主执行函数
async function main() {
  const options = parseArgs();
  const installer = new CurlInstaller(options);
  
  await installer.install();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = CurlInstaller;