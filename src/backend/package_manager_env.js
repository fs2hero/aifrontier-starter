#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const https = require('https');
const http = require('http');

class PackageManagerInstaller {
  constructor(options = {}) {
    this.platform = os.platform();
    this.arch = os.arch();
    this.silent = options.silent !== false;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    this.logger = options.logger ? options.logger : (msg) => console.log(msg);
  }

  // 检查是否已安装 Chocolatey (Windows)
  isChocolateyInstalled() {
    try {
      execSync('choco --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  // 检查是否已安装 Homebrew (macOS/Linux)
  isHomebrewInstalled() {
    try {
      execSync('which brew', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  // 获取已安装的版本
  getInstalledVersion(packageManager) {
    try {
      if (packageManager === 'chocolatey') {
        const version = execSync('choco --version', { encoding: 'utf8' }).trim();
        return `Chocolatey v${version}`;
      } else if (packageManager === 'homebrew') {
        const version = execSync('brew --version', { encoding: 'utf8' }).split('\n')[0];
        return version;
      }
    } catch {
      return null;
    }
  }

  // 安装 Chocolatey (Windows)
  async installChocolatey() {
    this.logger('🍫 Installing Chocolatey for Windows...');

    try {
      // 检查 PowerShell 版本
      try {
        const psVersion = execSync('powershell -Command "$PSVersionTable.PSVersion.Major"', { encoding: 'utf8' }).trim();
        this.logger(`🔧 PowerShell version: ${psVersion}`);
        
        if (parseInt(psVersion) < 3) {
          throw new Error('Chocolatey requires PowerShell 3.0 or later');
        }
      } catch (error) {
        this.logger(`⚠️  Could not determine PowerShell version:, ${error.message}`);
      }

      // 检查是否以管理员权限运行
      try {
        execSync('net session', { stdio: 'ignore' });
        this.logger('✅ Running with administrator privileges');
      } catch {
        this.logger('⚠️  Not running as administrator. Chocolatey installation may require elevated permissions.');
        this.logger('💡 Right-click Command Prompt and select "Run as administrator"');
      }

      // Chocolatey 安装脚本
      const installScript = `
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
      `.replace(/\n/g, ' ').trim();

      this.logger('📥 Downloading and installing Chocolatey...');
      
      const args = [
        '-Command',
        `Start-Process PowerShell -ArgumentList '-Command', '${installScript}' -Verb RunAs -Wait`
      ];

      // 使用 spawn 执行安装
      return new Promise((resolve, reject) => {
        const installProcess = spawn('powershell', args, {
          stdio: this.silent ? 'ignore' : 'inherit'
        });

        installProcess.on('close', (code) => {
          if (code === 0) {
            // 等待安装完成并刷新环境变量
            setTimeout(() => {
              try {
                // 验证安装
                execSync('choco --version', { stdio: 'ignore' });
                this.logger('✅ Chocolatey installed successfully!');
                resolve(true);
              } catch {
                this.logger('🔄 Chocolatey installed but may require restarting the terminal');
                resolve(true);
              }
            }, 3000);
          } else {
            reject(new Error(`Chocolatey installation failed with exit code: ${code}`));
          }
        });

        installProcess.on('error', reject);
      });

    } catch (error) {
      throw new Error(`Chocolatey installation failed: ${error.message}`);
    }
  }

  // 安装 Homebrew (macOS/Linux)
  async installHomebrew() {
    this.logger('🍺 Installing Homebrew...');

    try {
      // 检查系统依赖
      await this.checkHomebrewDependencies();

      // Homebrew 安装脚本
    //   const installScript = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
      const installScript = 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
      
      this.logger('📥 Downloading and installing Homebrew...');
      
      // 执行安装脚本
      execSync(installScript, {
        stdio: 'inherit' 
      });

      // 配置环境变量
      await this.configureHomebrewPath();

      this.logger('✅ Homebrew installed successfully!');
      return true;

    } catch (error) {
      throw new Error(`Homebrew installation failed: ${error.message}`);
    }
  }

  // 检查 Homebrew 依赖
  async checkHomebrewDependencies() {
    try {
      if (this.platform === 'darwin') {
        // macOS 检查 Xcode Command Line Tools
        try {
          execSync('xcode-select -p', { stdio: 'ignore' });
        } catch {
          this.logger('🔧 Installing Xcode Command Line Tools...');
          execSync('xcode-select --install', { stdio: 'inherit' });
          
          // 等待用户完成安装
          this.logger('⏳ Please complete the Xcode Command Line Tools installation and press Enter to continue...');
          process.stdin.resume();
          await new Promise(resolve => process.stdin.once('data', resolve));
        }
      } else if (this.platform === 'linux') {
        // Linux 检查基本依赖
        const dependencies = ['curl', 'git', 'build-essential'];
        
        if (fs.existsSync('/etc/debian_version')) {
          // Debian/Ubuntu
          this.logger('🐧 Checking dependencies on Debian/Ubuntu...');
          execSync('sudo apt update', { stdio: 'ignore' });
          
          for (const pkg of dependencies) {
            try {
              execSync(`dpkg -l | grep -q ${pkg}`, { stdio: 'ignore' });
            } catch {
              this.logger(`📦 Installing ${pkg}...`);
              execSync(`sudo apt install -y ${pkg}`, { 
                stdio: this.silent ? 'ignore' : 'inherit' 
              });
            }
          }
        } else if (fs.existsSync('/etc/redhat-release')) {
          // RedHat/CentOS
          this.logger('🎩 Checking dependencies on RedHat/CentOS...');
          const rhDependencies = ['curl', 'git', 'gcc', 'gcc-c++', 'make'];
          
          for (const pkg of rhDependencies) {
            try {
              execSync(`rpm -q ${pkg}`, { stdio: 'ignore' });
            } catch {
              this.logger(`📦 Installing ${pkg}...`);
              execSync(`sudo yum install -y ${pkg}`, { 
                stdio: this.silent ? 'ignore' : 'inherit' 
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger(`⚠️  Dependency check failed:, ${error.message}`);
    }
  }

  // 配置 Homebrew PATH
  async configureHomebrewPath() {
    try {
      const shell = process.env.SHELL || '';
      const isZsh = shell.includes('zsh');
      const profileFile = isZsh ? '.zprofile' : '.bash_profile';
      const profilePath = path.join(os.homedir(), profileFile);
      
      // 获取 Homebrew 的安装路径
      let brewPrefix;
      try {
        brewPrefix = execSync('brew --prefix', { encoding: 'utf8' }).trim();
      } catch {
        // 如果 brew 命令还不可用，使用默认路径
        if (this.platform === 'darwin') {
          brewPrefix = '/usr/local';
        } else {
          brewPrefix = '/home/linuxbrew/.linuxbrew';
        }
      }
      
      const pathConfig = `\n# Homebrew\neval "$(${brewPrefix}/bin/brew shellenv)"\n`;
      
      // 检查是否已配置
      let needsConfig = true;
      if (fs.existsSync(profilePath)) {
        const content = fs.readFileSync(profilePath, 'utf8');
        if (content.includes('brew shellenv')) {
          needsConfig = false;
        }
      }
      
      if (needsConfig) {
        fs.appendFileSync(profilePath, pathConfig);
        this.logger(`✅ Added Homebrew to ${profileFile}`);
        
        // 立即生效（当前会话）
        const brewEnv = execSync(`"${brewPrefix}/bin/brew" shellenv`, { encoding: 'utf8' });
        const envLines = brewEnv.split('\n');
        
        for (const line of envLines) {
          if (line.startsWith('export ')) {
            const [_, assignment] = line.split('export ');
            const [key, value] = assignment.split('=');
            if (key && value) {
              process.env[key] = value.replace(/"/g, '');
            }
          }
        }
      }
      
    } catch (error) {
      this.logger(`⚠️  Failed to configure Homebrew PATH:, ${error.message}`);
      this.logger('💡 You may need to manually add Homebrew to your shell profile');
    }
  }

  // 验证安装
  async verifyInstallation(packageManager) {
    try {
      if (packageManager === 'chocolatey') {
        if (this.isChocolateyInstalled()) {
          const version = this.getInstalledVersion('chocolatey');
          this.logger(`✅ ${version} installed successfully!`);
          return true;
        }
      } else if (packageManager === 'homebrew') {
        if (this.isHomebrewInstalled()) {
          const version = this.getInstalledVersion('homebrew');
          this.logger(`✅ ${version} installed successfully!`);
          return true;
        }
      }
      throw new Error('Package manager not found after installation');
    } catch (error) {
      console.error('❌ Installation verification failed:', error.message);
      return false;
    }
  }

  // 显示安装后信息
  showPostInstallInfo(packageManager) {
    this.logger('\n🎉 Package manager installation completed!');
    this.logger('\n📋 Next steps:');
    
    if (packageManager === 'chocolatey') {
      this.logger('1. Restart your Command Prompt or PowerShell');
      this.logger('2. Test: choco --version');
      this.logger('3. Install packages: choco install git nodejs -y');
      this.logger('4. Explore packages: choco search <package-name>');
    } else if (packageManager === 'homebrew') {
      this.logger('1. Restart your terminal or run:');
      this.logger('   source ~/.bash_profile  # or ~/.zprofile');
      this.logger('2. Test: brew --version');
      this.logger('3. Install packages: brew install git node');
      this.logger('4. Explore packages: brew search <package-name>');
    }
    
    this.logger('\n📚 Useful resources:');
    if (packageManager === 'chocolatey') {
      this.logger('   - https://chocolatey.org/docs');
      this.logger('   - https://community.chocolatey.org/packages');
    } else {
      this.logger('   - https://docs.brew.sh');
      this.logger('   - https://formulae.brew.sh');
    }
  }

  // 主安装方法
  async install() {
    this.logger(`🚀 Starting package manager installation for ${this.platform}-${this.arch}...`);

    let packageManager;
    let isInstalled = false;
    let installedVersion = null;

    // 确定要安装的包管理器并检查是否已安装
    if (this.platform === 'win32') {
      packageManager = 'chocolatey';
      isInstalled = this.isChocolateyInstalled();
      installedVersion = this.getInstalledVersion('chocolatey');
    } else {
      packageManager = 'homebrew';
      isInstalled = this.isHomebrewInstalled();
      installedVersion = this.getInstalledVersion('homebrew');
    }

    // 如果已安装，显示信息并退出
    if (isInstalled) {
      this.logger(`ℹ️  ${installedVersion} is already installed`);
      this.showPostInstallInfo(packageManager);
      return;
    }

    try {
      let success = false;

      // 执行安装
      if (packageManager === 'chocolatey') {
        success = await this.installChocolatey();
      } else {
        success = await this.installHomebrew();
      }

      // 验证安装
      if (success) {
        const verified = await this.verifyInstallation(packageManager);
        
        if (verified) {
          this.showPostInstallInfo(packageManager);
        } else {
          throw new Error('Installation verification failed');
        }
      } else {
        throw new Error('Installation process failed');
      }

    } catch (error) {
      console.error('❌ Installation failed:', error.message);
      
      // 提供备用方案
      this.logger('\n💡 Alternative installation methods:');
      if (packageManager === 'chocolatey') {
        this.logger('1. Visit: https://chocolatey.org/install');
        this.logger('2. Follow the manual installation instructions');
      } else {
        this.logger('1. Visit: https://brew.sh');
        this.logger('2. Copy and paste the installation command');
      }
      
      process.exit(1);
    }
  }
}

// CLI 参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    silent: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--silent':
        options.silent = true;
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
Package Manager Installer - Cross-platform package manager installation

Usage:
  node package_manager_installer.js [options]

Options:
  --silent    Silent mode (minimal output)
  --help      Show this help message

Description:
  Automatically installs the appropriate package manager for your system:
  - Windows: Chocolatey
  - macOS: Homebrew
  - Linux: Homebrew

Examples:
  # Default installation
  node package_manager_installer.js

  # Silent installation
  node package_manager_installer.js --silent
  `);
}

// 主执行函数
async function main() {
  const options = parseArgs();
  const installer = new PackageManagerInstaller(options);
  
  await installer.install();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = PackageManagerInstaller;