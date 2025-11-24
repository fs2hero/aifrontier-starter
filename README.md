# 构建步骤

## 1. 拷贝 Acefox.app 到 bundle_data 目录
## 2. 执行 npm run bundle , 生成 bundle/bundle.zip 包
## 3. 执行 npm run build, 编译前端项目（应用启动页面）
## 4. 执行 npm run config, 生成 sea-config.json 文件
## 5. 执行 npm run make，生成可执行文件 dist/aifrontier
## 6. 运行 ./dist/aifrontier，启动浏览器打开 启动页面

### 注意：目前仅在 macos 上测试通过,解压目录 ~/Library/Application\ Support/aifrontier
### node 版本 22.21.1, 如果出现 Error: Multiple occurences of sentinel "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2" found in the binary，请使用 nvm 安装的node 