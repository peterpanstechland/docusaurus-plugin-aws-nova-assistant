# @peterml/docusaurus-plugin-aws-nova-assistant

[![npm version](https://img.shields.io/npm/v/@peterml/docusaurus-plugin-aws-nova-assistant.svg)](https://www.npmjs.com/package/@peterml/docusaurus-plugin-aws-nova-assistant)
[![license](https://img.shields.io/npm/l/@peterml/docusaurus-plugin-aws-nova-assistant.svg)](https://github.com/peterpanstechland/docusaurus-plugin-aws-nova-assistant/blob/main/LICENSE)

A Docusaurus plugin that integrates **AWS Bedrock Nova** AI chat assistant into your documentation site.

<p align="center">
  <img src="./docs/screenshot.png" alt="Nova AI Chat Screenshot" width="400">
</p>

## ✨ Features

- 🤖 **AI-Powered Chat** - Powered by Amazon Bedrock Nova models
- 🎨 **Beautiful UI** - Glassmorphism design with dark/light mode support
- 📱 **Responsive** - Works on desktop and mobile
- ⚡ **Demo Mode** - Works without backend for testing
- 🔧 **Customizable** - Configure welcome message, placeholder, position, and more
- 🚀 **SAM Template** - Ready-to-deploy AWS Lambda backend

## 📦 Installation

```bash
npm install @peterml/docusaurus-plugin-aws-nova-assistant
# or
yarn add @peterml/docusaurus-plugin-aws-nova-assistant
```

## 🚀 Quick Start

### 1. Add the plugin to your Docusaurus config

```js
// docusaurus.config.js
module.exports = {
  plugins: [
    [
      '@peterml/docusaurus-plugin-aws-nova-assistant',
      {
        apiEndpoint: 'https://your-api.execute-api.region.amazonaws.com/api/nova-chat',
        welcomeMessage: '👋 Hi! How can I help you?',
        placeholder: 'Ask me anything...',
        position: 'bottom-right', // or 'bottom-left'
      },
    ],
  ],
};
```

### 2. Deploy the Lambda Backend (Optional)

For production use, deploy the included AWS Lambda function:

```bash
# Navigate to the lambda directory
cd node_modules/@peterml/docusaurus-plugin-aws-nova-assistant/src/lambda

# Deploy with SAM CLI
sam build
sam deploy --guided
```

See [Backend Deployment](#backend-deployment) for detailed instructions.

## ⚙️ Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiEndpoint` | `string` | `/api/nova-chat` | API endpoint URL for the chat backend |
| `welcomeMessage` | `string` | `'👋 Hi! I am Nova AI...'` | Welcome message shown when chat opens |
| `placeholder` | `string` | `'Type your question...'` | Input field placeholder text |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | Chat button position |
| `themeColor` | `string` | `var(--ifm-color-primary)` | Primary theme color |
| `enabled` | `boolean` | `true` | Enable/disable the plugin |

## 🔧 Backend Deployment

### Prerequisites

- AWS CLI configured with appropriate permissions
- SAM CLI installed (`pip install aws-sam-cli`)
- Amazon Bedrock model access enabled (request access in AWS Console)

### Enable Bedrock Model Access

1. Go to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock)
2. Navigate to **Model access** → **Manage model access**
3. Request access for **Amazon Nova** models

### Deploy with SAM

```bash
cd node_modules/@peterml/docusaurus-plugin-nova-ai/src/lambda

# Build the application
sam build

# Deploy (first time - interactive)
sam deploy --guided

# Deploy (subsequent times)
sam deploy
```

During guided deployment, you'll be prompted for:
- **Stack name**: `docusaurus-nova-chat`
- **AWS Region**: Your preferred region (e.g., `us-east-1`)
- **AllowedOrigin**: Your Docusaurus site URL (e.g., `https://your-site.com`)
- **ModelId**: Bedrock model ID (default: `amazon.nova-micro-v1:0`)
- **SystemPrompt**: Custom system prompt for the AI

### Manual Deployment (Alternative)

If you prefer not to use SAM:

1. **Create Lambda Function**
   - Runtime: Python 3.12
   - Handler: `handler.handler`
   - Upload `handler.py` and install `boto3`

2. **Set Environment Variables**
   - `MODEL_ID`: `amazon.nova-micro-v1:0`
   - `MAX_TOKENS`: `1024`
   - `SYSTEM_PROMPT`: Your custom prompt
   - `CORS_ALLOW_ORIGIN`: Your site URL

3. **Add IAM Permissions**
   ```json
   {
     "Effect": "Allow",
     "Action": ["bedrock:InvokeModel", "bedrock:Converse"],
     "Resource": "*"
   }
   ```

4. **Create API Gateway**
   - Type: HTTP API
   - Route: `POST /api/nova-chat`
   - Integration: Lambda function
   - Enable CORS

## 📚 API Reference

### Request

```json
POST /api/nova-chat
{
  "message": "What is Amazon Bedrock?",
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi! How can I help?" }
  ]
}
```

### Response

```json
{
  "message": "Amazon Bedrock is a fully managed service..."
}
```

## 💰 Cost Estimation

Amazon Nova Micro pricing (us-east-1):

| Item | Price per 1M tokens |
|------|---------------------|
| Input | $0.035 |
| Output | $0.14 |

**Example**: A conversation with 500 input + 500 output tokens costs approximately **$0.00007**.

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/peterpanstechland/docusaurus-plugin-aws-nova-assistant.git
cd docusaurus-plugin-aws-nova-assistant

# Install dependencies
npm install

# Build
npm run build

# Watch mode
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

