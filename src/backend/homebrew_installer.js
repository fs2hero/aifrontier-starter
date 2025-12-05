// install_brew.js
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class HomebrewInstaller {
  constructor(options = {}) {
    // 1. 确定安装目录 - 使用用户主目录下的 .homebrew
    this.brewPrefix = options.installPath || path.join(os.homedir(), '.homebrew');
    this.user = os.userInfo().username;
    this.shellConfig = this._detectShellConfig();

    this.logger = options.logger ? options.logger : (msg) => console.log(msg);

    this.logger(`📁 安装目录: ${this.brewPrefix}`);
    this.logger(`👤 当前用户: ${this.user}`);
  }

  // 检测用户的Shell配置文件
  _detectShellConfig() {
    const shell = process.env.SHELL || '';
    if (shell.includes('zsh')) {
      return path.join(os.homedir(), '.zshrc');
    } else {
      return path.join(os.homedir(), '.bash_profile');
    }
  }

  // 检查是否已安装
  isAlreadyInstalled() {
    try {
      const brewPath = path.join(this.brewPrefix, 'bin', 'brew');
      if (fs.existsSync(brewPath)) {
        this.logger('✅ Homebrew 已安装在自定义目录');
        return true;
      }
    } catch (error) {
      // 忽略错误，继续安装
    }
    return false;
  }

  // 检查必要的依赖
  checkDependencies() {
    this.logger('🔍 检查系统依赖...');
    try {
      execSync('git --version', { stdio: 'pipe' });
      this.logger('✅ Git 已安装');
      return true;
    } catch (error) {
      console.error('❌ Git 未安装或不在PATH中');
      this.logger('请先安装 Git: https://git-scm.com/');
      return false;
    }
  }

  // 创建安装目录
  createDirectory() {
    this.logger(`📂 创建目录: ${this.brewPrefix}`);
    try {
      if (!fs.existsSync(this.brewPrefix)) {
        fs.mkdirSync(this.brewPrefix, { recursive: true });
        this.logger('✅ 目录创建成功');
      } else {
        this.logger('📁 目录已存在');
      }
      return true;
    } catch (error) {
      console.error(`❌ 创建目录失败: ${error.message}`);
      return false;
    }
  }

  // 克隆主仓库
  cloneBrewRepo() {
    this.logger('📦 克隆 Homebrew 主仓库...');
    const brewRepo = 'https://github.com/Homebrew/brew.git';
    
    try {
      if (fs.existsSync(path.join(this.brewPrefix, '.git'))) {
        this.logger('🔄 仓库已存在，跳过克隆');
        return true;
      }

      this.logger(`正在克隆: ${brewRepo}`);
      execSync(`git clone --depth=1 ${brewRepo} "${this.brewPrefix}"`, {
        stdio: 'inherit',
        cwd: path.dirname(this.brewPrefix)
      });
      this.logger('✅ Homebrew 主仓库克隆完成');
      return true;
    } catch (error) {
      console.error(`❌ 克隆主仓库失败: ${error.message}`);
      if (error.message.includes('git')) {
        this.logger('💡 请确保 Git 已正确安装并配置');
      }
      return false;
    }
  }

  // 克隆核心库 (homebrew-core)
  cloneCoreRepo() {
    this.logger('📦 克隆 Homebrew 核心库...');
    const coreDir = path.join(this.brewPrefix, 'Library', 'Taps', 'homebrew', 'homebrew-core');
    const coreRepo = 'https://github.com/Homebrew/homebrew-core.git';
    
    try {
      if (fs.existsSync(path.join(coreDir, '.git'))) {
        this.logger('🔄 核心库已存在，跳过克隆');
        return true;
      }

      // 创建目录结构
      fs.mkdirSync(path.dirname(coreDir), { recursive: true });
      
      this.logger(`正在克隆: ${coreRepo}`);
      execSync(`git clone --depth=1 ${coreRepo} "${coreDir}"`, {
        stdio: 'inherit'
      });
      this.logger('✅ Homebrew 核心库克隆完成');
      return true;
    } catch (error) {
      console.error(`❌ 克隆核心库失败: ${error.message}`);
      return false;
    }
  }

  // 配置环境变量 (Node.js进程内)
  setupEnvironment() {
    this.logger('⚙️  配置环境变量...');
    
    // 获取brew shellenv的输出
    const brewBin = path.join(this.brewPrefix, 'bin', 'brew');
    try {
      const shellenv = execSync(`"${brewBin}" shellenv`, { encoding: 'utf8' });
      
      // 解析并应用环境变量
      const lines = shellenv.split('\n');
      lines.forEach(line => {
        if (line.startsWith('export ')) {
          const match = line.match(/export (\w+)="([^"]+)"/);
          if (match) {
            const [, key, value] = match;
            process.env[key] = value;
            this.logger(`  设置 ${key}=${value}`);
          }
        }
      });
      
      // 确保PATH在最前面
      const brewPath = path.join(this.brewPrefix, 'bin');
      process.env.PATH = `${brewPath}:${process.env.PATH}`;
      
      this.logger('✅ 环境变量已配置（当前进程）');
      return true;
    } catch (error) {
      console.error(`❌ 配置环境变量失败: ${error.message}`);
      return false;
    }
  }

  // 添加到用户的shell配置文件
  addToShellConfig() {
    this.logger(`📝 更新Shell配置文件: ${this.shellConfig}`);
    
    const brewBin = path.join(this.brewPrefix, 'bin', 'brew');
    const configLine = `\n# Homebrew (手动安装到 ${this.brewPrefix})\neval "$(${brewBin} shellenv)"\n`;
    
    try {
      // 检查是否已配置
      let content = '';
      if (fs.existsSync(this.shellConfig)) {
        content = fs.readFileSync(this.shellConfig, 'utf8');
        if (content.includes(brewBin)) {
          this.logger('✅ Homebrew 已在配置文件中');
          return true;
        }
      }
      
      // 追加配置
      fs.appendFileSync(this.shellConfig, configLine);
      this.logger('✅ 已添加到Shell配置文件');
      this.logger(`   重启终端或运行: source ${this.shellConfig}`);
      return true;
    } catch (error) {
      console.error(`❌ 更新配置文件失败: ${error.message}`);
      this.logger(`💡 请手动将以下行添加到 ${this.shellConfig}:`);
      this.logger(`   eval "$(${brewBin} shellenv)"`);
      return false;
    }
  }

  // 验证安装
  verifyInstallation() {
    this.logger('🔬 验证安装...');
    
    try {
      // 检查brew命令
      const brewBin = path.join(this.brewPrefix, 'bin', 'brew');
      if (!fs.existsSync(brewBin)) {
        throw new Error('brew 可执行文件不存在');
      }
      
      // 运行brew --version
      const version = execSync(`"${brewBin}" --version`, { encoding: 'utf8' }).trim();
      this.logger(`✅ ${version}`);
      
      // 运行brew doctor进行基本检查
      this.logger('🏥 运行 brew doctor 检查...');
      const doctorResult = spawnSync(brewBin, ['doctor'], { encoding: 'utf8' });
      
      if (doctorResult.status === 0) {
        this.logger('✅ Homebrew 安装健康');
      } else {
        this.logger('⚠️  brew doctor 报告了一些问题:');
        this.logger(doctorResult.stdout);
        if (doctorResult.stderr) {
          console.error(doctorResult.stderr);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`❌ 验证失败: ${error.message}`);
      return false;
    }
  }

  // 主安装流程
  async install() {
    this.logger('🚀 开始 Homebrew 手动安装流程');
    this.logger('=' .repeat(50));
    
    // 检查是否已安装
    if (this.isAlreadyInstalled()) {
      this.logger('💡 如果这是新安装，请删除目录重新运行');
      return true;
    }
    
    // 步骤检查
    const steps = [
      { name: '检查依赖', method: () => this.checkDependencies() },
      { name: '创建目录', method: () => this.createDirectory() },
      { name: '克隆主仓库', method: () => this.cloneBrewRepo() },
      { name: '克隆核心库', method: () => this.cloneCoreRepo() },
      { name: '配置环境', method: () => this.setupEnvironment() },
      { name: '验证安装', method: () => this.verifyInstallation() },
      { name: '更新配置', method: () => this.addToShellConfig() },
    ];
    
    for (const [index, step] of steps.entries()) {
      this.logger(`\n📋 步骤 ${index + 1}/${steps.length}: ${step.name}`);
      this.logger('-'.repeat(40));
      
      if (!step.method()) {
        console.error(`❌ 安装失败于: ${step.name}`);
        return false;
      }
    }
    
    this.logger('\n' + '='.repeat(50));
    this.logger('🎉 Homebrew 安装完成!');
    this.logger(`\n使用说明:`);
    this.logger(`1. 立即使用: 在当前Node.js进程中已配置好环境`);
    this.logger(`2. 终端使用: 新开终端或运行: source ${this.shellConfig}`);
    this.logger(`3. 安装软件: brew install <package-name>`);
    this.logger(`\n安装目录: ${this.brewPrefix}`);
    this.logger(`核心库: ${path.join(this.brewPrefix, 'Library/Taps/homebrew/homebrew-core')}`);
    
    return true;
  }
}

// 使用示例
async function main() {
  const installer = new HomebrewInstaller();
  
  try {
    const success = await installer.install();
    if (success) {
      // 安装成功后，可以在这里使用brew命令
      this.logger('\n🔧 尝试获取可用命令列表...');
      try {
        const brewBin = path.join(installer.brewPrefix, 'bin', 'brew');
        const help = execSync(`"${brewBin}" help`, { encoding: 'utf8' });
        this.logger(help.split('\n').slice(0, 10).join('\n'));
        this.logger('...');
      } catch (e) {
        // 忽略，可能环境还没完全生效
      }
      
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 安装过程发生未预期错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 作为模块导出
module.exports = HomebrewInstaller;