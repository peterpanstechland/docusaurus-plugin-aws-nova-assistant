/**
 * Client-side entry point
 * Auto-injects the NovaChat component into the page
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import NovaChat from './theme/NovaChat';

if (typeof window !== 'undefined') {
  const initNovaChat = () => {
    const containerId = 'nova-chat-root';
    let container = document.getElementById(containerId);

    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(<NovaChat />);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNovaChat);
  } else {
    initNovaChat();
  }
}

export default {};

