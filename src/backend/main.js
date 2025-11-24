const express = require('express')
const path = require('path')
const { fileURLToPath } = require('url');
const { spawn } = require('child_process');
const { existsSync, chmodSync, writeFileSync, readFileSync } = require('fs');
const { getAsset, isSea } = require('node:sea');
const { unzip } = require('./zip.js')
const { getUserDir, ensureDirSync } = require('./sys_utils.js')

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

async function getNodePath(userDataDir,v){
	let nodePath;
	const nodePathCache = path.join(userDataDir, `.nvm_node_path_${v}`);
	if (!existsSync(nodePathCache)) {
		return null;
	}
	nodePath = readFileSync(nodePathCache, 'utf8').trim();
	if (!existsSync(nodePath)){
		return null;
	}
	return nodePath;
}

async function installNode(userDataDir,v,install=true){
	let nodePath;
	const nodePathCache = path.join(userDataDir, `.nvm_node_path_${v}`);
	let shellScript;
	if(install) {
		shellScript = `
      unset npm_config_prefix
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      nvm install ${v}
      nvm use ${v}
      which node
    `;
	}else{
		shellScript = `
      unset npm_config_prefix
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      nvm use ${v}
      which node
    `;
	}
	try {
		let result=await runBashScript(shellScript);
		nodePath = result.trimEnd().split('\n').at(-1);
		writeFileSync(nodePathCache, nodePath);
	}catch(err){
		console.error("Get node path error:");
		console.error(err);
		return null;
	}
	console.log(`[NVM] 缓存 node 路径: ${nodePath}`);
	return nodePath;
}

//---------------------------------------------------------------------------
async function installNodePackages(userDataDir,nodeVersion){
	const shellScript = `
      unset npm_config_prefix
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      nvm use ${nodeVersion}
	  npm install
	`;
	try {
		await runBashScript(shellScript,userDataDir);
		return true;
	}catch(err){
		return false;
	}
}

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


async function extractBundle() {
  if(!isSea()) {
    return;
  }

  const userDir = getUserDir();
  const targetDir = path.join(userDir.appData,'aifrontier','server');

  if(existsSync(targetDir)) {
    return;
  }

  ensureDirSync(targetDir);
  const bundleBuffer = getAsset('bundle/bundle.zip')
  await unzip(Buffer.from(bundleBuffer),targetDir)
}

async function launchFirefox(url) {
  const userDir = getUserDir();
  let firefoxDir = path.join(userDir.appData,'aifrontier','server');
  let firefoxExe = '';
  let args = [url]; // 将 URL 作为参数

  if(!isSea()) {
    firefoxDir = path.join(__dirname, '../bundle_data');
  }

  if(process.platform === 'win32') {
    firefoxExe = path.join(firefoxDir,'firefox.exe');
  } else if(process.platform === 'linux') {
    firefoxExe = path.join(firefoxDir,'Acefox.appImage');
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
      // detached: true,
      // stdio: 'ignore'
    });

    // firefoxProcess.unref();
    firefoxProcess.on('exit', (code) => {
      console.log('Server exited with code', code);

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

async function ai2appsStart(cb) {
  const userDir = getUserDir();
  const targetDir = path.join(userDir.appData,'aifrontier','server');
  const inAppBundleJson = convertArrayBufferToString(getAsset('bundle/bundle.json'))
  if(inAppBundleJson) {
    const bundleJson = JSON.parse(inAppBundleJson);

    const nodeVersion=bundleJson.node;
		let nodePath=await getNodePath(targetDir,nodeVersion);
		console.log(`Installing node version: ${nodeVersion}`);
		if(!nodePath) {
			nodePath = await installNode(targetDir, nodeVersion, !!nodePath);
		}
		if(nodePath) {
			process.env.PATH = `${path.dirname(nodePath)}:${process.env.PATH}`;
		}

    await installNodePackages(targetDir,nodeVersion);

    const child = spawn("node", [path.join(targetDir,"start.js")],{cwd:targetDir,env:process.env});
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


app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello from Node.js backend!' })
})

app.get('/api/bootstrap', async (req, res) => {
  await ai2appsStart(() => {
    res.json({ url: 'http://localhost:3015' })
  });
  console.log(`ai2appsStart complete`)
})

// Start the server
app.listen(3000, async () => {
  console.log('Server running on http://localhost:3000')

  await extractBundle();
  
  const url = 'http://localhost:3000';
  await launchFirefox(url);
})
