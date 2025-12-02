const express = require('express')
const path = require('path')
const { fileURLToPath } = require('url');
const { spawn } = require('child_process');
const { existsSync, chmodSync, writeFileSync, readFileSync, rename } = require('fs');
const { getAsset, isSea } = require('node:sea');
const { unzip } = require('./zip.js');
const { getUserDir, ensureDirSync, isWin, copyDirWithReplace, copyFileToDir, removeDirOrFile } = require('./sys_utils.js');
const NodeInstaller = require('./node_env.js');
const MinicondaInstaller = require('./miniconda_env.js');
const PackageManagerInstaller = require('./package_manager_env.js');
const CurlInstaller = require('./curl_env.js');
const CoreutilsInstaller = require('./coreutils_env.js');

const app = express()
let aaProcess;

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
    } else {
      child = spawn("bash", ["-i", "-c", script], {
        cwd: cwd || undefined,
        env: process.env,
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

  if (isWin) {
    script = `
      npm install
    `;
  } else {
    script = `
      npm install
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
    if(['text/html','text/css','application/javascript','application/json','text/plain'].includes(contentType)) {
      assetStr = convertArrayBufferToString(assetData);
    }
    // console.log('asset data:',assetStr)
    res.setHeader('Content-Type', contentType);
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
    //Backup agents:
    // this.setStartupState("Backup your agents...");
    await removeDirOrFile(path.join(targetDir,"agents"));
    rename(path.join(srcDir,"agents"),path.join(targetDir,"agents"), (err) => {
      if (err) return console.error('Failed to move:', err);
      console.log('Directory moved successfully');
    });
    //await fsp.mkdir(path.join(targetDir,"agents"), { recursive: true });
    //await copyDirWithReplace(path.join(srcDir,"agents"),path.join(targetDir,"agents"));
    
    //Backup file-hub:
    // this.setStartupState("Backup your files...");
    await removeDirOrFile(path.join(targetDir,"filehub"));
    rename(path.join(srcDir,"filehub"),path.join(targetDir,"filehub"), (err) => {
      if (err) return console.error('Failed to move:', err);
      console.log('Directory moved successfully');
    });
    
    //Backup rpa-data:
    // this.setStartupState("Backup your rpa data...");
    await removeDirOrFile(path.join(targetDir,"rpa_data_dir"));
    rename(path.join(srcDir,"rpa_data_dir"),path.join(targetDir,"rpa_data_dir"), (err) => {
      if (err) return console.error('Failed to move:', err);
      console.log('Directory moved successfully');
    });
    
    //Remove server dir
    // this.setStartupState("Upgrading local server...");
    await removeDirOrFile(srcDir);

    //Unzip server dir:
    // this.setStartupState("Unzip new bundle files...");

    // const bundleBuffer = getAsset('bundle/bundle.zip')
    // await unzip(Buffer.from(bundleBuffer),srcDir)
    extractBundle();
    
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

async function launchFirefox(url) {
  const userDir = getUserDir();
  let firefoxDir = path.join(userDir.appData,'aifrontier','server', 'src');
  let firefoxExe = '';
  let args = [url]; // 将 URL 作为参数

  if(!isSea()) {
    firefoxDir = path.join(__dirname, '../bundle_data');
  }

  if(process.platform === 'win32') {
    firefoxExe = path.join(firefoxDir,'acefox','firefox.exe');
  } else if(process.platform === 'linux') {
    firefoxExe = path.join(firefoxDir,'Acefox-aarch64.AppImage');
    args = ['--new-window', url];
  } else if(process.platform === 'darwin') {
    firefoxExe = path.join(firefoxDir,'Acefox.app','Contents','MacOS','firefox');
    args = ['--new-window', url];
  }

  if(existsSync(firefoxExe)) {

    try {
      // chmodSync(firefoxExe, '755');
    } catch (error) {
      console.log('权限设置失败:', error.message);
    }
    // 使用 spawn 而不是 execFile，更好地处理进程
    const firefoxProcess = spawn(firefoxExe, args, {
      detached: false,
      stdio: 'ignore'
    });

    // firefoxProcess.unref();
    firefoxProcess.on('exit', (code) => {
      console.log('Server exited with code', code);

      if(isWin()) {
        return;
      }
      
      if(aaProcess) {
        aaProcess.kill();
      }
      process.exit(code)
    });

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

function sendSSEProgress(res,log) {
  console.log(`[sendSSEProgress] ${log}`)
  
  res.write(`data: ${JSON.stringify({ 
      type: 'progress', 
      message: log,
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
		let nodePath= path.join(dependenciesDir, 'node');
		console.log(`Installing node version: ${nodeVersion}`);
		// if(!nodePath) {
		// 	nodePath = await installNode(targetDir, nodeVersion, !!nodePath);
		// }
		if(nodePath) {
			process.env.PATH = `${path.dirname(nodePath)}:${process.env.PATH}`;
		}

    sendSSEProgress(res, '检查并安装node依赖...')
    await installNodePackages(targetDir,nodeVersion, res);

    sendSSEProgress(res, '启动AA服务...')
    const child = spawn("node", [path.join(targetDir,'src',"start.js")],{cwd:targetDir,env:process.env});
    child.stdout.on('data', async (data) => {
      const text = data.toString();
      console.log('[server]', text);
      if (text.includes('READY:')) {
        console.log("Local server ready, starting AI2Apps dashboard...");

        cb && cb()
      }
    });
    
    child.stderr.on('data', (data) => {
      console.error('[server error]', data.toString());
    });
    
    child.on('exit', (code) => {
      console.log('aa exited with code', code);
    });

    aaProcess = child;
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
    const nodeInstaller = new NodeInstaller();
    nodeInstaller.version = nodeVersion;
    nodeInstaller.installDir = dependenciesDir;
    nodeInstaller.logger = logger;
    await nodeInstaller.install();

    sendSSEProgress(res, '检查并安装Miniconda...')
    const condaInstaller = new MinicondaInstaller({ silent: true, logger });
    await condaInstaller.install();

    sendSSEProgress(res, '检查并安装包管理器...')
    const pmInstaller = new PackageManagerInstaller({ logger });
    // await pmInstaller.install();

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

app.get('/api/bootstrap', async (req, res) => {
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

    res.write(`data: ${JSON.stringify({ 
      type: 'redirect', 
      message: 'http://localhost:3015',
      timestamp: Date.now() 
    })}\n\n`);
    // res.end();
  }, res);
  console.log(`ai2appsStart complete`)
})

// Start the server
app.listen(3000, async () => {
  console.log('Server running on http://localhost:3000')

  const userDir = getUserDir();
  const targetDir = path.join(userDir.appData,'aifrontier','server');
  const srcDir = path.join(targetDir, 'src')

  if(existsSync(srcDir)) {
    await checkAndUpgradeBundle(targetDir, srcDir)
  } else {
    await extractBundle(targetDir, srcDir);
  }
  
  
  const url = 'http://localhost:3000';
  await launchFirefox(url);
})
