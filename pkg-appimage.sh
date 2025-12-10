#!/bin/bash

# 文件名：pkg-appimage.sh
# 用途：将单可执行文件打包成 AppImage
# 使用方法：./pkg-appimage.sh [版本号]

set -e  # 遇到错误时退出脚本

# 配置变量
APP_NAME="aifrontier"
APP_DIR="./dist/AppDir"  # 临时构建目录
EXECUTABLE_SRC="./dist/aifrontier"
ICON_SRC="./public/assets/icon.png"  # 图标文件路径
DESKTOP_FILE="./${APP_NAME}.desktop"  # 桌面文件路径
VERSION="${1:-1.0.0}"  # 从参数获取版本号，默认为1.0.0
TOOL_BASE_URL="https://github.com/AppImage/appimagetool/releases/download/continuous/"
OUT_DIR="./dist"

# 检测系统架构
detect_architecture() {
    local arch=$(uname -m)
    case "$arch" in
        x86_64)
            ARCH="x86_64"
            ARCH_SUFFIX="x86_64"
            ;;
        aarch64|arm64)
            ARCH="aarch64"
            ARCH_SUFFIX="aarch64"
            ;;
        armv7l|armv6l)
            ARCH="armhf"
            ARCH_SUFFIX="armhf"
            ;;
        i686|i386)
            ARCH="i686"
            ARCH_SUFFIX="i686"
            ;;
        *)
            echo "不支持的架构: $arch"
            exit 1
            ;;
    esac
    
    echo "检测到系统架构: $arch ($ARCH)"
}

# 检查 mksquashfs 支持的压缩算法
check_mksquashfs() {
    echo "检查 mksquashfs 支持的压缩算法..."
    
    if ! command -v mksquashfs &> /dev/null; then
        echo "⚠️  警告: mksquashfs 未安装"
        echo "尝试使用系统包管理器安装..."
        
        # 尝试检测包管理器并安装
        if command -v apt-get &> /dev/null; then
            echo "检测到 apt，尝试安装 squashfs-tools..."
            sudo apt-get update && sudo apt-get install -y squashfs-tools
        elif command -v yum &> /dev/null; then
            echo "检测到 yum，尝试安装 squashfs-tools..."
            sudo yum install -y squashfs-tools
        elif command -v dnf &> /dev/null; then
            echo "检测到 dnf，尝试安装 squashfs-tools..."
            sudo dnf install -y squashfs-tools
        elif command -v pacman &> /dev/null; then
            echo "检测到 pacman，尝试安装 squashfs-tools..."
            sudo pacman -Sy squashfs-tools
        elif command -v zypper &> /dev/null; then
            echo "检测到 zypper，尝试安装 squashfs-tools..."
            sudo zypper install -y squashfs-tools
        else
            echo "❌ 无法自动安装 mksquashfs，请手动安装 squashfs-tools"
            echo "Ubuntu/Debian: sudo apt-get install squashfs-tools"
            echo "Fedora/RHEL: sudo dnf install squashfs-tools"
            echo "Arch: sudo pacman -S squashfs-tools"
            exit 1
        fi
    fi
    
    # 检查 mksquashfs 版本和支持的压缩算法
    if mksquashfs -version 2>&1 | grep -q "version"; then
        echo "✅ mksquashfs 已安装"
        # 显示版本信息
        mksquashfs -version | head -1
    fi
    
    # 检查支持的压缩算法
    echo "检查支持的压缩算法..."
    if mksquashfs -help 2>&1 | grep -q "zstd"; then
        COMPRESSOR="zstd"
        echo "✅ 支持 zstd 压缩"
    elif mksquashfs -help 2>&1 | grep -q "gzip"; then
        COMPRESSOR="gzip"
        echo "✅ 支持 gzip 压缩"
    elif mksquashfs -help 2>&1 | grep -q "xz"; then
        COMPRESSOR="xz"
        echo "✅ 支持 xz 压缩"
    elif mksquashfs -help 2>&1 | grep -q "lzo"; then
        COMPRESSOR="lzo"
        echo "✅ 支持 lzo 压缩"
    else
        COMPRESSOR="zstd"  # 默认使用 zstd
        echo "⚠️  无法检测支持的压缩算法，使用默认: $COMPRESSOR"
    fi
    
    echo "将使用压缩算法: $COMPRESSOR"
}

