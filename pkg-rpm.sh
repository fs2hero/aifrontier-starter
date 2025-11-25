#!/bin/bash
# 创建 RPM 构建目录
mkdir -p ~/rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

# 准备源码
# mkdir -p yourapp-1.0.0/usr/bin
# mkdir -p yourapp-1.0.0/usr/share/applications
# mkdir -p yourapp-1.0.0/usr/share/icons/hicolor/256x256/apps

# cp your-sea-executable yourapp-1.0.0/usr/bin/yourapp
# cp icon.png yourapp-1.0.0/usr/share/icons/hicolor/256x256/apps/yourapp.png

# 创建桌面文件（同上）
# cat > yourapp-1.0.0/usr/share/applications/yourapp.desktop << EOF
# [Desktop Entry]
# Version=1.0
# Type=Application
# Name=YourApp
# Comment=Your application description
# Exec=yourapp
# Icon=yourapp
# Categories=Utility;
# Terminal=false
# StartupWMClass=YourApp
# EOF

# 创建 tarball
cd dist/out
tar -czf ~/rpmbuild/SOURCES/aifrontier-1.0.0.tar.gz --exclude=DEBIAN aifrontier-1.0.0/
cd -

# 创建 spec 文件
cat > ~/rpmbuild/SPECS/aifrontier.spec << EOF
Name: AIFrontier
Version: 1.0.0
Release: 1%{?dist}
Summary: AIFrontier application description

License: MIT
URL: https://ai2apps.com
Source0: aifrontier-1.0.0.tar.gz

BuildArch: aarch64

# 关键：禁用 note 段处理
%global __brp_strip_comment_note %{nil}
%global __os_install_post %{nil}

%description
Your detailed application description goes here.

%prep
%autosetup -n aifrontier-1.0.0

%build
export CFLAGS="$CFLAGS -g0"
export CXXFLAGS="$CXXFLAGS -g0"


%install
rm -rf %{buildroot}
mkdir -p %{buildroot}

cp -r * %{buildroot}

find %{buildroot} -type f -name "aifrontier" -exec chmod 755 {} \;

%files
/usr/bin/aifrontier
/usr/share/applications/aifrontier.desktop
/usr/share/icons/hicolor/256x256/apps/acefoxIcon.png

%changelog
* Tue Nov 25 2025 fs2hero <zhongwenxiang89@gmail.com> - 1.0.0-1
- Initial package
EOF

# 构建 RPM
# rpmbuild -ba --define "_rpmdir ./dist" ~/rpmbuild/SPECS/aifrontier.spec
rpmbuild -ba \
  --define "__brp_strip_comment_note %{nil}" \
  --define "__brp_strip %{nil}" \
  --define "__brp_strip_static_archive %{nil}" \
  --define "_rpmdir ./dist" \
  ~/rpmbuild/SPECS/aifrontier.spec