import { readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function collectAssets(dir, tag='build', baseDir = dir) {
  const assets = {};
  
  function traverse(currentDir) {
    const files = readdirSync(currentDir);
    
    for (const file of files) {
      const fullPath = join(currentDir, file);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else {
        // 计算相对路径作为 blob 中的键
        const relativePath = relative(baseDir, fullPath);
        assets[`${tag}/${relativePath}`] = `${fullPath}`;
      }
    }
  }
  
  traverse(dir);
  return assets;
}

// 收集 build 目录下的所有文件
const bootAssets = collectAssets(join(__dirname, 'build'));
const bundleAssets = collectAssets(join(__dirname, 'bundle'),'bundle')

// 生成 sea-config.json
const seaConfig = {
  main: "dist/index.js",
  output: "dist/sea-prep.blob",
  assets: {...bootAssets, ...bundleAssets},
  disableExperimentalSEAWarning: true
};

console.log(JSON.stringify(seaConfig, null, 2));
writeFileSync('./sea-config.json',JSON.stringify(seaConfig, null, 2))