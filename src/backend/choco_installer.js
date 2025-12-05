// install_choco.js
const { execSync, spawnSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { URL } = require('url');
const { execSyncAsync } = require('./sys_utils')

class ChocolateyInstaller {
  constructor(options = {}) {
    // 配置选项
    this.options = {
      installPath: options.installPath || path.join(os.homedir(), '.chocolatey'),
      // 是否跳过管理员权限检查（适用于受限环境）
      skipAdminCheck: options.skipAdminCheck || false,
      // PowerShell执行策略
      executionPolicy: options.executionPolicy || 'Bypass',
      // 使用社区镜像加速（可选）
      useMirror: options.useMirror || false,
      ...options
    };
    
    this.isWindows = process.platform === 'win32';
    this.isAdmin = false;
    this.installSuccess = false;
    this.powershellPath = this._getPowershellPath();

    this.logger = options.logger ? options.logger : (msg) => console.log(msg);
    
    this.logger(`🖥️  系统: ${process.platform}`);
    this.logger(`📁 安装目录: ${this.options.installPath}`);
  }

  // 检测PowerShell路径
  _getPowershellPath() {
    const possiblePaths = [
      `${process.env.SYSTEMROOT}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      `${process.env.SYSTEMROOT}\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe`,
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    ];
    
    for (const psPath of possiblePaths) {
      if (fs.existsSync(psPath)) {
        return psPath;
      }
    }
    return 'powershell';
  }

  // 检查是否为管理员
  checkAdminPrivileges() {
    if (!this.isWindows) {
      this.logger('⚠️  非Windows系统，跳过管理员检查');
      return false;
    }
    
    if (this.options.skipAdminCheck) {
      this.logger('⏭️  跳过管理员检查（配置指定）');
      return false;
    }
    
    try {
      // 尝试在受保护目录创建文件来检测管理员权限
      const testFile = 'C:\\Windows\\Temp\\choco_test_' + Date.now() + '.tmp';
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      this.isAdmin = true;
      this.logger('✅ 检测到管理员权限');
      return true;
    } catch (error) {
      this.logger('ℹ️  当前为非管理员权限');
      this.isAdmin = false;
      return false;
    }
  }

  // 检查PowerShell执行策略
  async checkExecutionPolicy() {
    this.logger('🔍 检查PowerShell执行策略...');
    
    try {
      const result = await execSyncAsync(
        `"${this.powershellPath}" -Command "Get-ExecutionPolicy"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();
      
      this.logger(`  当前执行策略: ${result}`);
      
      // 检查是否有限制性策略
      const restrictivePolicies = ['Restricted', 'Undefined'];
      if (restrictivePolicies.includes(result)) {
        this.logger(`⚠️  检测到限制性执行策略: ${result}`);
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger('⚠️  无法获取执行策略，继续安装...');
      return true;
    }
  }

  // 设置PowerShell执行策略
  async setExecutionPolicy() {
    this.logger(`⚙️  设置PowerShell执行策略为: ${this.options.executionPolicy}`);
    
    try {
      const command = `"${this.powershellPath}" -Command "Start-Process PowerShell -Verb RunAs -ArgumentList '-Command Set-ExecutionPolicy ${this.options.executionPolicy} -Scope CurrentUser -Force'"`;
      
      await execSyncAsync(command, { 
        stdio: 'inherit',
        windowsHide: true 
      });
      
      this.logger('✅ 执行策略设置成功');
      return true;
    } catch (error) {
      this.logger(`⚠️  设置执行策略失败: ${error.message}`);
      this.logger('💡 尝试非管理员方式设置...');
      
      try {
        await execSyncAsync(
          `"${this.powershellPath}" -Command "Set-ExecutionPolicy ${this.options.executionPolicy} -Scope CurrentUser -Force"`,
          { stdio: 'pipe' }
        );
        this.logger('✅ 执行策略设置成功（当前用户）');
        return true;
      } catch (error2) {
        console.error(`❌ 无法设置执行策略: ${error2.message}`);
        return false;
      }
    }
  }

  // 检查是否已安装Chocolatey
  async isAlreadyInstalled() {
    this.logger('🔍 检查Chocolatey是否已安装...');
    
    // 方法1: 检查环境变量
    if (process.env.ChocolateyInstall) {
      this.logger(`✅ Chocolatey 已安装 (通过环境变量): ${process.env.ChocolateyInstall}`);
      return true;
    }
    
    // 方法2: 检查标准安装路径
    const defaultPaths = [
      `${process.env.ProgramData}\\chocolatey`,
      `${process.env.LOCALAPPDATA}\\chocolatey`,
      this.options.installPath
    ];
    
    for (const chocoPath of defaultPaths) {
      const chocoExe = path.join(chocoPath, 'bin', 'choco.exe');
      if (fs.existsSync(chocoExe)) {
        this.logger(`✅ Chocolatey 已安装: ${chocoPath}`);
        return true;
      }
    }
    
    // 方法3: 检查命令行
    try {
      await execSyncAsync('where choco', { stdio: 'ignore' });
      this.logger('✅ Chocolatey 已在PATH中');
      return true;
    } catch (error) {
      // Chocolatey未安装
    }
    
    this.logger('ℹ️  Chocolatey 未安装');
    return false;
  }

  // 检查.NET Framework版本
  async checkDotNetFramework() {
    this.logger('🔍 检查.NET Framework...');
    
    try {
      const result = await execSyncAsync(
        `"${this.powershellPath}" -Command "[System.Environment]::Version.ToString()"`,
        { encoding: 'utf8', stdio: 'pipe' }
      ).trim();
      
      this.logger(`  .NET CLR版本: ${result}`);
      
      // 检查是否满足最低要求（4.0）
      const versionParts = result.split('.').map(Number);
      if (versionParts[0] >= 4) {
        this.logger('✅ .NET Framework版本符合要求');
        return true;
      } else {
        this.logger(`⚠️  .NET Framework版本可能过低: ${result}`);
        return false;
      }
    } catch (error) {
      this.logger('⚠️  无法检查.NET Framework版本');
      return true; // 继续安装，安装脚本会自行检查
    }
  }

  // 创建安装目录
  createInstallDirectory() {
    this.logger(`📂 创建安装目录: ${this.options.installPath}`);
    
    try {
      if (!fs.existsSync(this.options.installPath)) {
        fs.mkdirSync(this.options.installPath, { recursive: true });
        this.logger('✅ 目录创建成功');
      } else {
        this.logger('📁 目录已存在');
      }
      return true;
    } catch (error) {
      console.error(`❌ 创建目录失败: ${error.message}`);
      
      // 尝试使用用户临时目录
      if (error.message.includes('permission') || error.code === 'EPERM') {
        this.logger('💡 尝试使用用户临时目录...');
        this.options.installPath = path.join(os.tmpdir(), 'chocolatey_install');
        return this.createInstallDirectory();
      }
      
      return false;
    }
  }

  // 方法A: 使用官方安装脚本（需要管理员权限）
  async installWithAdminScript() {
    this.logger('🚀 使用官方脚本安装（需要管理员权限）...');
    
    const installScript = `
      [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;
      iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
    `;
    
    try {
      this.logger('📥 下载并执行官方安装脚本...');
      
      await execSyncAsync(
        `"${this.powershellPath}" -ExecutionPolicy Bypass -Command "${installScript}"`,
        { 
          stdio: 'inherit',
          windowsHide: true,
          timeout: 300000 // 5分钟超时
        }
      );
      
      this.logger('✅ 官方脚本执行完成');
      return true;
    } catch (error) {
      console.error(`❌ 官方脚本安装失败: ${error.message}`);
      return false;
    }
  }

  // 方法B: 手动安装（无需管理员权限）
  installManually() {
    this.logger('🔧 开始手动安装（无需管理员权限）...');
    
    const chocoDir = this.options.installPath;
    const binDir = path.join(chocoDir, 'bin');
    const libDir = path.join(chocoDir, 'lib');
    const toolsDir = path.join(chocoDir, 'tools');
    
    // 创建目录结构
    [binDir, libDir, toolsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // 下载choco.exe
    const chocoExeUrl = 'https://chocolatey.org/api/v2/package/chocolatey/';
    
    return new Promise((resolve, reject) => {
      this.logger('📥 下载Chocolatey核心组件...');
      
      https.get(chocoExeUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // 处理重定向
          const redirectUrl = response.headers.location;
          this.logger(`🔄 重定向到: ${redirectUrl}`);
          https.get(redirectUrl, this._downloadAndExtract.bind(this, chocoDir, resolve, reject));
        } else {
          this._downloadAndExtract(chocoDir, resolve, reject, response);
        }
      }).on('error', (error) => {
        console.error(`❌ 下载失败: ${error.message}`);
        reject(error);
      });
    });
  }

  // 下载并提取Chocolatey
  _downloadAndExtract(chocoDir, resolve, reject, response) {
    const chunks = [];
    
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        
        // 保存为nupkg文件
        const nupkgPath = path.join(chocoDir, 'chocolatey.nupkg');
        fs.writeFileSync(nupkgPath, buffer);
        
        this.logger('📦 解压Chocolatey包...');
        
        // 解压nupkg（实际上是zip格式）
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(nupkgPath);
        
        // 提取choco.exe到bin目录
        const binDir = path.join(chocoDir, 'bin');
        zip.extractEntryTo('tools/choco.exe', binDir, false, true);
        
        // 重命名
        const chocoExePath = path.join(binDir, 'choco.exe');
        if (fs.existsSync(chocoExePath)) {
          this.logger(`✅ Chocolatey核心文件: ${chocoExePath}`);
          
          // 创建批处理包装器
          this._createBatchWrapper(chocoDir);
          
          // 删除临时文件
          fs.unlinkSync(nupkgPath);
          
          resolve(true);
        } else {
          reject(new Error('解压后未找到choco.exe'));
        }
      } catch (error) {
        reject(error);
      }
    });
    
    response.on('error', reject);
  }

  // 创建批处理包装器（兼容性）
  _createBatchWrapper(chocoDir) {
    const batchContent = `@echo off
"%~dp0choco.exe" %*
`;
    
    const batchPath = path.join(chocoDir, 'bin', 'choco.bat');
    fs.writeFileSync(batchPath, batchContent);
    this.logger(`📝 创建批处理包装器: ${batchPath}`);
  }

  // 配置环境变量
  configureEnvironment() {
    this.logger('⚙️  配置环境变量...');
    
    const chocoBin = path.join(this.options.installPath, 'bin');
    
    // 1. 在当前Node.js进程中设置
    process.env.Path = `${chocoBin};${process.env.Path}`;
    process.env.ChocolateyInstall = this.options.installPath;
    
    this.logger(`  当前进程PATH已添加: ${chocoBin}`);
    
    // 2. 尝试设置用户环境变量
    if (this.isAdmin) {
      this._setUserEnvironmentVariable(chocoBin);
    }
    
    return true;
  }

  // 设置用户环境变量
  async _setUserEnvironmentVariable(chocoBin) {
    try {
      const setxCommand = `setx PATH "%PATH%;${chocoBin}"`;
      await execSyncAsync(setxCommand, { stdio: 'pipe' });
      this.logger('✅ 用户环境变量已更新（需要重启终端）');
    } catch (error) {
      this.logger(`⚠️  无法设置永久环境变量: ${error.message}`);
      this.logger('💡 请手动添加以下路径到PATH:');
      this.logger(`   ${chocoBin}`);
    }
  }

  // 验证安装
  async verifyInstallation() {
    this.logger('🔬 验证Chocolatey安装...');
    
    try {
      // 检查choco.exe是否存在
      const chocoExe = path.join(this.options.installPath, 'bin', 'choco.exe');
      if (!fs.existsSync(chocoExe)) {
        throw new Error('choco.exe 不存在');
      }
      
      // 尝试运行 choco --version
      const version = await execSyncAsync(`"${chocoExe}" --version`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      
      this.logger(`✅ Chocolatey 版本: ${version}`);
      
      // 运行 choco -? 检查基本功能
      await execSyncAsync(`"${chocoExe}" -?`, { 
        stdio: ['pipe', 'ignore', 'ignore'],
        timeout: 10000 
      });
      
      this.logger('✅ Chocolatey 功能正常');
      this.installSuccess = true;
      return true;
    } catch (error) {
      console.error(`❌ 验证失败: ${error.message}`);
      
      // 提供调试信息
      this.logger('\n🔧 调试信息:');
      this.logger(`  安装路径: ${this.options.installPath}`);
      this.logger(`  是否为管理员: ${this.isAdmin}`);
      this.logger(`  PATH: ${process.env.Path}`);
      
      return false;
    }
  }

  // 提供使用说明
  showUsageInstructions() {
    this.logger('\n' + '='.repeat(60));
    this.logger('🎉 Chocolatey 安装完成!');
    this.logger('='.repeat(60));
    
    if (this.installSuccess) {
      this.logger('\n📚 使用说明:');
      this.logger('1. 立即使用:');
      this.logger(`   choco --version`);
      this.logger(`   choco install <package-name>`);
      
      this.logger('\n2. 如果命令未识别，请手动设置PATH:');
      this.logger(`   set PATH=${path.join(this.options.installPath, 'bin')};%PATH%`);
      
      this.logger('\n3. 常用命令:');
      this.logger('   choco search <keyword>    # 搜索软件包');
      this.logger('   choco install <package>   # 安装软件包');
      this.logger('   choco upgrade all         # 更新所有软件包');
      this.logger('   choco list --local-only   # 查看已安装的软件包');
      
      this.logger('\n4. 安装示例:');
      this.logger('   choco install git -y');
      this.logger('   choco install nodejs-lts -y');
      this.logger('   choco install vscode -y');
    } else {
      this.logger('\n❌ 安装未完成，请检查以下事项:');
      this.logger('1. 确保PowerShell执行策略允许脚本运行');
      this.logger('2. 尝试以管理员身份运行此脚本');
      this.logger('3. 检查网络连接');
      this.logger('4. 参考: https://chocolatey.org/install');
    }
    
    this.logger('\n' + '='.repeat(60));
  }

  // 主安装流程
  async install() {
    if (!this.isWindows) {
      console.error('❌ Chocolatey 仅支持Windows系统');
      return false;
    }
    
    this.logger('🚀 开始 Chocolatey 安装流程');
    this.logger('='.repeat(60));
    
    // 检查是否已安装
    if (await this.isAlreadyInstalled()) {
      this.logger('\n💡 Chocolatey 已安装，跳过安装步骤');
      this.installSuccess = true;
      this.showUsageInstructions();
      return true;
    }
    
    // 检查管理员权限
    const hasAdmin = this.checkAdminPrivileges();
    
    // 检查.NET Framework
    await this.checkDotNetFramework();
    
    // 检查执行策略
    if (!await this.checkExecutionPolicy()) {
      this.logger('\n🔄 尝试调整执行策略...');
      await this.setExecutionPolicy();
    }
    
    let installMethod = null;
    
    if (hasAdmin) {
      // 有管理员权限，使用官方脚本
      this.logger('\n🔧 使用官方安装脚本（需要管理员权限）');
      installMethod = () => this.installWithAdminScript();
    } else {
      // 无管理员权限，使用手动安装
      this.logger('\n🔧 使用手动安装（无需管理员权限）');
      this.logger('⚠️  注意：手动安装可能功能受限');
      
      // 创建安装目录
      if (!this.createInstallDirectory()) {
        return false;
      }
      
      installMethod = () => this.installManually();
    }
    
    // 执行安装
    this.logger('\n' + '-'.repeat(40));
    try {
      const installResult = await installMethod();
      
      if (installResult) {
        // 配置环境
        this.configureEnvironment();
        
        // 验证安装
        if (this.verifyInstallation()) {
          this.installSuccess = true;
        }
      }
    } catch (error) {
      console.error(`💥 安装过程出错: ${error.message}`);
    }
    
    // 显示使用说明
    this.showUsageInstructions();
    
    return this.installSuccess;
  }
}

// 使用示例
async function main() {
  const installer = new ChocolateyInstaller({
    // 可选配置:
    // installPath: 'C:\\MyChocolatey',
    // skipAdminCheck: false,
    // executionPolicy: 'Bypass',
    // useMirror: true
  });
  
  try {
    const success = await installer.install();
    
    if (success) {
      this.logger('\n✅ Chocolatey 安装成功！');
      
      // 可以在这里继续安装其他软件包
      if (installer.installSuccess) {
        this.logger('\n🔧 示例：安装常用工具');
        this.logger('要安装Git，请运行: choco install git -y');
      }
    } else {
      this.logger('\n❌ Chocolatey 安装失败');
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
module.exports = ChocolateyInstaller;