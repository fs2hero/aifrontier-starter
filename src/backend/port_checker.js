const net = require('net');

class PortChecker {
  /**
   * 检查端口是否被占用
   * @param {number} port 端口号
   * @param {string} host 主机地址
   * @returns {Promise<boolean>} true表示被占用
   */
  static async isPortInUse(port, host = '0.0.0.0') {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        server.close();
        console.log(`checker isPortInUse error: ${err.message}`)
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      
      server.once('listening', () => {
        console.log(`checker isPortInUse listening port:${port},host:${host}`)
        server.close();
        resolve(false);
      });
      
      console.log(`checker isPortInUse port:${port},host:${host}`)
      server.listen(port, host);
    });
  }
  
  /**
   * 查找可用的端口
   * @param {number} startPort 起始端口
   * @param {number} endPort 结束端口
   * @param {string} host 主机地址
   * @returns {Promise<number|null>} 返回可用端口或null
   */
  static async findAvailablePort(startPort = 3000, endPort = 4000, host = '0.0.0.0') {
    for (let port = startPort; port <= endPort; port++) {
      const inUse = await this.isPortInUse(port, host);
      if (!inUse) {
        return port;
      }
    }
    return null;
  }
  
  /**
   * 获取进程占用端口的PID（仅支持类Unix系统）
   * @param {number} port 端口号
   * @returns {Promise<number|null>} PID或null
   */
  static async getPidByPort(port) {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pid = parseInt(stdout.trim());
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }
}

// 使用示例
async function example() {
  const port = 3000;
  
  // 检查端口
  const inUse = await PortChecker.isPortInUse(port);
  console.log(`端口 ${port} ${inUse ? '已被占用' : '可用'}`);
  
  if (inUse) {
    // 获取占用端口的进程ID
    const pid = await PortChecker.getPidByPort(port);
    if (pid) {
      console.log(`端口被进程 ${pid} 占用`);
    }
    
    // 寻找其他可用端口
    const availablePort = await PortChecker.findAvailablePort(3000, 3100);
    if (availablePort) {
      console.log(`建议使用端口: ${availablePort}`);
    }
  }
}

// example();

module.exports = {
  PortChecker
};