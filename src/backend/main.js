const express = require('express')
const path = require('path')
const { fileURLToPath } = require('url');
const { spawn } = require('child_process');
const { existsSync, chmodSync, writeFileSync, readFileSync, rename, promises:fsp } = require('fs');
const { getAsset, isSea } = require('node:sea');
const { unzip } = require('./zip.js');
const { getUserDir, ensureDirSync, isWin, copyDirWithReplace, copyFileToDir, removeDirOrFile, writeLogFile } = require('./sys_utils.js');
const NodeInstaller = require('./node_env.js');
const MinicondaInstaller = require('./miniconda_env.js');
const PackageManagerInstaller = require('./package_manager_env.js');
const CurlInstaller = require('./curl_env.js');
const CoreutilsInstaller = require('./coreutils_env.js');
const { PortChecker } = require('./port_checker.js');
const { FirefoxLauncher } = require('./firefox_launcher.js');
// const notifier = require('node-notifier');

const APP_VER = require('../../package.json').version;

const app = express()
let aaProcess;

let FIREFOX_DEBUG_PORT = 9222
let STARTER_SERVICE_PORT = 4000
let AA_SERVICE_PORT = 3015

const nodeInstaller = new NodeInstaller();
let firefoxInstance = null;

// async function sendNotification(title, message) {
//   return new Promise((resolve, reject) => {
//     notifier.notify({
//       title: title,
//       message: message,
//       sound: true,
//       wait: false
//     }, (err, response) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(response);
//       }
//     });
    
//     // 防止回调不触发的问题
//     notifier.on('click', () => resolve('clicked'));
//     notifier.on('timeout', () => resolve('timeout'));
//   });
// }

function runBashScript(script,cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn('bash', ['-i'], {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: process.env,
			cwd:cwd||undefined
		});
		
		let stdout = '';
		let stderr = '';
		let allout='';
		
		child.stdout.on('data', (data) => {
			let pos;
			stdout += data.toString();
			allout += data.toString();
			do {
				pos = allout.indexOf("\n");
				if (pos>=0){
					console.log(`[runBashScript] ${allout.substring(0,pos)}`);
					allout=allout.substring(pos+1);
				}
			}while(pos>=0)
		});
		
		child.stderr.on('data', (data) => {
			let pos;
			stderr += data.toString();
			allout += data.toString();
			do {
				pos = allout.indexOf("\n");
				if (pos>=0){
					console.log(`[runBashScript] ${allout.substring(0,pos+1)}`);
					allout=allout.substring(pos+1);
				}
			}while(pos>=0)
		});
		
		child.on('close', (code) => {
			if (code === 0) {
				let out=stdout.trim();
				console.log(`[runBashScript] ${allout}`);
				resolve(out);
			} else {
				let out=stderr;
				console.log(`[runBashScript] ${allout}`);
				reject(new Error(`Exited with code ${code}\n${stderr}`));
			}
		});
		
		child.stdin.write(script + '\n');
		child.stdin.end();
	});
}

// function runShell(script, cwd) {
//   const isWin = process.platform === "win32";

//   return new Promise((resolve, reject) => {
//     let child;

//     if (isWin) {
//       // Windows 下直接把脚本作为参数传给 PowerShell
//       child = spawn("powershell.exe", [
//         "-NoProfile",
//         "-ExecutionPolicy", "Bypass",
//         "-WindowStyle", "Hidden",
//         "-Command", script
//       ], {
//         cwd: cwd || undefined,
//         env: process.env,
//       });
//     } else {
//       // Unix 系保持原样
//       child = spawn("bash", ["-i", "-c", script], {
//         cwd: cwd || undefined,
//         env: process.env,
//       });
//     }

//     let stdout = "";
//     let stderr = "";

//     child.stdout.on("data", (d) => {
//       stdout += d.toString();
//       console.log(`[runShell] ${d}`);
//     });
//     child.stderr.on("data", (d) => {
//       stderr += d.toString();
//       console.log(`[runShell] ${d}`);
//     });