# 检查依赖
check_dependencies() {
    local missing_deps=()
    
    # 检查所需命令是否存在
    for cmd in wget; do
        if ! command -v $cmd &> /dev/null; then
            missing_deps+=($cmd)
        fi
    done
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo "错误: 缺少以下依赖: ${missing_deps[*]}"
        echo "请安装它们后重试。"
        exit 1
    fi
    
    # 检查 mksquashfs
    check_mksquashfs
}

# 下载 AppImage 工具
download_appimagetool() {
    # 根据架构选择正确的工具
    local TOOL_NAME="appimagetool-${ARCH_SUFFIX}.AppImage"
    local TOOL_URL=""
    
    case "$ARCH" in
        x86_64)
            TOOL_URL="${TOOL_BASE_URL}appimagetool-x86_64.AppImage"
            ;;
        aarch64)
            TOOL_URL="${TOOL_BASE_URL}appimagetool-aarch64.AppImage"
            ;;
        armhf)
            TOOL_URL="${TOOL_BASE_URL}appimagetool-armhf.AppImage"
            ;;
        i686)
            TOOL_URL="${TOOL_BASE_URL}appimagetool-i686.AppImage"
            ;;
        *)
            echo "错误: 不支持的架构: $ARCH"
            exit 1
            ;;
    esac
    
    echo "正在下载 appimagetool (${ARCH})..."
    
    if [ ! -f "$TOOL_NAME" ]; then
        echo "从 $TOOL_URL 下载..."
        wget -q --show-progress "$TOOL_URL" -O "$TOOL_NAME"
        
        if [ $? -ne 0 ]; then
            echo "错误: 下载失败"
            echo "请检查网络连接或手动下载工具"
            exit 1
        fi
        
        chmod +x "$TOOL_NAME"
        echo "✅ appimagetool 下载完成: $TOOL_NAME"
    else
        echo "✅ appimagetool 已存在: $TOOL_NAME"
    fi
    
    # 设置工具变量供后续使用
    APPIMAGETOOL="./$TOOL_NAME"
}

# 创建桌面文件
create_desktop_file() {
    echo "创建桌面文件..."
    
    cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=AI Frontier
GenericName=AI Frontier Application
Comment=AI Frontier Desktop Application
Exec=AppRun
Icon=${APP_NAME}
Terminal=false
Categories=Utility;Development;
StartupNotify=true
StartupWMClass=${APP_NAME}
X-AppImage-Version=${VERSION}
EOF
}

# 创建 AppRun 文件
create_apprun() {
    echo "创建 AppRun..."
    
    cat > "$APP_DIR/AppRun" << 'EOF'
#!/bin/bash

# 获取脚本所在目录
HERE="$(dirname "$(readlink -f "${0}")")"

# 设置环境变量
export PATH="${HERE}/usr/bin:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH}"

# 设置 XDG 数据目录
export XDG_DATA_DIRS="${HERE}/usr/share:${XDG_DATA_DIRS}"

# 运行主程序
exec "${HERE}/usr/bin/aifrontier" "$@"
EOF
    
    chmod +x "$APP_DIR/AppRun"
}

