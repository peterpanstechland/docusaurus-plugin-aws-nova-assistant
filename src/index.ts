/**
 * Docusaurus Plugin for AWS Bedrock Nova AI Chat
 *
 * @module @peterml/docusaurus-plugin-nova-ai
 */

import type { Plugin, LoadContext } from '@docusaurus/types';
import path from 'path';

export interface NovaChatOptions {
  /** API endpoint URL for the Nova chat backend */
  apiEndpoint?: string;
  /** Welcome message shown when chat opens */
  welcomeMessage?: string;
  /** Placeholder text for input field */
  placeholder?: string;
  /** Position of the chat button */
  position?: 'bottom-right' | 'bottom-left';
  /** Primary theme color (CSS value) */
  themeColor?: string;
  /** Enable/disable the plugin */
  enabled?: boolean;
}

const DEFAULT_OPTIONS: Required<NovaChatOptions> = {
  apiEndpoint: '/api/nova-chat',
  welcomeMessage: '👋 Hi! I am Nova AI assistant. How can I help you?',
  placeholder: 'Type your question...',
  position: 'bottom-right',
  themeColor: 'var(--ifm-color-primary)',
  enabled: true,
};

export default function pluginNovaAI(
  context: LoadContext,
  options: NovaChatOptions
): Plugin {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  if (!mergedOptions.enabled) {
    return {
      name: 'docusaurus-plugin-nova-ai',
    };
  }

  return {
    name: 'docusaurus-plugin-nova-ai',

    getThemePath() {
      return path.resolve(__dirname, './theme');
    },

    getClientModules() {
      return [path.resolve(__dirname, './client')];
    },

    injectHtmlTags() {
      return {
        headTags: [
          {
            tagName: 'script',
            attributes: {
              type: 'application/json',
              id: 'nova-chat-config',
            },
            innerHTML: JSON.stringify(mergedOptions),
          },
        ],
      };
    },

    async contentLoaded({ actions }) {
      const { setGlobalData } = actions;
      setGlobalData({
        options: mergedOptions,
      });
    },
  };
}

export { default as NovaChat } from './theme/NovaChat';
export type { NovaChatOptions as PluginOptions };

