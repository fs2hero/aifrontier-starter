// import{ dialog,screen } from "electron";
const { execFile, exec } = require("node:child_process");
const { promisify } = require("node:util");
const os = require("node:os");
const path = require("path");
// import fs from "node:fs/promises";
const fs = require('fs');
const sudo = require('@expo/sudo-prompt')
const { envManager } = require('./env_mgr.js');

const execFileP = promisify(execFile);
const execP = promisify(exec);

const fsp=fs.promises;

// export const username = process.env.SUDO_USER || process.env.USER || "root";
const isArm = process.arch === "arm64";

const isMac = () => process.platform === 'darwin';
const isLinux = () => process.platform === 'linux';
const isWin = () => process.platform === 'win32';

function ensureDirSync(dirPath) {
    if (fs.existsSync(dirPath)) return;
    fs.mkdirSync(dirPath, { recursive: true });
}

async function copyFileToDir(srcFile, targetDir,targetName) {
    const fileName = path.basename(srcFile);
    const destPath = path.join(targetDir, targetName||fileName);
    await fsp.mkdir(targetDir, { recursive: true }); // 确保目录存在
    await fsp.copyFile(srcFile, destPath);
}

//---------------------------------------------------------------------------
async function copyDirWithReplace(srcDir, destDir) {
    await fsp.mkdir(destDir, { recursive: true });
    const entries = await fsp.readdir(srcDir, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        
        if (entry.isDirectory()) {
            // 如果目标目录中已存在该子目录，先删除
            try {
                await fsp.rm(destPath, { recursive: true, force: true });
            } catch (e) {} // 忽略不存在等错误
            
            await copyDirWithReplace(srcPath, destPath);
        } else if (entry.isFile()) {
            await fsp.copyFile(srcPath, destPath);
        }
    }
}

async function linkDir(srcDir, dstDir) {
	try {
		await fsp.mkdir(path.dirname(dstDir), { recursive: true });
		await fsp.symlink(srcDir, dstDir, 'dir');
		console.log(`链接创建成功: ${dstDir} -> ${srcDir}`);
	} catch (err) {
		console.error(`创建符号链接失败: ${err.message}`);
	}
}

// 获取最新的环境变量
async function getFreshEnvironment() {
  try {
    // 通过执行 env 命令获取当前系统的最新环境变量
    const { stdout } = await execP('/bin/bash -c env', {
      timeout: 10000,
      env: { ...process.env }  // 使用当前环境作为基础
    });
    
    // 解析 env 输出为对象
    const freshEnv = {};
    stdout.toString().split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        freshEnv[key] = valueParts.join('=');
      }
    });
    
    return freshEnv;
  } catch (e) {
    console.error('Failed to get fresh environment:', e.message);
    return { ...process.env }; // 失败时回退到当前环境
  }
}

const sh = async (cmd, env = {}) => {
  const start = Date.now();
  // Log command (single-line) and a small env summary (don't print secrets)
  try {
    console.log(`[sh] RUN -> ${cmd.replace(/\n/g, ' ')} `);
    console.log(`[sh] ENV PATH=${(process.env.PATH || '').slice(0, 200)}${(process.env.PATH || '').length > 200 ? '...' : ''}`);
    // 获取最新的环境变量
    const freshEnv = await envManager.getEnvironment(true);
    console.log(`[sh] NEW ENV PATH=${(freshEnv.PATH || '').slice(0, 200)}${(freshEnv.PATH || '').length > 200 ? '...' : ''}`);

    const { stdout, stderr } = await execFileP('/bin/bash', ['-lc', cmd], { timeout: 200_000, env: { ...process.env, ...freshEnv, ...env } });
    const took = Date.now() - start;
    const sOut = (stdout || '').toString();
    const sErr = (stderr || '').toString();
    console.log(`[sh] OK  <- ${cmd.split('\n')[0].slice(0,80)}... (${took}ms) stdout=${sOut.slice(0,1000)}${sOut.length>1000?"...":""}`);
    if (sErr) console.log(`[sh] STDERR: ${sErr.slice(0,1000)}${sErr.length>1000?"...":""}`);
    return { stdout, stderr };
  } catch (e) {
    console.log(`[sh] ERR  <- ${cmd.split('\n')[0].slice(0,80)}...`,e);

    const took = Date.now() - start;
    const errOut = (e.stdout || e.stderr || '') .toString();
    console.error(`[sh] ERR  <- ${cmd.split('\n')[0].slice(0,80)}... (${took}ms) code=${e.code ?? 'N/A'} output=${errOut.slice(0,1000)}${errOut.length>1000?"...":""}`);
    throw e;
  }
};

