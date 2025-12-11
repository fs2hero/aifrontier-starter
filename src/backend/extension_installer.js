const path = require('path');
const fs = require('fs');
const fsExtra = require('fs-extra');
const archiver = require('archiver');

class ExtensionInstaller {
    constructor(options = {}) {
        // 扩展路径
        this.extensionPath = options.extensionPath;
        this.profilePath = options.profilePath;
        this.xpiPath = options.xpiPath;

        console.log(``)
    }

    // 安装扩展
    async installExtension() {
        // 打包扩展
        const xpiPath = this.xpiPath ? this.xpiPath : await this.packageExtension();

        // 创建扩展目录
        const extensionsDir = path.join(this.profilePath, 'extensions');
        if (!fs.existsSync(extensionsDir)) {
            fs.mkdirSync(extensionsDir, { recursive: true });
        }

        // 从 manifest.json 获取扩展 ID
        let extensionId;

        if(this.extensionPath) {
            const manifestPath = path.join(this.extensionPath, 'manifest.json');
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            extensionId = manifest.browser_specific_settings?.gecko?.id ||
                manifest.applications?.gecko?.id;

            if (!extensionId) {
                console.error('扩展 manifest.json 中没有找到扩展 ID');
                // 创建默认扩展ID
                const defaultId = 'auto-pin@ai2apps.cn';
                console.log(`使用默认扩展ID: ${defaultId}`);
                // 更新 manifest.json
                manifest.browser_specific_settings = {
                    gecko: {
                        id: defaultId,
                        strict_min_version: "57.0"
                    }
                };
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
                console.log('已更新 manifest.json 添加扩展ID');
            }
        }
        

        const finalExtensionId = extensionId || 'auto-pin@ai2apps.cn';

        // 将 .xpi 文件复制到 extensions 目录
        const extensionDest = path.join(extensionsDir, `${finalExtensionId}.xpi`);
        fs.copyFileSync(xpiPath, extensionDest);

        // 同时复制扩展目录作为备用
        if(this.extensionPath) {
            const extensionDirDest = path.join(extensionsDir, finalExtensionId);
            if (!fs.existsSync(extensionDirDest)) {
                fs.mkdirSync(extensionDirDest, { recursive: true });
            }
            fsExtra.copySync(this.extensionPath, extensionDirDest);

            console.log(`目录路径: ${extensionDirDest}`);
        }

        console.log(`扩展已安装: ${finalExtensionId}`);
        console.log(`XPI 路径: ${extensionDest}`);
        
        // 创建扩展配置文件
        await this.createExtensionsConfig(finalExtensionId);
    }

    // 打包扩展为 .xpi 文件
    async packageExtension() {
        return new Promise((resolve, reject) => {
            if(!this.extensionPath) {
                return reject('')
            }
            const xpiPath = path.join(__dirname, 'auto-pin@ai2apps.cn.xpi');
            const output = fs.createWriteStream(xpiPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                console.log(`扩展已打包: ${archive.pointer()} bytes`);
                resolve(xpiPath);
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);

            // 打包扩展目录中的所有文件
            archive.directory(this.extensionPath, false);
            archive.finalize();
        });
    }


    async createExtensionsConfig(extensionId) {
        const extensionsFile = path.join(this.profilePath, 'extensions.json');

        // 1. 检查文件是否存在
        if (fs.existsSync(extensionsFile)) {
            try {
                // 读取现有配置
                const existingConfig = JSON.parse(fs.readFileSync(extensionsFile, 'utf8'));

                // 2. 检查是否已存在相同ID的扩展
                const existingExtensionIndex = existingConfig.addons.findIndex(
                    addon => addon.id === extensionId
                );

                if (existingExtensionIndex !== -1) {
                    // 已存在，更新配置
                    console.log(`扩展 ${extensionId} 已存在，更新配置`);

                    // 更新现有扩展配置
                    existingConfig.addons[existingExtensionIndex] = {
                        ...existingConfig.addons[existingExtensionIndex],
                        ...this.getExtensionConfig(extensionId),
                        updateDate: Date.now(),
                        active: true,
                        userDisabled: false
                    };

                    // 确保 schemaVersion 是最新的
                    existingConfig.schemaVersion = Math.max(existingConfig.schemaVersion, 32);

                    fs.writeFileSync(extensionsFile, JSON.stringify(existingConfig, null, 2));
                    console.log('已更新 extensions.json 配置文件');
                } else {
                    // 不存在，添加到数组开头（保持顺序）
                    console.log(`扩展 ${extensionId} 不存在，添加到配置`);

                    const newExtension = this.getExtensionConfig(extensionId);
                    existingConfig.addons.unshift(newExtension);

                    fs.writeFileSync(extensionsFile, JSON.stringify(existingConfig, null, 2));
                    console.log('已添加新扩展到 extensions.json');
                }

                return;
            } catch (error) {
                console.error('读取或解析现有 extensions.json 失败:', error);
                console.log('将创建新的配置文件');
                // 继续创建新配置
            }
        }

        // 3. 文件不存在或读取失败，创建新配置
        console.log('创建新的 extensions.json 配置文件');
        const extensionsConfig = {
            "addons": [this.getExtensionConfig(extensionId)],
            "schemaVersion": 32,
            "root": { "schemaVersion": 32 }
        };

        fs.writeFileSync(extensionsFile, JSON.stringify(extensionsConfig, null, 2));
        console.log('已创建新的 extensions.json 配置文件');
    }

    getExtensionConfig(extensionId) {
        const xpiPath = path.join(this.profilePath, 'extensions', `${extensionId}.xpi`);

        return {
            "id": extensionId,
            "location": "app-profile",
            "version": "1.0",
            "type": "extension",
            "updateURL": null,
            "optionsURL": null,
            "optionsType": null,
            "aboutURL": null,
            "iconURL": null,
            "icon64URL": null,
            "defaultLocale": {
                "name": "Auto Pin Extension",
                "description": "Automatically pins tabs",
                "creator": "Your Name",
                "homepageURL": null
            },
            "visible": true,
            "active": true,
            "userDisabled": false,
            "appDisabled": false,
            "installDate": Date.now(),
            "updateDate": Date.now(),
            "applyBackgroundUpdates": 1,
            "path": `extensions/${extensionId}.xpi`,
            "rootURI": `jar:file://${xpiPath}!/`,
            "releaseNotesURI": null,
            "softDisabled": false,
            "foreignInstall": false,
            "hasBinaryComponents": false,
            "strictCompatibility": false,
            "locales": [],
            "targetApplications": [
                {
                    "id": "toolkit@mozilla.org",
                    "minVersion": "42.0",
                    "maxVersion": "*"
                }
            ],
            "targetPlatforms": [],
            "multiprocessCompatible": false,
            "signedState": 4,
            "seen": true,
            "dependencies": [],
            "hasEmbeddedWebExtension": false,
            "userPermissions": null,
            "isDevExtension": true
        };
    }
}

module.exports = {
    ExtensionInstaller
}