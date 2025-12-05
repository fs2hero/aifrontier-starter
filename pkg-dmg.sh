#!/bin/bash
rm -rf "dist/out/AIFrontier.app"
rm -f "dist/AIFrontier-1.0.0.dmg"

mkdir -p "dist/out/AIFrontier.app/Contents/MacOS"
mkdir -p "dist/out/AIFrontier.app/Contents/Resources"

# 复制 SEA 可执行文件
cp dist/aifrontier "dist/out/AIFrontier.app/Contents/MacOS/aifrontier"
cp public/assets/icon.icns "dist/out/AIFrontier.app/Contents/Resources"

# 创建 Info.plist
cat > "dist/out/AIFrontier.app/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>AIFrontier</string>
    <key>CFBundleDisplayName</key>
    <string>AIFrontier</string>
    <key>CFBundleIdentifier</key>
    <string>cn.ai2apps.aifrontier</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>AI2APP</string>
    <key>CFBundleExecutable</key>
    <string>aifrontier</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
</dict>
</plist>
EOF

# 生成 DMG
npx appdmg dmg-config.json dist/AIFrontier-1.0.0.dmg