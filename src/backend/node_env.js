#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSyncAsync } = require('./sys_utils');

class NodeInstaller {
  constructor() {
    this.platform = os.platform();
    this.arch = os.arch();
    this.version = process.env.NODE_VERSION || '18.17.0';
    this.installDir = process.env.NODE_INSTALL_DIR || path.join(process.cwd(), 'node-runtime');
    this.logger = (msg) => console.log(msg);
  }

  // 获取平台特定的下载信息
  getDownloadInfo() {
    const baseUrl = `https://nodejs.org/dist/v${this.version}`;
    
    const platformMap = {
      'win32': {
        filename: `node-v${this.version}-win-${this.arch}`,
        extension: 'zip',
        binaryDir: '',
        executable: 'node.exe'
      },
      'darwin': {
        filename: `node-v${this.version}-darwin-${this.arch}`,
        extension: 'tar.gz',
        binaryDir: 'bin',
        executable: 'node'
      },
      'linux': {
        filename: `node-v${this.version}-linux-${this.arch}`,
        extension: 'tar.xz',
        binaryDir: 'bin',
        executable: 'node'
      }
    };

    const info = platformMap[this.platform];
    if (!info) {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }

    return {
      url: `${baseUrl}/${info.filename}.${info.extension}`,
      filename: `${info.filename}.${info.extension}`,
      extractDir: info.filename,
      binaryDir: info.binaryDir,
      executable: info.executable
    };
  }

  // 下载文件
  async downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      this.logger(`Downloading from: ${url}`);
      
      const file = fs.createWriteStream(destination);
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // 处理重定向
          this.downloadFile(response.headers.location, destination)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status: ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (totalSize) {
            const percent = ((downloaded / totalSize) * 100).toFixed(2);
            process.stdout.write(`\rDownload progress: ${percent}%`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          this.logger('\nDownload completed!');
          resolve();
        });