//     child.on("close", (code) => {
//       if (code === 0) resolve(stdout.trim());
//       else reject(new Error(stderr));
//     });
//   });
// }
function runShell(script, cwd, logger) {
  const isWin = process.platform === "win32";
  const isMac = process.platform === 'darwin';

  return new Promise((resolve, reject) => {
    let child;

    if (isWin) {
      child = spawn("cmd.exe", [
        "/c",
        script
      ], {
        cwd: cwd || undefined,
        env: process.env,
      });
    } else if(isMac) {
      child = spawn("bash", ["-i", "-c", script], {
        cwd: cwd || undefined,
        env: process.env,
      });
    } else {
      child = spawn("/usr/bin/bash", ["-i", "-c", script], {
        cwd: cwd || undefined,
        env: {
          ...process.env,
          // 手动添加系统路径到 PATH
          PATH: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${process.env.PATH || ''}`,
          // 确保重要变量存在
          HOME: process.env.HOME || require('os').homedir(),
          USER: process.env.USER || require('os').userInfo().username,
          LOGNAME: process.env.USER || require('os').userInfo().username,
        },
        // stdio: ['pipe', 'pipe', 'pipe']
      });
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      console.log(`[runShell] ${d}`);

      logger && logger(d.toString())
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      console.log(`[runShell] ${d}`);

      logger && logger(d.toString())
    });

    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr));
    });
  });
}



// async function getNodePath(userDataDir,v){
// 	let nodePath;
// 	const nodePathCache = path.join(userDataDir, `.nvm_node_path_${v}`);
// 	if (!existsSync(nodePathCache)) {
// 		return null;
// 	}
// 	nodePath = readFileSync(nodePathCache, 'utf8').trim();
// 	if (!existsSync(nodePath)){
// 		return null;
// 	}
// 	return nodePath;
// }

// async function installNode(userDataDir, v, install = true) {
//   const isWin = process.platform === "win32";
//   const nodePathCache = path.join(userDataDir, `.nvm_node_path_${v}`);

//   let script;
//   if (isWin) {
//     // script = install
//     //   ? `nvm install ${v}; nvm use ${v}; where.exe node`
//     //   : `nvm use ${v}; where.exe node`;
//     script = install
//     ? `nvm install ${v} && nvm use ${v} && where node`
//     : `nvm use ${v} && where node`;
//   } else {
//     script = `
//       unset npm_config_prefix
//       export NVM_DIR="$HOME/.nvm"
//       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
//       ${install ? `nvm install ${v}` : ""}
//       nvm use ${v}
//       which node
//     `;
//   }

//   try {
//     const output = await runShell(script);
//     const nodePath = output.trim().split("\n").at(-1).trim();
//     writeFileSync(nodePathCache, nodePath);
//     console.log(`[NVM] 缓存 node 路径: ${nodePath}`);
//     return nodePath;
//   } catch (err) {
//     console.error(err);
//     return null;
//   }
// }


async function installNodePackages(userDataDir, nodeVersion, res) {
  const isWin = process.platform === "win32";
  let script;
  const nodeEnvs = nodeInstaller.getEnvironment();

  if (isWin) {
    script = `
      "${nodeEnvs.npmPath}" install
    `;
  } else {
    script = `
      "${nodeEnvs.npmPath}" install
    `;
  }

  try {
    await runShell(script, userDataDir, (log) => {
      sendSSELog(res,log)
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function updateEnvFile(envfile, config) {
	let content = '';
	try {
		content = await fsp.readFile(envfile, 'utf-8');
	} catch (err) {
		if (err.code === 'ENOENT') {
			// 文件不存在则初始化为空
			content = '';
		} else {
			throw err;
		}
	}
	
	const lines = content.split('\n');
	const keys = new Set(Object.keys(config));
	const updated = [];
	
	for (let line of lines) {
		const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
		if (match) {
			const key = match[1];
			if (keys.has(key)) {
				updated.push(`${key}=${config[key]}`);
				keys.delete(key);
			} else {
				updated.push(line);
			}
		} else {
			updated.push(line); // 保留注释或空行
		}
	}
	
	// 添加新增的键值
	for (const key of keys) {
		updated.push(`${key}=${config[key]}`);
	}
	
	await fsp.writeFile(envfile, updated.join('\n'), 'utf-8');
}


// async function installNode(userDataDir,v,install=true){
// 	let nodePath;
// 	const nodePathCache = path.join(userDataDir, `.nvm_node_path_${v}`);
// 	let shellScript;
// 	if(install) {
// 		shellScript = `
//       unset npm_config_prefix
//       export NVM_DIR="$HOME/.nvm"
//       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
//       nvm install ${v}
//       nvm use ${v}
//       which node
//     `;
// 	}else{
// 		shellScript = `
//       unset npm_config_prefix
//       export NVM_DIR="$HOME/.nvm"
//       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
//       nvm use ${v}
//       which node
//     `;
// 	}
// 	try {
// 		let result=await runBashScript(shellScript);
// 		nodePath = result.trimEnd().split('\n').at(-1);
// 		writeFileSync(nodePathCache, nodePath);
// 	}catch(err){
// 		console.error("Get node path error:");
// 		console.error(err);
// 		return null;
// 	}
// 	console.log(`[NVM] 缓存 node 路径: ${nodePath}`);
// 	return nodePath;
// }

//---------------------------------------------------------------------------
// async function installNodePackages(userDataDir,nodeVersion){
// 	const shellScript = `
//       unset npm_config_prefix
//       export NVM_DIR="$HOME/.nvm"
//       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
//       nvm use ${nodeVersion}
// 	  npm install
// 	`;
// 	try {
// 		await runBashScript(shellScript,userDataDir);
// 		return true;
// 	}catch(err){
// 		return false;
// 	}
// }

// Serve the Vue frontend
// app.use(express.static(path.join(__dirname, '../build')))
// 统一的静态文件服务
app.use((req, res, next) => {
  let requestPath = req.path;

  console.log(`request path:${requestPath}`)
  if(requestPath.startsWith('/api')) {
    next();

    return;
  }

  if (isSea()) {
    // SEA 环境
    serveFromSeaAssets(req, res, next);
  } else {
    // 开发环境
    serveFromFileSystem(req, res, next);
  }
});

const assetsCache = {};
function getAssetData(key) {
  console.log(`getAssetData ${key}`)
  if(assetsCache[key]) {
    return assetsCache[key]
  } else {
    try {
      const data = getAsset(key);
      assetsCache[key] = data;

      return data;
    } catch(err) {
      console.error('getAssetData error', err)
      return '';
    }
    
  }
}

function convertArrayBufferToString(buffer, encoding = 'utf-8') {
  if(!buffer) {
    return '';
  }

  try {
      const decoder = new TextDecoder(encoding);
      return decoder.decode(buffer);
  } catch (e) {
      console.warn('TextDecoder not supported, using fallback method');
  }
  
  // 方法2: 回退方法
  const uint8Array = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < uint8Array.length; i++) {
      str += String.fromCharCode(uint8Array[i]);
  }
  return str;
}

function serveFromSeaAssets(req, res, next) {
  let requestPath = req.path;
  
  // 处理根路径
  if (requestPath === '/') {
    requestPath = '/index.html';
  }
  
  const assetKey = `build${requestPath}`;
  const assetData = getAssetData(assetKey);
  
  if (assetData) {
    let assetStr = assetData
    
    // 设置正确的 Content-Type
    const ext = path.extname(requestPath);
    const contentType = getContentType(ext);
    console.log(`contentType ${requestPath} ==> ${contentType}`)
    if(['text/html','text/css','application/javascript','application/json','text/plain','image/svg+xml'].includes(contentType)) {
      assetStr = convertArrayBufferToString(assetData);
    }
    // console.log('asset data:',assetStr)
    res.setHeader('Content-Type', contentType);

    // 特别处理 SVG
    if (contentType === 'image/svg+xml') {
      // res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      // console.log(`svg data: ${assetStr}`)
    }
    res.send(assetStr);
  } else {
    // 尝试找 index.html（用于 SPA 路由）
    const fallbackAsset = getAssetData('build/index.html');
    const assetStr = convertArrayBufferToString(fallbackAsset)
    // console.log('asset data:',assetStr)
    if (fallbackAsset && isHtmlRequest(requestPath)) {
      res.setHeader('Content-Type', 'text/html');
      res.send(assetStr);
    } else {
      next(); // 交给其他路由处理
    }
  }
}

function serveFromFileSystem(req, res, next) {
  const staticPath = path.join(__dirname, '../build');
  return express.static(staticPath)(req, res, next);
}

function getContentType(ext) {
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain'
  };
  return types[ext] || 'application/octet-stream';
}

function isHtmlRequest(path) {
  // 检查是否是可能的 SPA 路由（没有文件扩展名）
  return !path.includes('.') || path.endsWith('/');
}

function readJson(filePath){
	try {
		if (!existsSync(filePath)) {
			console.error(`File not found: ${filePath}`)
			return null
		}
		const fileContent = readFileSync(filePath, 'utf8')
		try {
			const jsonData = JSON.parse(fileContent)
			return jsonData
		} catch (parseError) {
			console.error(`Error parsing JSON from ${filePath}:`, parseError)
			return null
		}
	} catch (readError) {
		console.error(`Error reading file ${filePath}:`, readError)
		return null
	}
}

function writeJson(filePath, data) {
  writeFileSync(filePath, data, 'utf-8');
}

function safeParseJson(str) {
  if (!str) {
    console.error(`data is empty: ${str}`)
    return null
  }

  try {
    const jsonData = JSON.parse(str)
    return jsonData
  } catch (parseError) {
    console.error(`Error parsing JSON from ${str}:`, parseError)
    return null
  }
}

async function extractBundle(targetDir, srcDir) {
  // if(!isSea()) {
  //   return;
  // }
  const seaMode = isSea();

  // const userDir = getUserDir();
  // const targetDir = path.join(userDir.appData,'aifrontier','server');
  // const srcDir = path.join(targetDir, 'src')

  // if(existsSync(srcDir)) {
  //   checkAndUpgradeBundle(targetDir, srcDir)
  //   return;
  // }

  ensureDirSync(srcDir)
  if(seaMode) {
    const bundleBuffer = getAsset('bundle/bundle.zip')
    await unzip(Buffer.from(bundleBuffer),srcDir)

    //解压缩配置文件
    const bundleJsonStr = getAsset('bundle/bundle.json')
    writeJson(path.join(targetDir, 'bundle.json'), convertArrayBufferToString(bundleJsonStr))

    const configJsonStr = getAsset('bundle/config.json')
    writeJson(path.join(targetDir, 'config.json'), convertArrayBufferToString(configJsonStr))

    const packageJsonStr = getAsset('bundle/package.json')
    writeJson(path.join(targetDir, 'package.json'), convertArrayBufferToString(packageJsonStr))
  } else {
    const cwd = process.cwd()
    console.log(`cwd path: ${cwd}`)
    const bundleDir = path.join(cwd,'bundle');
    const bundleBuffer = readFileSync(path.join(bundleDir,'bundle.zip'))
    await unzip(Buffer.from(bundleBuffer),srcDir)

    //解压缩配置文件
    const bundleJsonStr = readJson(path.join(bundleDir, 'bundle.json'))
    writeJson(path.join(targetDir, 'bundle.json'), JSON.stringify(bundleJsonStr))

    const configJsonStr = readJson(path.join(bundleDir, 'config.json'))
    writeJson(path.join(targetDir, 'config.json'), JSON.stringify(configJsonStr))

    const packageJsonStr = readJson(path.join(bundleDir, 'package.json'))
    writeJson(path.join(targetDir, 'package.json'), JSON.stringify(packageJsonStr))
  }

}

async function checkAndUpgradeBundle(targetDir, srcDir) {
  // if(!isSea()) {
  //   return;
  // }
  const cwd = process.cwd()
  console.log(`cwd path: ${cwd}`)
  const bundleDir = path.join(cwd,'bundle');

  const seaMode = isSea();
  const serverJson = readJson(path.join(targetDir, 'bundle.json'));
  const bundleJson = seaMode ? safeParseJson(convertArrayBufferToString(getAsset('bundle/bundle.json'))) : readJson(path.join(bundleDir, 'bundle.json'))

  if(!serverJson) {
    console.error('checkAndUpgradeBundle error')
    return;
  }

  if(serverJson.build<bundleJson.build){//Upgrade package files
    console.log(`upgrade server-ver:${serverJson.build}, bundle-ver:${bundleJson.build}`)
    //Backup agents:
    // this.setStartupState("Backup your agents...");
    if(existsSync(path.join(srcDir,"agents"))) {
      await removeDirOrFile(path.join(targetDir,"agents"));
      rename(path.join(srcDir,"agents"),path.join(targetDir,"agents"), (err) => {
        if (err) return console.error('Failed to move:', err);
        console.log('Directory moved successfully');
      });
    }
    
    //await fsp.mkdir(path.join(targetDir,"agents"), { recursive: true });
    //await copyDirWithReplace(path.join(srcDir,"agents"),path.join(targetDir,"agents"));
    
    //Backup file-hub:
    // this.setStartupState("Backup your files...");
    if(existsSync(path.join(srcDir,"filehub"))) {
      await removeDirOrFile(path.join(targetDir,"filehub"));
      rename(path.join(srcDir,"filehub"),path.join(targetDir,"filehub"), (err) => {
        if (err) return console.error('Failed to move:', err);
        console.log('Directory moved successfully');
      });
    }
    
    
    //Backup rpa-data:
    // this.setStartupState("Backup your rpa data...");
    if(existsSync(path.join(srcDir,"rpa_data_dir"))) {
      await removeDirOrFile(path.join(targetDir,"rpa_data_dir"));
      rename(path.join(srcDir,"rpa_data_dir"),path.join(targetDir,"rpa_data_dir"), (err) => {
        if (err) return console.error('Failed to move:', err);
        console.log('Directory moved successfully');
      });
    }
    
    //Remove server dir
    // this.setStartupState("Upgrading local server...");
    await removeDirOrFile(srcDir);

    //Unzip server dir:
    // this.setStartupState("Unzip new bundle files...");

    // const bundleBuffer = getAsset('bundle/bundle.zip')
    // await unzip(Buffer.from(bundleBuffer),srcDir)
    await extractBundle(targetDir, srcDir);
    
    //Copy agents folder:
    // this.setStartupState("Restore your agents...");
    await copyDirWithReplace(path.join(srcDir,"agents"),path.join(targetDir,"agents"));
    await removeDirOrFile(path.join(srcDir,"agents"));
    rename(path.join(targetDir,"agents"),path.join(srcDir,"agents"), (err) => {
      if (err) return console.error('Failed to move:', err);
      console.log('Directory moved successfully');
    });
    //await fsp.mkdir(path.join(srcDir,"agents"), { recursive: true });
    //await copyDirWithReplace(path.join(targetDir,"agents"),path.join(srcDir,"agents"));
    
    // this.setStartupState("Restore your files...");
    await removeDirOrFile(path.join(srcDir,"filehub"));
    rename(path.join(targetDir,"filehub"), path.join(srcDir,"filehub"), (err) => {
      if (err) return console.error('Failed to move:', err);
      console.log('Directory moved successfully');
    });

    // this.setStartupState("Restore your rpa data files...");
    await removeDirOrFile(path.join(srcDir,"rpa_data_dir"));
    rename(path.join(srcDir,"rpa_data_dir"), path.join(targetDir,"rpa_data_dir"), (err) => {
      if (err) return console.error('Failed to move:', err);
      console.log('Directory moved successfully');
    });

    //Ensure user-data dirs:
    ensureDirSync(path.join(srcDir,"filehub"));
    ensureDirSync(path.join(srcDir,"rpa_data_dir"));
    
    //Make frpc executable:
    // {
    //   // let platform=os.platform();
    //   let frpcName;
    //   if(isWin()){
    //     frpcName="frpc.exe";
    //   }else if(isMac()){
    //     frpcName="frpc.macos";
    //   } else if(isLinux()){
    //     if(isArm){
    //       frpcName="frpc.arm64";
    //     }else{
    //       frpcName="frpc.x86";
    //     }
    //   }
    //   let frpcPath=path.join(this.serverDir,"frpc",frpcName);
    //   if (!isWin()) {
    //     fs.chmodSync(frpcPath, 0o755); // macOS/Linux 设置可执行权限
    //   }
    // }

    //Copy package.json:
    // this.setStartupState("Copy package.json file...");
    // await copyFileToDir(path.join(this.bundleDir,"package.json"),path.join(targetDir));
    
    //Run npm install on userDataDir
    // this.setStartupState("Install node packages...");
    // await installNodePackages(targetDir);
    
    // this.setStartupState("Finishing up...");
    // await copyFileToDir(path.join(this.bundleDir,"bundle.json"),targetDir);
  }
}

async function launchFirefox(url, targetDir, srcDir) {
  const userDir = getUserDir();
  let firefoxDir = path.join(userDir.appData,'aifrontier','server', 'src');
  let firefoxExe = '';
  let args = [url]; // 将 URL 作为参数

  if(!isSea()) {
    firefoxDir = path.join(__dirname, '../bundle_data');
  }

  let webDriveApp;
  if(process.platform === 'win32') {
    firefoxExe = path.join(firefoxDir,'acefox','firefox.exe');
    webDriveApp = firefoxExe;
  } else if(process.platform === 'linux') {
    firefoxExe = path.join(firefoxDir,'Acefox-aarch64.AppImage');
    args = ['--new-window', url];
    webDriveApp = firefoxExe;
  } else if(process.platform === 'darwin') {
    firefoxExe = path.join(firefoxDir,'Acefox.app','Contents','MacOS','firefox');
    args = ['--new-window', url];
    webDriveApp = path.join(firefoxDir,'Acefox.app')
  }

  if(existsSync(firefoxExe)) {

    try {
      chmodSync(firefoxExe, '755');
    } catch (error) {
      console.log('权限设置失败:', error.message);
    }

    if(await PortChecker.isPortInUse(FIREFOX_DEBUG_PORT)) {
      FIREFOX_DEBUG_PORT = await PortChecker.findAvailablePort(FIREFOX_DEBUG_PORT+1,FIREFOX_DEBUG_PORT+100)

      if(!FIREFOX_DEBUG_PORT) {
        sendSSELog(res,`无可用RPA端口`)
        console.log(`无可用RPA端口`)
      }
    }

    args = args.concat(['-no-remote', `--remote-debugging-port=${FIREFOX_DEBUG_PORT}`])
    // 使用 spawn 而不是 execFile，更好地处理进程
    // const firefoxProcess = spawn(firefoxExe, args, {
    //   detached: false,
    //   stdio: ['ignore', 'pipe', 'pipe']
    // });

    const newEnvs = {
      WEBDRIVE_APP: webDriveApp
    }
    updateEnvFile(path.join(srcDir,'.env'), newEnvs)

    // let buffer = '';

    // firefoxProcess.stderr.on('data', data => {
    //   console.error('[firefoxProcess:stderr]', data.toString());

    //   buffer += data.toString();
    //   // 检测启动成功标志
    //   if (buffer.includes('WebDriver BiDi listening on')) {
    //     // let callback;
    //     console.log('✅ Firefox WebDriver BiDi 已启动');
    //     // waitApp=false;
    //     // this.connect().then(()=>{
    //     //   waitApp = false;
    //     //   callback = this.startCallback;
    //     //   if (callback) {
    //     //     this.startCallback = null;
    //     //     this.startCallerror = null;
    //     //   }
    //     //   callback(this.port);
    //     // });
    //   }
    // });

    // firefoxProcess.on('close', (code) => {
    //   console.log(`firefox process close all stdio with code ${code}`);
    // });

    // // firefoxProcess.unref();
    // firefoxProcess.on('exit', (code) => {
    //   console.log('Server exited with code', code);

    //   if(isWin()) {
    //     return;
    //   }
      
    //   if(aaProcess) {
    //     aaProcess.kill();
    //   }
    //   process.exit(code)
    // });

    const onFirefoxExit = (code) => {
      console.log('Server exited with code', code);

      if(isWin()) {
        return;
      }
      
      if(aaProcess) {
        aaProcess.kill();
      }
      process.exit(code)
    }
    firefoxInstance = new FirefoxLauncher(firefoxExe, url, srcDir);

    const isExist = await firefoxInstance.isAcefoxExist();
    writeLogFile(`acefox is exist ${isExist}`);
    if(isExist) {
      // Close AIFrontier
      //A copy of AIFrontier is already open. Only one copy of AIFrontier can be open at a time.
      console.log(`AIFrontier is exist`)
      
      const title = 'Close AIFrontier'
      const content = 'A copy of AIFrontier is already open. Only one copy of AIFrontier can be open at a time.'
      // await sendNotification(title, content)
      process.exit(0)
      return
    }

    const firefoxProcess = await firefoxInstance.launch({
      debugPort: FIREFOX_DEBUG_PORT,
      onExit: onFirefoxExit
    })

    // 可选：等待一段时间检查进程是否正常运行
    setTimeout(() => {
      if (firefoxProcess.exitCode !== null) {
        console.error('Acefox 启动失败');
      } else {
        console.log('Acefox 启动成功')

        // setTimeout(() => {
        //   ai2appsStart()
        // }, 10000)
      }
    }, 3000);

    // execFile(firefoxExe, [url], (error, stdout, stderr) => {
    //   if (error) {
    //     console.error(`Error launching Firefox: ${error.message}`);
    //     return;
    //   }
    //   console.log(`Firefox launched successfully.`);
    // });
  } else {
    console.error('Firefox executable not found:', firefoxExe);
  }
}

function sendSSELog(res,log) {
  res.write(`data: ${JSON.stringify({ 
      type: 'log', 
      message: log,
      timestamp: Date.now() 
    })}\n\n`);
}

let lastStep = '';
function sendSSEProgress(res,log) {
  console.log(`[sendSSEProgress] ${log}`)
  
  lastStep = log;
  res.write(`data: ${JSON.stringify({ 
      type: 'progress', 
      message: lastStep,
      timestamp: Date.now() 
  })}\n\n`);
}

async function ai2appsStart(cb, res) {
  const cwd = process.cwd()
  console.log(`cwd path: ${cwd}`)
  const bundleDir = path.join(cwd,'bundle');

  const userDir = getUserDir();
  const targetDir = path.join(userDir.appData,'aifrontier','server');
  const inAppBundleJson = isSea() ? safeParseJson(convertArrayBufferToString(getAsset('bundle/bundle.json'))) : readJson(path.join(bundleDir, 'bundle.json'))
  const bundleJson = inAppBundleJson;
  const dependenciesDir = path.join(targetDir, 'dependencies')

  if(inAppBundleJson) {
    const nodeVersion=bundleJson.node;
    const nodeEnvs = nodeInstaller.getEnvironment();
		let nodePath= nodeEnvs.nodePath; //path.join(dependenciesDir, 'node-v22.21.1-darwin-arm64', 'bin');
		console.log(`Installing node version: ${nodeVersion}`);
		// if(!nodePath) {
		// 	nodePath = await installNode(targetDir, nodeVersion, !!nodePath);
		// }
    console.log(`nodePath:${path.dirname(nodePath)}`)
		if(nodePath) {
			process.env.PATH = `${path.dirname(nodePath)}:${process.env.PATH}`;
		}

    sendSSEProgress(res, '检查并安装node依赖...')
    await installNodePackages(targetDir,nodeVersion, res);

    sendSSEProgress(res, '启动AA服务...')
    process.env.BROWSER_DEBUG_PORT = FIREFOX_DEBUG_PORT;
    process.env.BROWSER_HEADLESS = 0;

    if(await PortChecker.isPortInUse(AA_SERVICE_PORT)) {
      AA_SERVICE_PORT = await PortChecker.findAvailablePort(AA_SERVICE_PORT+1,AA_SERVICE_PORT+100)

      if(!AA_SERVICE_PORT) {
        sendSSELog(res,`无可用AA服务端口`)
        console.log(`无可用AA服务端口`)
      }
    }
    process.env.PORT = AA_SERVICE_PORT;


    try {
      const child = spawn(`${nodePath}`, [path.join(targetDir,'src',"start.js")],{cwd:path.join(targetDir,'src'),env:process.env});
      // sendSSEProgress(res, '启动AA服务 spawn...')
      child.stdout.on('data', async (data) => {
        const text = data.toString();
        console.log('[server]', text);
        sendSSELog(res, text)
        if (text.includes('READY:')) {
          console.log("Local server ready, starting AI2Apps dashboard...");

          cb && cb()
        }
      });
      
      child.stderr.on('data', (data) => {
        sendSSELog(res, data.toString())
        console.error('[server error]', data.toString());
      });
      
      child.on('exit', (code) => {
        sendSSELog(res, `aa exited with code ${code}`)
        console.log('aa exited with code', code);
      });

      aaProcess = child;
    } catch(err) {
      sendSSELog(res, `spawn aa fail:${err.message}`)
      console.error(`spawn aa fail:${err.message}`)
    }
  }
}

async function checkAndInstallSysDependencies(res) {
  const cwd = process.cwd()
  console.log(`cwd path: ${cwd}`)
  const bundleDir = path.join(cwd,'bundle');

  const userDir = getUserDir();
  const targetDir = path.join(userDir.appData,'aifrontier','server');
  const dependenciesDir = path.join(targetDir, 'dependencies')
  const inAppBundleJson = isSea() ? safeParseJson(convertArrayBufferToString(getAsset('bundle/bundle.json'))) : readJson(path.join(bundleDir, 'bundle.json'))
  const bundleJson = inAppBundleJson;
  const nodeVersion=bundleJson.node;

  ensureDirSync(dependenciesDir)

  const logger = (msg) => {
    console.log(msg);

    sendSSELog(res, msg)
  }

  try {
    sendSSEProgress(res, '检查并安装node...')
    // const nodeInstaller = new NodeInstaller();
    nodeInstaller.version = nodeVersion;
    nodeInstaller.installDir = dependenciesDir;
    nodeInstaller.logger = logger;
    await nodeInstaller.install();

    sendSSEProgress(res, '检查并安装Miniconda...')
    const condaInstaller = new MinicondaInstaller({ silent: true, logger });
    await condaInstaller.install();

    sendSSEProgress(res, '检查并安装包管理器...')
    const pmInstaller = new PackageManagerInstaller({ logger });
    await pmInstaller.install();

    sendSSEProgress(res, '检查并安装curl...')
    const curlInstaller = new CurlInstaller({ logger });
    await curlInstaller.install();

    sendSSEProgress(res, '检查并安装coreutils...')
    const coreutilsInstaller = new CoreutilsInstaller({ logger });
    await coreutilsInstaller.install();
  } catch(err) {
    console.error(`checkAndInstallSysDependencies fail`,err)
  }
}


app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello from Node.js backend!' })
})

app.get('/api/version', (req, res) => {
  res.json({appVersion: APP_VER})
})

let isProcessing = false;
let aaStarted = false;
app.get('/api/bootstrap', async (req, res) => {
  console.log(`/api/bootstrap isProcesing:${isProcessing},aaStarted:${aaStarted}`)

  if(isProcessing) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*' // 允许跨域
    });

    sendSSELog(res,"启动流程正在处理中，正在重试，请稍后再试")
    res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        message: lastStep,
        timestamp: Date.now() 
    })}\n\n`);

    res.write('event: server-closed\n');
    res.write(`data: isProcessing:${isProcessing} aaStarted:${aaStarted}, Connection will be closed\n\n`);
    res.end(); // 关闭连接
    return;
  }

  if(aaStarted) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*' // 允许跨域
    });

    res.write(`data: ${JSON.stringify({
      type: 'redirect', 
      message: `http://localhost:${AA_SERVICE_PORT}`,
      timestamp: Date.now() 
    })}\n\n`);

    return;
  }

  isProcessing = true
  aaStarted = false;

  try {
    // 发送心跳保持连接
    const heartBeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 10000);

    // 设置 SSE 相关头部
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*' // 允许跨域
    });

    // res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ 
      type: 'init', 
      message: '连接已建立',
      timestamp: Date.now() 
    })}\n\n`);

    req.on('close', () => {
      console.log('客户端断开');
      clearInterval(heartBeat);
      res.end();
    });

    sendSSEProgress(res, '检查并安装依赖中...')
    await checkAndInstallSysDependencies(res)

    await ai2appsStart(() => {
      // res.json({ url: 'http://localhost:3015' })
      aaStarted = true;
      isProcessing = false;

      res.write(`data: ${JSON.stringify({ 
        type: 'redirect', 
        message: `http://localhost:${AA_SERVICE_PORT}`,
        timestamp: Date.now() 
      })}\n\n`);
      // res.end();
    }, res);
    console.log(`ai2appsStart complete, url:http://localhost:${AA_SERVICE_PORT}`)
  } catch {
    isProcessing = false;
  }
  
})


