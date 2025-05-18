import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import MarkdownRenderer from './components/markdown';
import { MastraClient } from "@mastra/client-js";

// 创建 Mastra 客户端实例
const client = new MastraClient({ 
  // Required
  baseUrl: "https://api.mastra.cr.lihuiwen.xyz", 
  // Optional configurations for development
  retries: 3, // 重试次数
  backoffMs: 300, // 初始重试等待时间
  maxBackoffMs: 5000, // 最大重试等待时间
});

// 获取代码审查代理实例
const codeReviewAgent = client.getAgent("codeReviewAgent");

// 关于代码审查的图标
const CodeReviewIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="code-review-icon">
    <path d="M16 18l6-6-6-6"></path>
    <path d="M8 6l-6 6 6 6"></path>
    <path d="M12 2l4 20"></path>
  </svg>
);

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [debugResponse, setDebugResponse] = useState(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const textareaRef = useRef(null);

  // 自动调整文本区域高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputValue]);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    console.log('messages:::', messages);
    scrollToBottom();
  }, [messages]);

  // 清理函数，中止未完成的请求
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 从复杂响应中提取文本内容
  const extractContentFromResponse = (response) => {
    console.log('原始响应:', response);
    setDebugResponse(response);
    
    // 尝试多种可能的路径来获取内容
    if (response.text) {
      return response.text;
    }
    
    if (response.content) {
      return response.content;
    }
    
    if (response.response && response.response.body && 
        response.response.body.choices && 
        response.response.body.choices[0] && 
        response.response.body.choices[0].message) {
      return response.response.body.choices[0].message.content;
    }
    
    if (response.steps && response.steps.length > 0) {
      // 尝试获取最后一步的文本
      for (let i = response.steps.length - 1; i >= 0; i--) {
        if (response.steps[i].text) {
          return response.steps[i].text;
        }
      }
    }
    
    // 如果都找不到，返回原始 JSON 字符串
    return JSON.stringify(response, null, 2);
  };

  // 使用 Mastra 客户端发送消息
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // 添加用户消息到聊天记录
    const userMessage = { role: 'user', content: inputValue };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // 中止之前的请求（如果有）
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    try {
      // 准备所有历史消息
      const allMessages = [...messages, userMessage];
      
      // 调用 generate API 获取完整响应
      const response = await codeReviewAgent.generate({
        messages: allMessages,
        options: {
          temperature: 0.7,
          max_tokens: 800
        }
      });

      console.log('收到响应:', response);
      
      // 从响应中提取文本内容
      const contentText = extractContentFromResponse(response);
      
      // 添加 AI 消息（在收到响应后）
      setMessages(prevMessages => [
        ...prevMessages, 
        { role: 'assistant', content: contentText }
      ]);
      
    } catch (error) {
      // 忽略被用户主动中止的请求错误
      if (error.name === 'AbortError') {
        console.log('请求被用户中止');
        return;
      }
      
      console.error('发送消息时出错:', error);
      
      // 添加错误消息
      setMessages(prevMessages => [
        ...prevMessages,
        { 
          role: 'assistant', 
          content: `发送消息时出错: ${error.message || '未知错误'}` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 添加示例问题
  const addExampleQuestion = (question) => {
    setInputValue(question);
    // 让文本区域获得焦点
    textareaRef.current?.focus();
  };

  // 中止当前请求
  const abortCurrentRequest = () => {
    if (abortControllerRef.current && isLoading) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  // 渲染消息内容
  const renderMessageContent = (message) => {
    // 如果是用户消息，直接显示文本
    if (message.role === 'user') {
      return (
        <div className="message-content">
          {message.content.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>
      );
    }
    
    // 如果是 AI 消息，使用 Markdown 渲染
    return (
      <div className="message-content">
        <MarkdownRenderer 
          markdown={message.content} 
          markdownStyles={{
            code: "markdown-code",
            pre: "markdown-pre",
            a: "markdown-link"
          }}
        />
      </div>
    );
  };

  const toggleDebugPanel = () => {
    setShowDebugPanel(!showDebugPanel);
  };

  // 计算行数
  const calculateRows = () => {
    if (!inputValue) return 1;
    const lineCount = (inputValue.match(/\n/g) || []).length + 1;
    return Math.min(Math.max(lineCount, 1), 7); // 限制在1-7行之间
  };

  return (
    <div className="chat-app">
      <header className="chat-header">
        <h1 className="header-title">
          <CodeReviewIcon />
          代码审查助手
        </h1>
        <div className="streaming-badge">
          {isLoading && (
            <>
              <div className="streaming-indicator">
                <div className="pulsing-dot"></div>
                正在分析代码...
              </div>
              <button 
                onClick={abortCurrentRequest} 
                className="abort-button"
                title="中止请求"
              >
                停止
              </button>
            </>
          )}
          <button 
            onClick={toggleDebugPanel} 
            className="debug-button"
            title="调试面板"
          >
            {showDebugPanel ? '隐藏调试' : '显示调试'}
          </button>
        </div>
      </header>
      
      {showDebugPanel && debugResponse && (
        <div className="debug-panel">
          <h4 className="debug-title">响应详情</h4>
          <pre className="debug-content">{JSON.stringify(debugResponse, null, 2)}</pre>
        </div>
      )}
      
      <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-container">
              <h2 className="welcome-title">欢迎使用代码审查助手</h2>
              <p className="welcome-text">粘贴您的代码进行专业审查，获取改进建议和最佳实践指导</p>
              <div className="example-questions">
                <button 
                  onClick={() => addExampleQuestion("帮我审查这段代码:\n```javascript\nfunction fetchData() {\n  var data = null;\n  $.ajax({\n    url: 'https://api.example.com/data',\n    async: false,\n    success: function(response) {\n      data = response;\n    }\n  });\n  return data;\n}\n```")} 
                  className="example-button"
                >
                  <strong>审查 JavaScript 代码示例</strong>
                  <div className="example-description">同步 Ajax 调用示例</div>
                </button>
                <button 
                  onClick={() => addExampleQuestion("帮我审查这段 Python 代码:\n```python\ndef process_data(data_list):\n  result = []\n  for i in range(len(data_list)):\n    item = data_list[i]\n    if item != None:\n      result.append(item * 2)\n  return result\n```")} 
                  className="example-button"
                >
                  <strong>审查 Python 代码示例</strong>
                  <div className="example-description">数据处理函数</div>
                </button>
                <button 
                  onClick={() => addExampleQuestion("这段代码有什么安全问题?\n```java\npublic class UserAuthentication {\n  public static boolean checkPassword(String username, String password) {\n    String query = \"SELECT * FROM users WHERE username = '\" + username + \"' AND password = '\" + password + \"'\";\n    // Execute query and check results\n    return results.size() > 0;\n  }\n}\n```")} 
                  className="example-button"
                >
                  <strong>查找 Java 安全问题</strong>
                  <div className="example-description">SQL 查询安全分析</div>
                </button>
                <button 
                  onClick={() => addExampleQuestion("var a = 1")} 
                  className="example-button"
                >
                  <strong>简单变量定义</strong>
                  <div className="example-description">查看最佳实践建议</div>
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div 
                  key={index} 
                  className={`message ${message.role === 'user' ? 'user-message' : 'ai-message'}`}
                >
                  <div className={`message-avatar ${message.role === 'user' ? 'user-avatar' : 'ai-avatar'}`}>
                    {message.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className={`message-bubble ${message.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}>
                    {renderMessageContent(message)}
                  </div>
                </div>
              ))}
            </>
          )}
          {/* 仅当isLoading为true时显示加载指示器 */}
          {isLoading && (
            <div className="message ai-message">
              <div className="message-avatar ai-avatar">🤖</div>
              <div className="message-bubble ai-bubble">
                <div className="typing-indicator">
                  <span className="typing-dot" style={{ '--index': 0 }}></span>
                  <span className="typing-dot" style={{ '--index': 1 }}></span>
                  <span className="typing-dot" style={{ '--index': 2 }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form className="input-container" onSubmit={sendMessage}>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="输入代码或消息进行审查..."
            disabled={isLoading}
            className="message-input"
            rows={calculateRows()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputValue.trim() && !isLoading) {
                  sendMessage(e);
                }
              }
            }}
          />
          <button 
            type="submit" 
            disabled={isLoading || !inputValue.trim()} 
            className={`send-button ${(isLoading || !inputValue.trim()) ? 'disabled' : ''}`}
          >
            {isLoading ? '分析中...' : '发送'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;