        file.on('error', (err) => {
          fs.unlinkSync(destination);
          reject(err);
        });
      }).on('error', reject);
    });
  }

  // 解压文件
  async extractFile(filePath, extractTo) {
    this.logger(`Extracting ${filePath}...`);
    
    const platform = this.platform;
    const fileExt = path.extname(filePath);

    try {
      if (platform === 'win32' && fileExt === '.zip') {
        // Windows 使用内置模块解压 zip
        await this.extractZip(filePath, extractTo);
      } else {
        // macOS/Linux 使用系统命令解压
        await this.extractWithSystemCommand(filePath, extractTo);
      }
    } catch (error) {
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  // 解压 zip 文件 (Windows)
  async extractZip(filePath, extractTo) {
    return new Promise((resolve, reject) => {
      const AdmZip = require('adm-zip');
      try {
        const zip = new AdmZip(filePath);
        zip.extractAllTo(extractTo, true);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // 使用系统命令解压
  async extractWithSystemCommand(filePath, extractTo) {
    return new Promise(async (resolve, reject) => {
      let command;
      
      if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')) {
        command = `tar -xzf "${filePath}" -C "${extractTo}"`;
      } else if (filePath.endsWith('.tar.xz')) {
        command = `tar -xf "${filePath}" -C "${extractTo}"`;
      } else if (filePath.endsWith('.zip')) {
        command = `unzip -q "${filePath}" -d "${extractTo}"`;
      } else {
        reject(new Error(`Unsupported file format: ${filePath}`));
        return;
      }

      try {
        await execSyncAsync(command, { stdio: 'inherit' });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // 设置环境变量
  setupEnvironment() {
    const envs = this.getEnvironment();
    
    // 创建启动脚本
    this.createStartScript(envs.binDir, envs.nodeDir);
    
    return envs;
  }

  getEnvironment() {
    const downloadInfo = this.getDownloadInfo();
    const nodeDir = path.join(this.installDir, downloadInfo.extractDir);
    const binDir = path.join(nodeDir, downloadInfo.binaryDir);
    
    return {
      nodePath: path.join(binDir, downloadInfo.executable),
      npmPath: path.join(binDir, this.platform === 'win32' ? 'npm.cmd' : 'npm'),
      binDir,
      nodeDir
    };
  }

  // 创建启动脚本
  createStartScript(binDir, nodeDir) {
    const scriptContent = this.platform === 'win32' 
      ? this.createWindowsScript(binDir)
      : this.createUnixScript(binDir);

    const scriptPath = path.join(this.installDir, this.platform === 'win32' ? 'use-node.bat' : 'use-node.sh');
    fs.writeFileSync(scriptPath, scriptContent, 'utf8');
    
    if (this.platform !== 'win32') {
      fs.chmodSync(scriptPath, '755');
    }

    this.logger(`Start script created: ${scriptPath}`);
  }

  createWindowsScript(binDir) {
    return `@echo off
set PATH=${binDir};%PATH%
cmd /k
`;
  }

  createUnixScript(binDir) {
    return `#!/bin/bash
export PATH="${binDir}:\\$PATH"
exec "$SHELL"
`;
  }

  // 验证安装
  async verifyInstallationAsync(nodePath, npmPath) {
    try {
      const version = await execSyncAsync(`"${nodePath}" --version`, { encoding: 'utf8' });
      const npmVersion = await execSyncAsync(`"${npmPath}" --version`, { encoding: 'utf8' });

      this.logger(`✅ Node.js ${version} installed successfully!`);
      this.logger(`✅ npm ${npmVersion} installed successfully!`);
      return true;
    } catch (error) {
      console.error('❌ Installation verification failed:', error.message);
      return false;
    }
  }

  // 主安装方法
  async install() {
    this.logger(`Installing Node.js ${this.version} for ${this.platform}-${this.arch}`);
    this.logger(`Installation directory: ${this.installDir}`);

    // 创建安装目录
    if (!fs.existsSync(this.installDir)) {
      fs.mkdirSync(this.installDir, { recursive: true });
    }

    const downloadInfo = this.getDownloadInfo();
    const downloadPath = path.join(this.installDir, downloadInfo.filename);

    const nodeDir = path.join(this.installDir, downloadInfo.extractDir);
    const binDir = path.join(nodeDir, downloadInfo.binaryDir);
    const nodePath = path.join(binDir, downloadInfo.executable);

    if(fs.existsSync(nodePath)) {
      this.logger(`ℹ️  node is already installed: ${binDir}`);
      return;
    }

    try {
      // 下载
      await this.downloadFile(downloadInfo.url, downloadPath);
      
      // 解压
      await this.extractFile(downloadPath, this.installDir);
      
      // 设置环境
      const paths = this.setupEnvironment();
      
      // 验证
      const success = await this.verifyInstallationAsync(paths.nodePath,  paths.npmPath);
      
      if (success) {
        this.logger('\n🎉 Installation completed!');
        this.logger(`\nTo use this Node.js installation, run:`);
        if (this.platform === 'win32') {
          this.logger(`  ${path.join(this.installDir, 'use-node.bat')}`);
        } else {
          this.logger(`  source ${path.join(this.installDir, 'use-node.sh')}`);
        }
      }

      // 清理下载文件
      fs.unlinkSync(downloadPath);
      
    } catch (error) {
      console.error('❌ Installation failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI 参数处理
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      options.version = args[++i];
    } else if (args[i] === '--dir' && args[i + 1]) {
      options.dir = args[++i];
    } else if (args[i] === '--help') {
      console.log(`
Usage: node install-node.js [options]

Options:
  --version <version>  Node.js version to install (default: 18.17.0)
  --dir <directory>    Installation directory (default: ./node-runtime)
  --help               Show this help message

Examples:
  node install-node.js
  node install-node.js --version 16.14.0
  node install-node.js --dir /path/to/install
      `);
      process.exit(0);
    }
  }
  
  return options;
}

// 主执行函数
async function main() {
  const options = parseArgs();
  const installer = new NodeInstaller();
  
  if (options.version) {
    installer.version = options.version;
  }
  if (options.dir) {
    installer.installDir = path.resolve(options.dir);
  }
  
  await installer.install();
}

// 运行安装
if (require.main === module) {
  main().catch(console.error);
}

module.exports = NodeInstaller;