async function startServer() {
  // Start the server
  const isInUse = await PortChecker.isPortInUse(STARTER_SERVICE_PORT)
  writeLogFile(`startServer is inuse ${isInUse}, port:${STARTER_SERVICE_PORT}`)
  if(isInUse) {
    STARTER_SERVICE_PORT = await PortChecker.findAvailablePort(STARTER_SERVICE_PORT+1,STARTER_SERVICE_PORT+100)

    if(!STARTER_SERVICE_PORT) {
      console.log('启动页无可用端口')
      throw new Error('启动页无可用端口')
    }
  }
  writeLogFile(`startServer ${isInUse}, port:${STARTER_SERVICE_PORT}`)
  app.listen(STARTER_SERVICE_PORT, async () => {
    console.log(`Server running on http://localhost:${STARTER_SERVICE_PORT}`)

    const userDir = getUserDir();
    const targetDir = path.join(userDir.appData,'aifrontier','server');
    const srcDir = path.join(targetDir, 'src')

    if(existsSync(srcDir)) {
      await checkAndUpgradeBundle(targetDir, srcDir)
    } else {
      await extractBundle(targetDir, srcDir);
    }
    
    
    const url = `http://localhost:${STARTER_SERVICE_PORT}?pin=1`;
    await launchFirefox(url, targetDir, srcDir);
  })
}

writeLogFile(`run start server`)
startServer()