# 创建图标和桌面缓存
create_icon_cache() {
    echo "创建图标缓存..."
    
    # 创建图标主题目录结构
    mkdir -p "$APP_DIR/usr/share/icons/hicolor"
    
    # 如果图标存在，复制到所有标准尺寸
    if [ -f "$ICON_SRC" ]; then
        echo "使用自定义图标: $ICON_SRC"
        
        # 支持的图标尺寸
        local icon_sizes="16x16 32x32 48x48 64x64 128x128 256x256"
        
        for size in $icon_sizes; do
            local icon_dir="$APP_DIR/usr/share/icons/hicolor/${size}/apps"
            mkdir -p "$icon_dir"
            
            # 复制原始图标并调整大小（如果有convert命令）
            if command -v convert &> /dev/null; then
                echo "调整图标大小: $size"
                convert "$ICON_SRC" -resize "$size" "$icon_dir/${APP_NAME}.png"
            else
                # 如果没有imagemagick，直接复制
                cp "$ICON_SRC" "$icon_dir/${APP_NAME}.png"
                echo "复制图标到: $icon_dir/${APP_NAME}.png"
            fi
        done
        
        # 复制主要图标（256x256）到根目录
        cp "$ICON_SRC" "$APP_DIR/${APP_NAME}.png"
        echo "✅ 图标已复制到根目录"
        
        # 创建图标主题索引
        cat > "$APP_DIR/usr/share/icons/hicolor/index.theme" << EOF
[Icon Theme]
Name=Hicolor
Comment=Fallback icon theme
Directories=16x16/apps,32x32/apps,48x48/apps,64x64/apps,128x128/apps,256x256/apps

[16x16/apps]
Size=16
Context=Applications
Type=Fixed

[32x32/apps]
Size=32
Context=Applications
Type=Fixed

[48x48/apps]
Size=48
Context=Applications
Type=Fixed

[64x64/apps]
Size=64
Context=Applications
Type=Fixed

[128x128/apps]
Size=128
Context=Applications
Type=Fixed

[256x256/apps]
Size=256
Context=Applications
Type=Fixed
EOF
        
        echo "✅ 图标缓存已创建"
    else
        echo "⚠️  警告: 未找到图标文件 $ICON_SRC"
        echo "创建默认图标..."
        
        # 创建所有标准尺寸的默认图标
        local icon_sizes="16x16 32x32 48x48 64x64 128x128 256x256"
        
        for size in $icon_sizes; do
            local icon_dir="$APP_DIR/usr/share/icons/hicolor/${size}/apps"
            mkdir -p "$icon_dir"
            
            if command -v convert &> /dev/null; then
                local pointsize=$(( $(echo $size | cut -dx -f1) / 4 ))
                convert -size "$size" xc:#4A90E2 -fill white -pointsize $pointsize \
                        -gravity center -draw "text 0,0 'AI'" "$icon_dir/${APP_NAME}.png"
            fi
        done
        
        # 创建根目录图标
        if command -v convert &> /dev/null; then
            convert -size "256x256" xc:#4A90E2 -fill white -pointsize 48 \
                    -gravity center -draw "text 0,0 'AI'" "$APP_DIR/${APP_NAME}.png"
        else
            echo "⚠️  ImageMagick 未安装，无法创建默认图标"
            echo "请安装 ImageMagick 或提供自定义图标"
        fi
        
        echo "⚠️  默认图标已创建，建议提供自定义图标"
    fi
}

# 准备 AppDir 目录结构
prepare_appdir() {
    echo "准备 AppDir 目录结构..."
    
    # 清理旧的目录
    if [ -d "$APP_DIR" ]; then
        echo "清理旧的 AppDir..."
        rm -rf "$APP_DIR"
    fi
    
    # 创建基础目录结构
    mkdir -p "$APP_DIR/usr/bin"
    mkdir -p "$APP_DIR/usr/share/applications"
    
    # 复制可执行文件
    echo "复制可执行文件..."
    if [ -f "$EXECUTABLE_SRC" ]; then
        cp "$EXECUTABLE_SRC" "$APP_DIR/usr/bin/$APP_NAME"
        chmod +x "$APP_DIR/usr/bin/$APP_NAME"
        echo "✅ 可执行文件已复制: $APP_DIR/usr/bin/$APP_NAME"
        
        # 验证可执行文件
        if [ -x "$APP_DIR/usr/bin/$APP_NAME" ]; then
            echo "✅ 可执行文件权限正确"
        else
            echo "❌ 可执行文件权限不正确"
            chmod +x "$APP_DIR/usr/bin/$APP_NAME"
        fi
    else
        echo "❌ 错误: 找不到可执行文件: $EXECUTABLE_SRC"
        echo "当前路径: $(pwd)"
        echo "请先运行构建命令"
        exit 1
    fi
    
    # 创建图标缓存
    create_icon_cache
    
    # 复制桌面文件
    echo "创建桌面文件..."
    create_desktop_file
    cp "$DESKTOP_FILE" "$APP_DIR/usr/share/applications/"
    cp "$DESKTOP_FILE" "$APP_DIR/"
    echo "✅ 桌面文件已创建并复制"
    
    # 创建 AppRun
    create_apprun
    
    # 显示 AppDir 结构
    echo "📁 AppDir 结构:"
    tree "$APP_DIR" -L 3 2>/dev/null || find "$APP_DIR" -type f | head -20
}

