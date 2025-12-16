/**
 * Nova Chat Component
 *
 * AI chat assistant powered by AWS Bedrock Nova
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './styles.module.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface NovaChatConfig {
  apiEndpoint?: string;
  welcomeMessage?: string;
  placeholder?: string;
  position?: 'bottom-right' | 'bottom-left';
  themeColor?: string;
}

function getConfig(): NovaChatConfig {
  if (typeof document === 'undefined') return {};

  // Try reading from Docusaurus config
  try {
    // @ts-ignore
    const siteConfig = window.__DOCUSAURUS__?.siteConfig;
    if (siteConfig?.customFields?.novaChat) {
      return siteConfig.customFields.novaChat;
    }
  } catch {}

  // Fallback: read from script tag
  const configEl = document.getElementById('nova-chat-config');
  if (configEl) {
    try {
      return JSON.parse(configEl.textContent || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

async function callNovaAPI(
  message: string,
  apiEndpoint: string,
  history: Message[]
): Promise<string> {
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        history: history.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.message || 'No response received.';
  } catch (error) {
    console.error('Nova API error:', error);

    // Demo mode fallback
    const demoResponses: Record<string, string> = {
      hello: '👋 Hello! I am Nova AI assistant powered by AWS Bedrock.',
      help: 'I can help you with:\n- 🔍 Search documentation\n- 📖 Explain concepts\n- 💡 Provide code examples',
      aws: 'AWS (Amazon Web Services) is the leading cloud platform. This site has tutorials on EC2, S3, Lambda, Bedrock, and more.',
      nova: 'Amazon Nova is AWS\'s latest multimodal foundation model series, available through Amazon Bedrock.',
      bedrock:
        'Amazon Bedrock provides API access to multiple foundation models including Claude, Nova, and Llama.',
    };

    const lowerMessage = message.toLowerCase();
    for (const [keyword, response] of Object.entries(demoResponses)) {
      if (lowerMessage.includes(keyword)) {
        return response;
      }
    }

    return `Thanks for your question! In production, this would call AWS Nova to answer: "${message}"\n\nTry asking about **AWS**, **Bedrock**, **Nova**, or say **hello**!`;
  }
}

export default function NovaChat(): JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const config = getConfig();
  const {
    apiEndpoint = '/api/nova-chat',
    welcomeMessage = '👋 Hi! I am Nova AI assistant. How can I help you?',
    placeholder = 'Type your question...',
    position = 'bottom-right',
  } = config;

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: welcomeMessage,
          timestamp: new Date(),
        },
      ]);
    }
  }, [welcomeMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await callNovaAPI(
        userMessage.content,
        apiEndpoint,
        messages
      );

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, an error occurred. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, apiEndpoint, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (typeof window === 'undefined') {
    return null;
  }

  return (
    <div className={styles.container} data-position={position}>
      {isOpen && (
        <div className={styles.chatWindow}>
          <div className={styles.header}>
            <div className={styles.headerInfo}>
              <span className={styles.headerIcon}>⚡</span>
              <span className={styles.headerTitle}>Nova AI</span>
              <span className={styles.statusDot} />
            </div>
            <button
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          <div className={styles.messages}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${styles[msg.role]}`}
              >
                {msg.role === 'assistant' && (
                  <span className={styles.avatar}>🤖</span>
                )}
                <div className={styles.messageContent}>
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i}>{line || <br />}</p>
                  ))}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className={`${styles.message} ${styles.assistant}`}>
                <span className={styles.avatar}>🤖</span>
                <div className={styles.messageContent}>
                  <div className={styles.typingIndicator}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputArea}>
            <textarea
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isLoading}
            />
            <button
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="20"
                height="20"
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>

          <div className={styles.footer}>
            Powered by <span className={styles.footerBrand}>AWS Nova</span>
          </div>
        </div>
      )}

      <button
        className={`${styles.fab} ${isOpen ? styles.fabOpen : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Open AI assistant'}
      >
        {isOpen ? (
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width="24"
            height="24"
          >
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width="28"
            height="28"
          >
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
            <circle cx="12" cy="10" r="1.5" />
            <circle cx="8" cy="10" r="1.5" />
            <circle cx="16" cy="10" r="1.5" />
          </svg>
        )}
      </button>
    </div>
  );
}

