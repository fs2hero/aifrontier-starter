#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const https = require('https');
const http = require('http');
const ChocolateyInstaller = require('./choco_installer');
const HomebrewInstaller = require('./homebrew_installer');
class PackageManagerInstaller {
  constructor(options = {}) {
    this.platform = os.platform();
    this.arch = os.arch();
 
    this.logger = options.logger ? options.logger : (msg) => console.log(msg);
    this.installer = this.platform === 'win32' ? new ChocolateyInstaller(options) : new HomebrewInstaller(options)
  }

  // 主安装方法
  async install() {
    this.logger(`🚀 Starting package manager installation for ${this.platform}-${this.arch}...`);
    const success = await this.installer.install();

    if(success) {
        this.logger('✅ package manager installation success');
    } else {
        this.logger('❌ package manager installation failed');
    }
  }
}

// CLI 参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    silent: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--silent':
        options.silent = true;
        break;
      case '--help':
        showHelp();
        process.exit(0);
    }
  }
  
  return options;
}

function showHelp() {
  console.log(`
Package Manager Installer - Cross-platform package manager installation

Usage:
  node package_manager_installer.js [options]

Options:
  --silent    Silent mode (minimal output)
  --help      Show this help message

Description:
  Automatically installs the appropriate package manager for your system:
  - Windows: Chocolatey
  - macOS: Homebrew
  - Linux: Homebrew

Examples:
  # Default installation
  node package_manager_installer.js

  # Silent installation
  node package_manager_installer.js --silent
  `);
}

// 主执行函数
async function main() {
  const options = parseArgs();
  const installer = new PackageManagerInstaller(options);
  
  await installer.install();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = PackageManagerInstaller;