# 创建 AppImage
create_appimage() {
    local OUTPUT_FILE="${OUT_DIR}/${APP_NAME}-${VERSION}-${ARCH_SUFFIX}.AppImage"
    
    # 确保输出目录存在
    mkdir -p "$OUT_DIR"
    
    # 删除已存在的文件
    if [ -f "$OUTPUT_FILE" ]; then
        echo "删除已存在的文件: $OUTPUT_FILE"
        rm -f "$OUTPUT_FILE"
    fi
    
    echo "创建 AppImage: $OUTPUT_FILE"
    echo "使用工具: $APPIMAGETOOL"
    echo "压缩算法: $COMPRESSOR"
    
    # 使用 appimagetool 打包
    echo "正在打包..."
    
    # 设置环境变量
    export ARCH="$ARCH_SUFFIX"
    export VERSION="$VERSION"
    
    # 构建 appimagetool 命令
    local APPIMAGETOOL_CMD="$APPIMAGETOOL"
    local APPIMAGETOOL_ARGS=""
    
    # 检查 appimagetool 是否需要 --appimage-extract-and-run
    if "$APPIMAGETOOL" --help 2>&1 | grep -q "appimage-extract-and-run"; then
        APPIMAGETOOL_ARGS="$APPIMAGETOOL_ARGS --appimage-extract-and-run"
    fi
    
    # 根据检测到的压缩算法添加参数
    if [ "$COMPRESSOR" = "zstd" ]; then
        APPIMAGETOOL_ARGS="$APPIMAGETOOL_ARGS --comp zstd"
    elif [ "$COMPRESSOR" = "gzip" ]; then
        APPIMAGETOOL_ARGS="$APPIMAGETOOL_ARGS --comp gzip"
    elif [ "$COMPRESSOR" = "xz" ]; then
        APPIMAGETOOL_ARGS="$APPIMAGETOOL_ARGS --comp xz"
    elif [ "$COMPRESSOR" = "lzo" ]; then
        APPIMAGETOOL_ARGS="$APPIMAGETOOL_ARGS --comp lzo"
    fi
    
    # 添加其他参数
    APPIMAGETOOL_ARGS="$APPIMAGETOOL_ARGS --no-appstream"
    
    # 执行打包命令
    echo "执行命令: $APPIMAGETOOL_CMD $APPIMAGETOOL_ARGS \"$APP_DIR\" \"$OUTPUT_FILE\""
    
    "$APPIMAGETOOL_CMD" $APPIMAGETOOL_ARGS "$APP_DIR" "$OUTPUT_FILE"
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ AppImage 创建成功: $OUTPUT_FILE"
        
        # 设置执行权限
        chmod +x "$OUTPUT_FILE"
        
        # 显示文件信息
        echo "📦 文件信息:"
        ls -lh "$OUTPUT_FILE"
        
        # 验证文件
        echo "🔍 验证 AppImage..."
        if file "$OUTPUT_FILE" | grep -q "AppImage"; then
            echo "✅ AppImage 文件格式正确"
        else
            echo "⚠️  警告: 文件格式可能不正确"
            file "$OUTPUT_FILE"
        fi
    else
        echo "❌ AppImage 创建失败，退出码: $exit_code"
        
        # 尝试其他压缩算法
        if [ "$COMPRESSOR" = "gzip" ]; then
            echo "尝试使用 zstd 压缩算法..."
            "$APPIMAGETOOL_CMD" --appimage-extract-and-run --comp zstd --no-appstream "$APP_DIR" "$OUTPUT_FILE"
            
            if [ $? -eq 0 ]; then
                echo "✅ 使用 zstd 压缩成功"
                chmod +x "$OUTPUT_FILE"
                ls -lh "$OUTPUT_FILE"
            else
                echo "❌ 所有压缩算法都失败"
                exit 1
            fi
        fi
    fi
}

# 测试 AppImage（可选）
test_appimage() {
    local OUTPUT_FILE="${OUT_DIR}/${APP_NAME}-${VERSION}-${ARCH_SUFFIX}.AppImage"
    
    if [ ! -f "$OUTPUT_FILE" ]; then
        echo "❌ 错误: 找不到 AppImage 文件: $OUTPUT_FILE"
        return 1
    fi
    
    echo "🧪 测试 AppImage..."
    
    # 检查文件权限
    if [ ! -x "$OUTPUT_FILE" ]; then
        echo "⚠️  警告: AppImage 没有执行权限"
        chmod +x "$OUTPUT_FILE"
    fi
    
    # 检查文件类型
    echo "文件类型:"
    file "$OUTPUT_FILE"
    
    # 简单测试提取
    echo "快速测试..."
    timeout 10 "$OUTPUT_FILE" --appimage-help 2>&1 | head -5
    
    echo "✅ 测试完成"
}

