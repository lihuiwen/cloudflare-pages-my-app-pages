import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import MarkdownRenderer from './components/markdown';
import { MastraClient } from "@mastra/client-js";

// 创建 Mastra 客户端实例
const client = new MastraClient({ 
  // Required
  baseUrl: "http://localhost:4111", 
  // Optional configurations for development
  retries: 3, // 重试次数
  backoffMs: 300, // 初始重试等待时间
  maxBackoffMs: 5000, // 最大重试等待时间
});

// 获取代码审查代理实例
const codeReviewAgent = client.getAgent("codeReviewAgent");

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

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

  // 使用 Mastra 客户端发送消息（使用官方流式响应方法）
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
      
      // 添加一个初始的空 AI 消息，稍后会逐步填充内容
      const initialAiMessage = { role: 'assistant', content: '' };
      setMessages(prevMessages => [...prevMessages, initialAiMessage]);
      
      // 设置流式状态
      setIsStreaming(true);

      // 使用官方流式方法获取响应
      const response = await codeReviewAgent.stream({
        messages: allMessages,
        options: {
          temperature: 0.7,
          max_tokens: 800
        },
        signal: abortControllerRef.current.signal
      });

      // 处理流式响应
      response.processDataStream({
        onTextPart: (text) => {
          // 更新最后一条消息的内容
          setMessages(prevMessages => {
            const newMessages = [...prevMessages];
            const lastMessage = newMessages[newMessages.length - 1];
            lastMessage.content += text;
            return newMessages;
          });
        },
        onTextPart: (text) => {
          // 检查并清理返回的文本内容
          const cleanedText = text
            .replace(/\*\*([^*]+)\*\*/g, '**$1**') // 修复可能的Markdown语法
            .replace(/,,/g, ',') // 移除重复的逗号
            .replace(/([a-zA-Z]+)(\1+)/g, '$1'); // 移除重复的单词
          
          // 更新最后一条消息的内容
          setMessages(prevMessages => {
            const newMessages = [...prevMessages];
            const lastMessage = newMessages[newMessages.length - 1];
            lastMessage.content += cleanedText;
            return newMessages;
          });
        },
        onFilePart: (file) => {
          console.log("Received file:", file);
          // 如果需要处理文件部分，可以在这里添加逻辑
        },
        onDataPart: (data) => {
          console.log("Received data:", data);
          // 如果需要处理数据部分，可以在这里添加逻辑
        },
        onErrorPart: (error) => {
          console.error("Stream error:", error);
          // 处理流错误
          setMessages(prevMessages => {
            const newMessages = [...prevMessages];
            const lastMessage = newMessages[newMessages.length - 1];
            lastMessage.content += `\n\n[错误: ${error.message || '流处理过程中出错'}]`;
            return newMessages;
          });
        }
      });
      
      // 流式响应完成
      setIsStreaming(false);
      setIsLoading(false);
      
    } catch (error) {
      // 忽略被用户主动中止的请求错误
      if (error.name === 'AbortError') {
        console.log('请求被用户中止');
        return;
      }
      
      console.error('发送消息时出错:', error);
      
      // 显示错误消息
      setMessages(prevMessages => {
        const newMessages = [...prevMessages];
        if (newMessages[newMessages.length - 1].role === 'assistant' && 
            newMessages[newMessages.length - 1].content === '') {
          newMessages[newMessages.length - 1].content = `发送消息时出错: ${error.message || '未知错误'}`;
        } else {
          newMessages.push({ 
            role: 'assistant', 
            content: `发送消息时出错: ${error.message || '未知错误'}` 
          });
        }
        return newMessages;
      });
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  // 如果需要，您还可以添加一个备用方法，直接使用response.body.getReader()
  const sendMessageWithReader = async (e) => {
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
      
      // 添加一个初始的空 AI 消息，稍后会逐步填充内容
      const initialAiMessage = { role: 'assistant', content: '' };
      setMessages(prevMessages => [...prevMessages, initialAiMessage]);
      
      // 设置流式状态
      setIsStreaming(true);

      // 使用流式方法获取响应
      const response = await codeReviewAgent.stream({
        messages: allMessages,
        options: {
          temperature: 0.7,
          max_tokens: 800
        },
        signal: abortControllerRef.current.signal
      });

      // 直接使用Reader读取流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value, { stream: true });
        
        // 更新最后一条消息的内容
        setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          const lastMessage = newMessages[newMessages.length - 1];
          lastMessage.content += text;
          return newMessages;
        });
      }
      
      // 流式响应完成
      setIsStreaming(false);
      setIsLoading(false);
      
    } catch (error) {
      // 处理错误...（与之前相同）
      // ...
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  // 使用 Mastra 客户端发送消息（非流式响应）
  const sendMessageNonStream = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // 添加用户消息到聊天记录
    const userMessage = { role: 'user', content: inputValue };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 准备所有历史消息
      const allMessages = [...messages, userMessage];
      
      // 添加一个初始的空 AI 消息
      const initialAiMessage = { role: 'assistant', content: '' };
      setMessages(prevMessages => [...prevMessages, initialAiMessage]);

      // 调用非流式 API 获取完整响应
      const response = await codeReviewAgent.generate({
        messages: allMessages,
        options: {
          temperature: 0.7,
          max_tokens: 800
        }
      });

      // 更新 AI 消息
      setMessages(prevMessages => {
        const newMessages = [...prevMessages];
        const lastMessage = newMessages[newMessages.length - 1];
        lastMessage.content = response.content;
        return newMessages;
      });
      
    } catch (error) {
      console.error('发送消息时出错:', error);
      
      // 更新或添加错误消息
      setMessages(prevMessages => {
        const newMessages = [...prevMessages];
        if (newMessages[newMessages.length - 1].role === 'assistant' && 
            newMessages[newMessages.length - 1].content === '') {
          newMessages[newMessages.length - 1].content = `发送消息时出错: ${error.message || '未知错误'}`;
        } else {
          newMessages.push({ 
            role: 'assistant', 
            content: `发送消息时出错: ${error.message || '未知错误'}` 
          });
        }
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 添加示例问题
  const addExampleQuestion = (question) => {
    setInputValue(question);
  };

  // 中止当前请求
  const abortCurrentRequest = () => {
    if (abortControllerRef.current && isStreaming) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setIsLoading(false);
      
      // 更新消息，标记为已中止
      setMessages(prevMessages => {
        const newMessages = [...prevMessages];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.content += '\n\n[响应已被用户中止]';
        }
        return newMessages;
      });
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
        <MarkdownRenderer markdown={message.content} />
      </div>
    );
  };

  return (
    <div className="chat-app">
      <header className="chat-header">
        <h1>代码审查助手</h1>
        <div className="streaming-badge">
          {isStreaming && (
            <>
              <span className="streaming-indicator">流式输出中...</span>
              <button 
                onClick={abortCurrentRequest} 
                className="abort-button"
                title="中止生成"
              >
                停止
              </button>
            </>
          )}
        </div>
      </header>
      
      <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-container">
              <h2>欢迎使用代码审查助手</h2>
              <p>您可以粘贴代码进行审查，或者尝试以下示例：</p>
              <div className="example-questions">
                <button onClick={() => addExampleQuestion("帮我审查这段代码:\n```javascript\nfunction fetchData() {\n  var data = null;\n  $.ajax({\n    url: 'https://api.example.com/data',\n    async: false,\n    success: function(response) {\n      data = response;\n    }\n  });\n  return data;\n}\n```")}>
                  审查 JavaScript 代码示例
                </button>
                <button onClick={() => addExampleQuestion("帮我审查这段 Python 代码:\n```python\ndef process_data(data_list):\n  result = []\n  for i in range(len(data_list)):\n    item = data_list[i]\n    if item != None:\n      result.append(item * 2)\n  return result\n```")}>
                  审查 Python 代码示例
                </button>
                <button onClick={() => addExampleQuestion("这段代码有什么安全问题?\n```java\npublic class UserAuthentication {\n  public static boolean checkPassword(String username, String password) {\n    String query = \"SELECT * FROM users WHERE username = '\" + username + \"' AND password = '\" + password + \"'\";\n    // Execute query and check results\n    return results.size() > 0;\n  }\n}\n```")}>
                  查找 Java 安全问题
                </button>
              </div>
              
              {/* 添加备用方法按钮 */}
              <div className="method-buttons" style={{ marginTop: '20px' }}>
                <button 
                  onClick={sendMessageNonStream} 
                  style={{ background: '#4a6fa5', width: '100%', marginTop: '10px' }}
                  disabled={!inputValue.trim()}
                >
                  使用非流式响应 (备用方法)
                </button>
                
                <button 
                  onClick={sendMessageWithReader} 
                  style={{ background: '#5a7fb5', width: '100%', marginTop: '10px' }}
                  disabled={!inputValue.trim()}
                >
                  使用Reader方法 (备用方法)
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
                  <div className="message-avatar">
                    {message.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="message-bubble">
                    {renderMessageContent(message)}
                  </div>
                </div>
              ))}
              
              {/* 显示备用方法按钮 */}
              {isLoading && !isStreaming && (
                <div style={{ textAlign: 'center', margin: '10px 0' }}>
                  <button 
                    onClick={sendMessageNonStream}
                    style={{ background: '#4a6fa5', padding: '8px 16px', marginRight: '8px' }}
                  >
                    使用非流式方法
                  </button>
                  <button 
                    onClick={sendMessageWithReader}
                    style={{ background: '#5a7fb5', padding: '8px 16px' }}
                  >
                    使用Reader方法
                  </button>
                </div>
              )}
            </>
          )}
          {isLoading && !isStreaming && (
            <div className="message ai-message">
              <div className="message-avatar">🤖</div>
              <div className="message-bubble">
                <div className="message-content typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form className="input-container" onSubmit={sendMessage}>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="输入代码或消息进行审查..."
            disabled={isLoading}
            className="message-input"
            rows={inputValue.includes('```') ? 5 : 1}
          />
          <button 
            type="submit" 
            disabled={isLoading || !inputValue.trim()} 
            className="send-button"
          >
            {isLoading ? '发送中...' : '发送'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;