const fs = require('fs').promises;
const os = require("node:os");
const path = require("path");

class FileLogger {
  constructor(filename) {
    this.filename = filename;
    this.fd = null;
  }
  
  async initialize() {
    this.fd = await fs.open(this.filename, 'a');
  }
  
  // 写入并确保刷新到磁盘
  async log(message) {
    if (!this.fd) {
      await this.initialize();
    }
    
    const timestamp = new Date().toISOString();
    const data = `{${process.pid}}[${timestamp}] ${message}\n`;
    await this.fd.write(data);
    await this.fd.sync();  // 关键：强制刷新
    return true;
  }
  
  // 优雅关闭
  async close() {
    if (this.fd) {
      // 写入关闭标记并刷新
      const timestamp = new Date().toISOString();
      await this.fd.write(`{${process.pid}}[${timestamp}] logger closed\n`);
      await this.fd.sync();
      await this.fd.close();
      this.fd = null;
    }
  }
}

// 使用示例
async function main() {
  const logger = new FileLogger('test.log');
  
  // 正常日志
  await logger.log('应用程序启动');
  await logger.log('处理了一些任务');
  
  // 退出前确保写入
  process.on('SIGINT', async () => {
    console.log('收到关闭信号');
    await logger.log('收到 SIGINT 信号，正在关闭');
    await logger.close();
    console.log('日志已安全保存');
    process.exit(0);
  });
  
  // 模拟工作
  setTimeout(async () => {
    await logger.log('工作完成');
    await logger.close();
    process.exit(0);
  }, 3000);
}

main().catch(console.error);
let logger = null;

async function writeLogFile(message, logFileName = 'aifrontier.log', logDir = null) {
  try {
    if(!logger) {
        // 确定日志目录
        const logDirectory = logDir || path.join(os.tmpdir(), 'logs');
        
        // 确保日志目录存在
        await fs.mkdir(logDirectory, { recursive: true });
        
        // 完整的日志文件路径
        const logFilePath = path.join(logDirectory, logFileName);
        logger = new FileLogger(logFilePath);

        console.log(`日志将写入: ${logFilePath}`);
    }
    
    // 格式化日志内容
    // const timestamp = new Date().toISOString();
    // const logMessage = `{${process.pid}}[${timestamp}] ${message}\n`;
    
    // // 异步写入日志（追加模式）
    // await fs.appendFile(logFilePath, logMessage, 'utf8',(err) => {
    //   if (err) throw err;
    //   console.log('The "data to append" was appended to file!');
    // });
    await logger.log(message)
  } catch (error) {
    console.error('写入日志文件失败:', error);
    throw error;
  }
}

async function flushLogs() {
    if(logger) {
        await logger.close();
        logger = null;
    } else {
        console.warn(`logger is undefine`)
    }
    
}

module.exports = {
    FileLogger,
    writeLogFile,
    flushLogs 
}