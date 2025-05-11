import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 发送消息到 DeepSeek API
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // 添加用户消息到聊天记录
    const userMessage = { role: 'user', content: inputValue };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 准备所有历史消息发送给 API
      const allMessages = [...messages, userMessage];
      
      const response = await fetch('https://api.lihuiwen.xyz/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation CreateChatCompletion($input: ChatCompletionInput!) {
              createChatCompletion(input: $input) {
                choices {
                  message {
                    role
                    content
                  }
                }
              }
            }
          `,
          variables: {
            input: {
              model: "deepseek-chat",
              messages: allMessages,
              temperature: 0.7,
              max_tokens: 800
            }
          }
        }),
      });

      const data = await response.json();
      
      // 检查响应中是否有错误
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      // 从响应中提取 AI 消息
      const aiMessage = data.data.createChatCompletion.choices[0].message;
      setMessages(prevMessages => [...prevMessages, aiMessage]);
    } catch (error) {
      console.error('发送消息时出错:', error);
      // 添加错误消息到聊天
      setMessages(prevMessages => [
        ...prevMessages, 
        { role: 'assistant', content: `发送消息时出错: ${error.message}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 添加示例问题
  const addExampleQuestion = (question) => {
    setInputValue(question);
  };

  return (
    <div className="chat-app">
      <header className="chat-header">
        <h1>DeepSeek AI 聊天</h1>
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
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div 
                key={index} 
                className={`message ${message.role === 'user' ? 'user-message' : 'ai-message'}`}
              >
                <div className="message-avatar">
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message-bubble">
                  <div className="message-content">
                    {message.content.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        {i < message.content.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
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
            发送
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;