const shWithAdmin = async (cmd, env = {}) => {
  const start = Date.now();
  // Log command (single-line) and a small env summary (don't print secrets)
  try {
    // const Sudoer = await import('electron-sudo');
    const options = {name: 'Ai2Apps'};

    console.log(`[shWithAdmin] RUN -> ${cmd.replace(/\n/g, ' ')} `);
    console.log(`[shWithAdmin] ENV PATH=${(process.env.PATH || '').slice(0, 200)}${(process.env.PATH || '').length > 200 ? '...' : ''}`);
    const { stdout, stderr } = await new Promise((resolve,reject) => {
      sudo.exec(`${cmd}`, {...options, env: { ...process.env, ...env } }, function(error, stdout, stderr) {
        if (error) {
          reject(error);
        } else {
          resolve({stdout, stderr})
        }
      });
    }) 

    const took = Date.now() - start;
    const sOut = (stdout || '').toString();
    const sErr = (stderr || '').toString();
    console.log(`[shWithAdmin] OK  <- ${cmd.split('\n')[0].slice(0,80)}... (${took}ms) stdout=${sOut.slice(0,1000)}${sOut.length>1000?"...":""}`);
    if (sErr) console.log(`[shWithAdmin] STDERR: ${sErr.slice(0,1000)}${sErr.length>1000?"...":""}`);
    return { stdout, stderr };
  } catch (e) {
    const took = Date.now() - start;
    const errOut = e.toString();
    console.error(`[shWithAdmin] ERR  <- ${cmd.split('\n')[0].slice(0,80)}... (${took}ms) code=${e.code ?? 'N/A'} output=${errOut.slice(0,1000)}${errOut.length>1000?"...":""}`);
    throw e;
  }
};

const run = async (cmd, useAdmin) => {
  try {
    const { stdout } = !useAdmin ? await sh(cmd) : await shWithAdmin(cmd);
    return { ok: true, out: (stdout || '').trim() };
  } catch (e) {
    return { ok: false, out: (e.stdout || e.stderr || '').toString().trim(), code: e.code ?? -1 };
  }
};

async function runStepsInTerminal(steps) {
	// steps: string[] 每个元素一条 shell 命令
  console.log(`[runStepsInTerminal] RUN -> ${steps.length} `);

	const tmpDir = await fs.mkdtempSync(path.join(os.tmpdir(), "electron-steps-"));
	const scriptPath = path.join(tmpDir, "run.command");
	
	// 用 zsh 更贴近用户默认环境；加 -e 出错即退出；最后留一行提示避免窗口一闪而过
	const content =
		`#!/bin/zsh
set -e
${steps.join("\n")}

echo ""
read -sk 1 -p "执行完成。按任意键关闭窗口…"
echo ""`;
	
	await fs.writeFileSync(scriptPath, content, { mode: 0o755 });
	
	// 用引号包裹路径，防空格
	await execFileP("open", ["-a", "Terminal", scriptPath]);
}

function getUserDir() {
  const homeDir = os.homedir();
  
  return {
    home: homeDir,
    // 跨平台应用数据目录
    appData: process.platform === 'win32' 
      ? path.join(homeDir, 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(homeDir, 'Library', 'Application Support')
        : path.join(homeDir, '.config')
  };
}

module.exports = {
    ensureDirSync,
    copyFileToDir,
    sh,
    shWithAdmin,
    run,
    getUserDir,
    isMac,
    isLinux,
    isWin,
    isArm,
    copyDirWithReplace,
    linkDir
};