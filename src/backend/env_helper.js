// env-helper.js
const { platform, env } = process;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const os = require('os');
const path = require('path');
const { isSea } = require('node:sea');
const { writeLogFile } = require('./logger')

/**
 * 获取系统环境变量的简化版本
 */
async function getSystemEnv() {
  // 如果是 Windows 或已经通过 shell 启动，直接返回
  if (platform === 'win32' || env.SHELL || env.TERM) {
    console.log(`env from shell`);
    return { PATH: env.PATH || env.Path || '' };
  }
  
  try {
    let command;
    const homeDir = os.homedir();
    const username = os.userInfo().username;
    
    if (platform === 'darwin') {
      const shell = env.SHELL || '/bin/zsh';
      const shellName = path.basename(shell);
      
      if (shellName === 'zsh') {
        // 对于 zsh，需要正确设置 ZDOTDIR 和加载启动文件
        command = `USER=${username} HOME=${homeDir} LOGNAME=${username} ${shell} -l -c 'echo $PATH'`;
      } else if (shellName === 'bash') {
        // 对于 bash，使用 --login 加载配置文件
        command = `USER=${username} HOME=${homeDir} LOGNAME=${username} ${shell} --login -c 'echo $PATH'`;
      } else {
        command = `USER=${username} HOME=${homeDir} LOGNAME=${username} ${shell} -l -c 'echo $PATH'`;
      }
    } else {
      // Linux
      const shell = env.SHELL || '/bin/bash';
      const username = os.userInfo().username;
      command = `USER=${username} HOME=${homeDir} LOGNAME=${username} ${shell} --login -c 'echo $PATH'`;
    }
    
    writeLogFile(`Executing command: ${command}`);
    const { stdout } = await execAsync(command, { 
      timeout: 3000,
      encoding: 'utf8',
      // 不设置 env 参数，让子进程继承当前环境
    });
    
    writeLogFile(`env from command: ${stdout.trim()}`);
    return {
      PATH: stdout.trim() || env.PATH || '',
      HOME: env.HOME || homeDir,
      USER: env.USER || username
    };
    
  } catch (error) {
    console.error(`Error getting system env: ${error.message}`);
    return {
      PATH: env.PATH || '',
      HOME: env.HOME || os.homedir(),
      USER: env.USER || os.userInfo().username
    };
  }
}

/**
 * 获取用户的 PATH - 使用 source 加载配置文件
 */
async function getUserPathWithSource() {
  try {
    const shell = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    const shellName = path.basename(shell);
    const homeDir = os.homedir();
    const username = os.userInfo().username;
    
    // 构建一个脚本来加载配置文件
    let script;
    if (shellName === 'zsh') {
      script = `
        # 设置基本环境变量
        export USER="${username}"
        export HOME="${homeDir}"
        export LOGNAME="${username}"
        
        # 对于 zsh，需要先加载 zshenv
        if [ -f "${homeDir}/.zshenv" ]; then
          source "${homeDir}/.zshenv"
        fi
        
        # 加载 zprofile 和 zshrc（如果存在）
        if [ -f "${homeDir}/.zprofile" ]; then
          source "${homeDir}/.zprofile"
        fi
        
        if [ -f "${homeDir}/.zshrc" ]; then
          source "${homeDir}/.zshrc"
        fi
        
        echo $PATH
      `;
    } else {
      // bash
      script = `
        # 设置基本环境变量
        export USER="${username}"
        export HOME="${homeDir}"
        export LOGNAME="${username}"
        
        # 加载 bash 配置文件
        if [ -f "${homeDir}/.bash_profile" ]; then
          source "${homeDir}/.bash_profile"
        elif [ -f "${homeDir}/.profile" ]; then
          source "${homeDir}/.profile"
        fi
        
        if [ -f "${homeDir}/.bashrc" ]; then
          source "${homeDir}/.bashrc"
        fi
        
        echo $PATH
      `;
    }
    
    // 执行脚本
    const command = `'${script.replace(/'/g, "'\"'\"'")}'`;
    const { stdout } = await execAsync(`${shell} -c ${command}`, {
      timeout: 5000,
      encoding: 'utf8'
    });
    
    return stdout.trim();
  } catch (error) {
    console.error(`Error getting user PATH with source: ${error.message}`);
    return null;
  }
}