# 清理临时文件
cleanup() {
    echo "清理临时文件..."
    
    # 删除临时目录
    if [ -d "$APP_DIR" ]; then
        rm -rf "$APP_DIR"
        echo "✅ 临时目录已清理"
    fi
    
    # 删除临时桌面文件
    if [ -f "$DESKTOP_FILE" ]; then
        rm "$DESKTOP_FILE"
        echo "✅ 桌面文件已清理"
    fi
}

# 显示系统信息
show_system_info() {
    echo "系统信息:"
    echo "  OS: $(uname -s)"
    echo "  架构: $(uname -m)"
    echo "  内核: $(uname -r)"
    echo "  桌面环境: $XDG_CURRENT_DESKTOP"
    if command -v lsb_release &> /dev/null; then
        echo "  发行版: $(lsb_release -ds)"
    fi
}

# 显示帮助信息
show_help() {
    echo "使用方法: $0 [选项] [版本号]"
    echo ""
    echo "将 ./dist/aifrontier 打包成 AppImage"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -i, --info     显示系统信息"
    echo "  -t, --test     创建后测试 AppImage"
    echo "  --no-cleanup   不清理临时文件（用于调试）"
    echo ""
    echo "参数:"
    echo "  版本号         设置 AppImage 版本 (默认: 1.0.0)"
    echo ""
    echo "图标要求:"
    echo "  推荐提供 ./public/assets/icon.png (至少 256x256)"
    echo "  支持 PNG 格式"
    echo ""
    echo "示例:"
    echo "  $0                    # 使用默认版本 1.0.0"
    echo "  $0 2.1.0              # 使用版本 2.1.0"
    echo "  $0 --info             # 显示系统信息"
    echo "  $0 --test 1.5.0       # 打包并测试"
}

# 主函数
main() {
    local TEST_APPIMAGE=false
    local NO_CLEANUP=false
    
    # 解析选项
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -i|--info)
                show_system_info
                exit 0
                ;;
            -t|--test)
                TEST_APPIMAGE=true
                shift
                ;;
            --no-cleanup)
                NO_CLEANUP=true
                shift
                ;;
            -*)
                echo "未知选项: $1"
                show_help
                exit 1
                ;;
            *)
                VERSION="$1"
                shift
                ;;
        esac
    done
    
    echo "🚀 开始打包 $APP_NAME v$VERSION 为 AppImage"
    echo "=========================================="
    
    # 显示系统信息
    show_system_info
    echo ""
    
    # 检测架构
    detect_architecture
    
    # 检查源文件是否存在
    if [ ! -f "$EXECUTABLE_SRC" ]; then
        echo "❌ 错误: 找不到可执行文件: $EXECUTABLE_SRC"
        echo "请先构建项目或检查文件路径。"
        echo "当前目录: $(pwd)"
        exit 1
    fi
    
    # 检查依赖
    check_dependencies
    
    # 下载工具
    download_appimagetool
    
    # 准备目录
    prepare_appdir
    
    # 创建 AppImage
    create_appimage
    
    # 测试 AppImage（如果启用）
    if [ "$TEST_APPIMAGE" = true ]; then
        test_appimage
    fi
    
    # 清理（如果不跳过）
    if [ "$NO_CLEANUP" = false ]; then
        cleanup
    else
        echo "⚠️  跳过清理，临时文件保留在 $APP_DIR"
    fi
    
    local OUTPUT_FILE="${OUT_DIR}/${APP_NAME}-${VERSION}-${ARCH_SUFFIX}.AppImage"
    echo ""
    echo "🎉 所有操作完成！"
    echo "📝 生成的 AppImage: ${OUTPUT_FILE}"
    echo ""
    echo "💡 使用提示:"
    echo "  1. 运行: chmod +x '${OUTPUT_FILE}' && '${OUTPUT_FILE}'"
    echo "  2. 安装到系统: '${OUTPUT_FILE}' --install"
    echo "  3. 提取内容: '${OUTPUT_FILE}' --appimage-extract"
    echo ""
    echo "🔧 压缩算法: $COMPRESSOR"
}

# 运行主函数
main "$@"