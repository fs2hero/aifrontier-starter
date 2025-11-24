#!/bin/bash
# 创建 deb 包目录结构
mkdir -p dist/out/aifrontier-1.0.0/DEBIAN
mkdir -p dist/out/aifrontier-1.0.0/usr/bin
mkdir -p dist/out/aifrontier-1.0.0/usr/share/applications
mkdir -p dist/out/aifrontier-1.0.0/usr/share/icons/hicolor/256x256/apps

# 复制可执行文件
cp dist/aifrontier dist/out/aifrontier-1.0.0/usr/bin/aifrontier

# 创建桌面文件
cat > dist/out/aifrontier-1.0.0/usr/share/applications/aifrontier.desktop << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=AIFrontier
Comment=AIFrontier application description
Exec=aifrontier
Icon=acefoxIcon
Categories=Utility;
Terminal=false
EOF

# 复制图标
cp public/assets/acefoxIcon.png dist/out/aifrontier-1.0.0/usr/share/icons/hicolor/256x256/apps/acefoxIcon.png

# 创建控制文件
cat > dist/out/aifrontier-1.0.0/DEBIAN/control << EOF
Package: aifrontier
Version: 1.0.0
Section: utils
Priority: optional
Architecture: arm64
Depends:
Maintainer: fs2hero <zhongwenxiang89@gmail.com>
Description: AIFrontier application description
 Your detailed application description goes here.
EOF

# 设置权限
chmod 755 dist/out/aifrontier-1.0.0/usr/bin/aifrontier
chmod 644 dist/out/aifrontier-1.0.0/usr/share/applications/aifrontier.desktop

# 构建 deb 包
dpkg-deb --build dist/out/aifrontier-1.0.0 dist/aifrontier-1.0.0.deb