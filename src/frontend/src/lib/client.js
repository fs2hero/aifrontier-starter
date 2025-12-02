import {EventSource} from 'eventsource'

export class SSEClient {
  constructor(url, msgCb) {
    this.url = url;
    this.es = null;
    this.reconnectInterval = 3000;
    this.maxReconnectAttempts = 5;
    this.reconnectAttempts = 0;

    this.msgCallback = msgCb;
  }

  connect() {
    console.log('正在连接到 SSE 服务器...');
    
    this.es = new EventSource(this.url);
    
    this.es.onopen = (event) => {
      console.log('连接已建立');
      this.reconnectAttempts = 0; // 重置重连计数器
    };
    
    this.es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('收到消息:', data);
        this.handleMessage(data);
      } catch (error) {
        console.log('原始消息:', event.data);
      }
    };
    
    this.es.addEventListener('custom-event', (event) => {
      console.log('自定义事件:', event.data);
    });
    
    this.es.onerror = (error) => {
      console.error('SSE 错误:', error);
      
      if (this.es.readyState === EventSource.CLOSED) {
        console.log('连接已关闭，尝试重连...');
        this.reconnect();
      }
    };
  }
  
  handleMessage(data) {

    if(this.msgCallback) {
        this.msgCallback(data)
    }
    // 根据数据类型处理
    switch(data.type) {
      case 'init':
        console.log('初始化完成:', data.message);
        break;
      case 'status':
        console.log('状态更新:', data);
        break;
      case 'log':
        console.log('运行日志：', data.message)
        break
      default:
        console.log('未知消息类型:', data);
    }
  }
  
  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`重连尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectInterval);
    } else {
      console.error('达到最大重连次数，停止重连');
    }
  }
  
  close() {
    if (this.es) {
      this.es.close();
      console.log('连接已关闭');
    }
  }
}

// 使用示例
// const client = new SSEClient('http://localhost:3000/events');
// client.connect();

// // 优雅关闭
// process.on('SIGINT', () => {
//   client.close();
//   process.exit();
// });