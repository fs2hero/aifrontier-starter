const yauzl = require('yauzl');
const path = require('path');
const fs = require('fs');
const { execSync } = require('node:child_process')
const { ensureDirSync } = require('./sys_utils.js');


function fixFilePermissions(filePath, fileName) {
  try {
    // 对可执行文件设置执行权限
    if (fileName.match(/(firefox|plugin-container|.*\.so|.*\.dylib)$/i) || 
        fileName.includes('Contents/MacOS/')) {
      fs.chmodSync(filePath, 0o755);
    } else if (fileName.match(/\.sh$|\.command$/i)) {
      fs.chmodSync(filePath, 0o755);
    } else {
      // 普通文件
      fs.chmodSync(filePath, 0o644);
    }
  } catch (error) {
    console.warn(`无法设置权限 ${filePath}:`, error.message);
  }
}

function fixCriticalFirefoxFiles(targetDir) {
  const criticalFiles = [
    'Acefox.app/Contents/MacOS/firefox',
    'Acefox.app/Contents/MacOS/plugin-container',
    'Acefox.app/Contents/MacOS/crashreporter',
    'Acefox.app/Contents/MacOS/updater'
  ];
  
  criticalFiles.forEach(relativePath => {
    const filePath = path.join(targetDir, relativePath);
    if (fs.existsSync(filePath)) {
      try {
        fs.chmodSync(filePath, 0o755);
        console.log(`修复权限: ${relativePath}`);
      } catch (error) {
        console.error(`无法修复 ${relativePath}:`, error.message);
      }
    }
  });
  
  // 修复整个 MacOS 目录的权限
  const macosDir = path.join(targetDir, 'Acefox.app/Contents/MacOS');
  if (fs.existsSync(macosDir)) {
    try {
      execSync(`chmod -R 755 "${macosDir}"`);
    } catch (error) {
      console.warn('批量修复权限失败:', error.message);
    }
  }
}
async function unzip(zipBuffer, targetDir) {
	return new Promise((resolve, reject) => {
		yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
			if (err) return reject(err);
			
			zipfile.readEntry();
			
			zipfile.on('entry', entry => {
				const entryPath = path.join(targetDir, entry.fileName);
				
				if (/\/$/.test(entry.fileName)) {
					ensureDirSync(entryPath);
					zipfile.readEntry();
				} else {
					ensureDirSync(path.dirname(entryPath));
					zipfile.openReadStream(entry, (err, readStream) => {
						if (err) return reject(err);
						const writeStream = fs.createWriteStream(entryPath);
						readStream.pipe(writeStream);
						writeStream.on('close', () => {
							fixFilePermissions(entryPath, entry.fileName);
							zipfile.readEntry()
						});
					});
				}
			});
			
			zipfile.on('end', () => {
				fixCriticalFirefoxFiles(targetDir);
				
				resolve()
			});
			zipfile.on('error', reject);
		});
	});
}

module.exports = { unzip };