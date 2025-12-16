# docusaurus-plugin-aws-nova-assistant

[![npm version](https://img.shields.io/npm/v/docusaurus-plugin-aws-nova-assistant.svg)](https://www.npmjs.com/package/docusaurus-plugin-aws-nova-assistant)
[![license](https://img.shields.io/npm/l/docusaurus-plugin-aws-nova-assistant.svg)](https://github.com/peterpanstechland/docusaurus-plugin-aws-nova-assistant/blob/main/LICENSE)

A Docusaurus plugin that integrates **AWS Bedrock Nova** AI chat assistant with **RAG (Retrieval-Augmented Generation)** into your documentation site.

<p align="center">
  <img src="./docs/screenshot.png" alt="Nova AI Chat Screenshot" width="400">
</p>

## ✨ Features

- 🤖 **AI-Powered Chat** - Powered by Amazon Bedrock Nova models
- 📚 **RAG Support** - Search and reference your documentation for accurate answers
- 🔗 **Source Citations** - Shows relevant documentation links with each response
- 🎨 **Beautiful UI** - Glassmorphism design with dark/light mode support
- 📱 **Responsive** - Works on desktop and mobile
- ⚡ **Demo Mode** - Works without backend for testing
- 🔧 **Customizable** - Configure welcome message, placeholder, position, and more
- 🚀 **SAM Template** - Ready-to-deploy AWS Lambda backend

## 📦 Installation

```bash
npm install docusaurus-plugin-aws-nova-assistant
# or
yarn add docusaurus-plugin-aws-nova-assistant
```

## 🚀 Quick Start

### 1. Add the plugin to your Docusaurus config

```js
// docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-aws-nova-assistant',
      {
        apiEndpoint: 'https://your-api.execute-api.region.amazonaws.com/api/nova-chat',
        welcomeMessage: '👋 Hi! Ask me anything about the docs!',
        placeholder: 'Search docs or ask a question...',
        position: 'bottom-right',
        enableRag: true, // Enable RAG for documentation search
      },
    ],
  ],
};
```

### 2. Build RAG Index (for documentation search)

```bash
# In your Docusaurus project root
npx build-rag-index --docs ./docs --blog ./blog --output ./static/rag-index.json
```

### 3. Deploy the Lambda Backend

```bash
cd node_modules/docusaurus-plugin-aws-nova-assistant/src/lambda

# Deploy with RAG support
sam build -t template-rag.yaml
sam deploy --guided
```

## ⚙️ Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiEndpoint` | `string` | `/api/nova-chat` | API endpoint URL |
| `welcomeMessage` | `string` | `'👋 Hi! I am Nova AI...'` | Welcome message |
| `placeholder` | `string` | `'Type your question...'` | Input placeholder |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | Chat position |
| `themeColor` | `string` | `var(--ifm-color-primary)` | Theme color |
| `enabled` | `boolean` | `true` | Enable plugin |
| `enableRag` | `boolean` | `true` | Enable RAG documentation search |

## 📚 RAG (Retrieval-Augmented Generation)

RAG enables the AI assistant to search your documentation and provide accurate, contextual answers with source citations.

### Building the RAG Index

The `build-rag-index` CLI tool scans your Markdown files and generates a searchable index:

```bash
npx build-rag-index [options]

Options:
  --docs <path>       Path to docs directory (default: ./docs)
  --blog <path>       Path to blog directory (default: ./blog)
  --output <path>     Output file path (default: ./static/rag-index.json)
  --chunk-size <n>    Max characters per chunk (default: 1000)
  --help              Show help
```

**Example:**

```bash
# Build index for docs and blog
npx build-rag-index --docs ./docs --blog ./blog --output ./static/rag-index.json

# Build index for docs only
npx build-rag-index --docs ./docs --output ./static/rag-index.json
```

### How RAG Works

1. **Index Generation**: The CLI extracts text from your Markdown files, splits into chunks, and generates keywords.

2. **Query Processing**: When a user asks a question, the Lambda retrieves relevant chunks based on keyword matching.

3. **Context Injection**: Retrieved chunks are added to the system prompt, giving Nova the context to answer accurately.

4. **Source Citations**: The response includes links to relevant documentation pages.

### RAG Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Docusaurus    │      │   API Gateway   │      │  Lambda + RAG   │
│   + Chat UI     │─────▶│                 │─────▶│                 │
└─────────────────┘      └─────────────────┘      └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   S3 Bucket     │◀─────│  RAG Index      │      │ Amazon Bedrock  │
│  (rag-index)    │      │  (JSON)         │      │  Nova Model     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## 🔧 Backend Deployment

### Prerequisites

- AWS CLI configured
- SAM CLI (`pip install aws-sam-cli`)
- Amazon Bedrock model access enabled

### Deploy with RAG Support

```bash
cd node_modules/docusaurus-plugin-aws-nova-assistant/src/lambda

# Build with RAG template
sam build -t template-rag.yaml

# Deploy (first time)
sam deploy --guided --template-file template-rag.yaml

# After deployment, upload your RAG index
aws s3 cp /path/to/rag-index.json s3://YOUR-STACK-NAME-rag-index/rag-index.json
```

### Environment Variables (Lambda)

| Variable | Description |
|----------|-------------|
| `MODEL_ID` | Bedrock model ID (default: `amazon.nova-micro-v1:0`) |
| `MAX_TOKENS` | Max response tokens (default: `1024`) |
| `SYSTEM_PROMPT` | System prompt for AI |
| `RAG_INDEX_BUCKET` | S3 bucket containing RAG index |
| `RAG_INDEX_KEY` | S3 key for RAG index file |
| `RAG_TOP_K` | Number of chunks to retrieve (default: `5`) |
| `CORS_ALLOW_ORIGIN` | Allowed origin for CORS |

## 📡 API Reference

### Request

```json
POST /api/nova-chat
{
  "message": "How do I deploy to AWS?",
  "useRag": true,
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }
  ]
}
```

### Response (with RAG)

```json
{
  "message": "To deploy to AWS, you can use...",
  "sources": [
    {
      "title": "AWS Deployment Guide",
      "slug": "guides/aws/deployment",
      "source": "guides/aws/deployment.md"
    }
  ]
}
```

## 💰 Cost Estimation

Amazon Nova Micro pricing (us-east-1):

| Item | Price per 1M tokens |
|------|---------------------|
| Input | $0.035 |
| Output | $0.14 |

**With RAG**: Each query includes ~500-2000 additional context tokens, adding ~$0.00002-0.00007 per query.

## 🛠️ Development

```bash
git clone https://github.com/peterpanstechland/docusaurus-plugin-aws-nova-assistant.git
cd docusaurus-plugin-aws-nova-assistant

npm install
npm run build
npm run watch
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT © [Peter Pan](https://github.com/peterpanstechland)

## 🙏 Acknowledgments

- [Amazon Bedrock](https://aws.amazon.com/bedrock/) - AI foundation models
- [Docusaurus](https://docusaurus.io/) - Documentation framework
- [AWS Lambda](https://aws.amazon.com/lambda/) - Serverless compute
