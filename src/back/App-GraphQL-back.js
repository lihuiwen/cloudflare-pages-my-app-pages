import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import MarkdownRenderer from './components/markdown';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const subscriptionRef = useRef(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 清理函数，关闭 SSE 连接
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.close();
      }
    };
  }, []);

  // 使用 GraphQL 订阅发送消息
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // 添加用户消息到聊天记录
    const userMessage = { role: 'user', content: inputValue };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // 清除之前的 SSE 连接
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
    }

    try {
      // 准备所有历史消息
      const allMessages = [...messages, userMessage];
      
      // 添加一个初始的空 AI 消息，稍后会逐步填充内容
      const initialAiMessage = { role: 'assistant', content: '' };
      setMessages(prevMessages => [...prevMessages, initialAiMessage]);
      
      // 设置流式状态
      setIsStreaming(true);

      // 准备 GraphQL 订阅查询
      const subscriptionQuery = `
        subscription StreamChatCompletion($input: ChatCompletionInput!) {
          streamChatCompletion(input: $input) {
            id
            chunk
            finishReason
          }
        }
      `;

      // 准备变量
      const variables = {
        input: {
          model: "deepseek-chat",
          messages: allMessages,
          temperature: 0.7,
          max_tokens: 800
        }
      };

      // 编码查询和变量为 URL 查询参数
      const queryParams = new URLSearchParams({
        query: subscriptionQuery,
        variables: JSON.stringify(variables)
      });

      // 创建 SSE 连接
      // 注意：GraphQL 订阅使用 GET 请求和 EventSource
      const url = `http://localhost:8787/graphql?${queryParams.toString()}`;
      console.log("连接到 SSE 端点:", url);
      const eventSource = new EventSource(url);
      subscriptionRef.current = eventSource;

      // 监听所有类型的事件 (不只是 message 事件)
      eventSource.onopen = (event) => {
        console.log('SSE 连接已打开:', event);
      };

      // 监听消息事件
      eventSource.onmessage = (event) => {
        console.log('接收到 SSE 消息:', event.data);
        try {
          const data = JSON.parse(event.data);
          if (data.errors) {
            throw new Error(data.errors[0].message);
          }
          
          if (data.data && data.data.streamChatCompletion) {
            const streamChunk = data.data.streamChatCompletion;
            
            // 更新最后一条消息的内容
            setMessages(prevMessages => {
              const newMessages = [...prevMessages];
              const lastMessage = newMessages[newMessages.length - 1];
              lastMessage.content += streamChunk.chunk || '';
              return newMessages;
            });
            
            // 如果收到完成信号
            if (streamChunk.finishReason === 'stop') {
              eventSource.close();
              setIsStreaming(false);
              setIsLoading(false);
            }
          }
        } catch (error) {
          console.error('处理流式数据时出错:', error);
          
          // 更新消息显示错误
          setMessages(prevMessages => {
            const newMessages = [...prevMessages];
            const lastMessage = newMessages[newMessages.length - 1];
            lastMessage.content += `\n\n处理响应时出错: ${error.message}`;
            return newMessages;
          });
          
          eventSource.close();
          setIsStreaming(false);
          setIsLoading(false);
        }
      };

      // 监听错误事件
      eventSource.onerror = (error) => {
        console.error('SSE 连接错误:', error);
        
        // 更新消息显示错误
        setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          const lastMessage = newMessages[newMessages.length - 1];
          
          if (lastMessage.content.length === 0) {
            lastMessage.content = `连接错误，无法获取响应。请稍后再试。`;
          } else {
            lastMessage.content += `\n\n连接中断，未能获取完整回复。`;
          }
          return newMessages;
        });
        
        eventSource.close();
        setIsStreaming(false);
        setIsLoading(false);
      };

      // 添加自定义事件监听器，可能后端发送的是命名事件而不是默认消息事件
      eventSource.addEventListener('next', function(event) {
        console.log('接收到 next 事件:', event.data);
        try {
          const data = JSON.parse(event.data);
          if (data.data && data.data.streamChatCompletion) {
            const streamChunk = data.data.streamChatCompletion;
            
            // 更新最后一条消息的内容
            setMessages(prevMessages => {
              const newMessages = [...prevMessages];
              const lastMessage = newMessages[newMessages.length - 1];
              lastMessage.content += streamChunk.chunk || '';
              return newMessages;
            });
          }
        } catch (error) {
          console.error('处理 next 事件时出错:', error);
        }
      });

      // 监听完成事件
      eventSource.addEventListener('complete', function(event) {
        console.log('接收到 complete 事件:', event.data);
        eventSource.close();
        setIsStreaming(false);
        setIsLoading(false);
      });

      // 添加更多原始消息输出以便调试
      const originalAddEventListener = eventSource.addEventListener;
      eventSource.addEventListener = function(type, callback) {
        const wrappedCallback = event => {
          console.log(`事件类型: ${type}, 数据:`, event.data);
          return callback(event);
        };
        return originalAddEventListener.call(this, type, wrappedCallback);
      };

    } catch (error) {
      console.error('发起订阅请求时出错:', error);
      
      // 显示错误消息
      setMessages(prevMessages => {
        const newMessages = [...prevMessages];
        if (newMessages[newMessages.length - 1].role === 'assistant' && 
            newMessages[newMessages.length - 1].content === '') {
          newMessages[newMessages.length - 1].content = `发送消息时出错: ${error.message}`;
        } else {
          newMessages.push({ 
            role: 'assistant', 
            content: `发送消息时出错: ${error.message}` 
          });
        }
        return newMessages;
      });
      
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  // 添加备用的 fetch 流式请求方法
  const sendMessageWithFetch = async (e) => {
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
      
      // 设置流式状态
      setIsStreaming(true);

      // 准备 GraphQL 订阅查询
      const subscriptionQuery = `
        subscription StreamChatCompletion($input: ChatCompletionInput!) {
          streamChatCompletion(input: $input) {
            id
            chunk
            finishReason
          }
        }
      `;

      // 准备变量
      const variables = {
        input: {
          model: "deepseek-chat",
          messages: allMessages,
          temperature: 0.7,
          max_tokens: 800
        }
      };

      // 使用 fetch 和 readableStream 
      const response = await fetch('http://localhost:8787/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          query: subscriptionQuery,
          variables: variables
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 获取响应流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      // 处理流式数据
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          setIsStreaming(false);
          setIsLoading(false);
          break;
        }
        
        // 解码获取的数据块
        const chunk = decoder.decode(value, { stream: true });
        console.log('接收到流数据:', chunk); // 查看原始返回
        
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        // 处理每一行数据
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.errors) {
                throw new Error(data.errors[0].message);
              }
              
              // 检查是否有订阅数据
              if (data.data && data.data.streamChatCompletion) {
                const streamChunk = data.data.streamChatCompletion;
                
                // 更新最后一条 AI 消息，添加新的文本块
                setMessages(prevMessages => {
                  const newMessages = [...prevMessages];
                  const lastMessage = newMessages[newMessages.length - 1];
                  lastMessage.content += streamChunk.chunk || '';
                  return newMessages;
                });
                
                // 如果收到完成信号
                if (streamChunk.finishReason === 'stop') {
                  setIsStreaming(false);
                  setIsLoading(false);
                }
              }
            } catch (error) {
              console.error('处理流式数据时出错:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('发送消息时出错:', error);
      
      // 更新或添加错误消息
      setMessages(prevMessages => {
        const newMessages = [...prevMessages];
        if (newMessages[newMessages.length - 1].role === 'assistant' && 
            newMessages[newMessages.length - 1].content === '') {
          newMessages[newMessages.length - 1].content = `发送消息时出错: ${error.message}`;
        } else {
          newMessages.push({ 
            role: 'assistant', 
            content: `发送消息时出错: ${error.message}` 
          });
        }
        return newMessages;
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  // 添加示例问题
  const addExampleQuestion = (question) => {
    setInputValue(question);
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
        <h1>DeepSeek AI 聊天</h1>
        <div className="streaming-badge">
          {isStreaming && <span className="streaming-indicator">流式输出中...</span>}
        </div>
      </header>
      
      <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-container">
              <h2>欢迎使用 DeepSeek AI 聊天</h2>
              <p>您可以开始提问，或者尝试以下示例：</p>
              <div className="example-questions">
                <button onClick={() => addExampleQuestion("介绍一下人工智能的最新发展")}>
                  介绍一下人工智能的最新发展
                </button>
                <button onClick={() => addExampleQuestion("如何学习编程？给我一些建议")}>
                  如何学习编程？给我一些建议
                </button>
                <button onClick={() => addExampleQuestion("用Python写一个简单的网络爬虫")}>
                  用Python写一个简单的网络爬虫
                </button>
                <button onClick={() => addExampleQuestion("用Markdown格式总结React的核心特性，包括代码示例和表格")}>
                  用Markdown格式总结React的核心特性
                </button>
              </div>
              
              {/* 添加备用方法按钮 */}
              <div className="method-buttons" style={{ marginTop: '20px' }}>
                <button 
                  onClick={sendMessageWithFetch} 
                  style={{ background: '#4a6fa5', width: '100%', marginTop: '10px' }}
                  disabled={!inputValue.trim()}
                >
                  使用 Fetch 流式请求 (备用方法)
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
                    onClick={sendMessageWithFetch}
                    style={{ background: '#4a6fa5', padding: '8px 16px' }}
                  >
                    使用备用方法获取响应
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
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="输入消息..."
            disabled={isLoading}
            className="message-input"
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