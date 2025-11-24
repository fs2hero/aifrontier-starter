const express = require('express')
const path = require('path')
const { fileURLToPath } = require('url');
const { spawn } = require('child_process');
const { existsSync, chmodSync } = require('fs');
const { getAsset, isSea } = require('node:sea');
const { unzip } = require('./zip.js')
const { getUserDir, ensureDirSync } = require('./sys_utils.js')

const app = express()

// Serve the Vue frontend
// app.use(express.static(path.join(__dirname, '../build')))
// 统一的静态文件服务
app.use((req, res, next) => {
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
    // 方法1: 使用TextDecoder（推荐）
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
      chmodSync(firefoxExe, '755');
    } catch (error) {
      console.log('权限设置失败:', error.message);
    }
    // 使用 spawn 而不是 execFile，更好地处理进程
    const firefoxProcess = spawn(firefoxExe, args, {
      detached: true,
      stdio: 'ignore'
    });

    firefoxProcess.unref();

    // 可选：等待一段时间检查进程是否正常运行
    setTimeout(() => {
      if (firefoxProcess.exitCode !== null) {
        console.error('Acefox 启动失败');
      } else {
        console.log('Acefox 启动成功')
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


app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello from Node.js backend!' })
})

// Start the server
app.listen(3000, async () => {
  console.log('Server running on http://localhost:3000')

  await extractBundle();
  
  const url = 'http://localhost:3000';
  await launchFirefox(url);
})