/**
 * 快速初始化环境变量 - 改进版
 */
async function setupEnvironment() {
  // 只在需要时获取系统环境变量
  const shouldFetchSystemEnv = isSea();

  writeLogFile(`shouldFetchSystemEnv: ${shouldFetchSystemEnv}`)
  
  if (shouldFetchSystemEnv) {
    writeLogFile(`Current PATH before fix: ${env.PATH}`);
    
    // 尝试两种方法获取 PATH
    let systemEnv;
    
    try {
      // 先尝试用 source 方法（更准确）
      const userPath = await getUserPathWithSource();
      if (userPath && userPath.includes(os.homedir())) {
        writeLogFile(`Got PATH with source: ${userPath}`);
        systemEnv = {
          PATH: userPath,
          HOME: env.HOME || os.homedir(),
          USER: env.USER || os.userInfo().username
        };
      } else {
        // 回退到原来的方法
        systemEnv = await getSystemEnv();
      }
    } catch (error) {
      // 如果失败，使用原来的方法
      systemEnv = await getSystemEnv();
    }
    
    // 合并 PATH
    if (systemEnv.PATH && systemEnv.PATH.trim()) {
      const separator = platform === 'win32' ? ';' : ':';
      const systemPaths = systemEnv.PATH.split(separator).filter(p => p.trim());
      
      if (env.PATH) {
        const currentPaths = env.PATH.split(separator).filter(p => p.trim());
        
        // 合并并去重，保持系统路径在前（用户的配置路径）
        const allPaths = [...systemPaths, ...currentPaths];
        const uniquePaths = [...new Set(allPaths)];
        
        env.PATH = uniquePaths.join(separator);
      } else {
        env.PATH = systemPaths.join(separator);
      }
      
      writeLogFile(`Updated PATH: ${env.PATH}`);
    }
    
    // 设置其他变量
    if (systemEnv.HOME) env.HOME = systemEnv.HOME;
    if (systemEnv.USER) env.USER = systemEnv.USER;
  } else {
    writeLogFile(`Using existing PATH: ${env.PATH}`);
  }
  
  return env;
}

// 添加一个简单测试函数
async function testEnvironment() {
  await setupEnvironment();
  
  console.log(`\n=== Environment Test Results ===`);
  console.log(`Platform: ${platform}`);
  console.log(`HOME: ${env.HOME}`);
  console.log(`USER: ${env.USER}`);
  console.log(`SHELL: ${env.SHELL || 'not set'}`);
  console.log(`TERM: ${env.TERM || 'not set'}`);
  
  const path = env.PATH || env.Path || '';
  console.log(`\nPATH contains:`);
  console.log(`  ~/.nvm: ${path.includes('.nvm') ? '✅' : '❌'}`);
  console.log(`  homebrew: ${path.includes('homebrew') ? '✅' : '❌'}`);
  console.log(`  conda: ${path.includes('conda') ? '✅' : '❌'}`);
  console.log(`  /usr/local/bin: ${path.includes('/usr/local/bin') ? '✅' : '❌'}`);
  
  console.log(`\nFirst few PATH entries:`);
  const pathEntries = path.split(platform === 'win32' ? ';' : ':');
  pathEntries.slice(0, 5).forEach((entry, i) => {
    console.log(`  ${i + 1}. ${entry}`);
  });
  
  if (pathEntries.length > 5) {
    console.log(`  ... and ${pathEntries.length - 5} more`);
  }
}

// 使用
if (require.main === module) {
  testEnvironment().catch(console.error);
}

module.exports = { 
  getSystemEnv, 
  setupEnvironment, 
  getUserPathWithSource,
  testEnvironment 
};