#!/usr/bin/env node
/**
 * Build RAG Index with Semantic Embeddings
 * 
 * This script generates vector embeddings for Docusaurus content
 * using Amazon Bedrock Titan Embeddings for semantic search.
 * 
 * Usage:
 *   npx build-rag-embeddings --docs ./docs --output ./rag-index-embeddings.json
 * 
 * Prerequisites:
 *   - AWS credentials configured
 *   - Bedrock Titan Embeddings model access enabled
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Try to load AWS SDK
let BedrockRuntimeClient, InvokeModelCommand;
try {
  const bedrock = require('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = bedrock.BedrockRuntimeClient;
  InvokeModelCommand = bedrock.InvokeModelCommand;
} catch (e) {
  console.log('⚠️  @aws-sdk/client-bedrock-runtime not found.');
  console.log('   Install it with: npm install @aws-sdk/client-bedrock-runtime');
  console.log('   Or use the basic index builder: npx build-rag-index');
  process.exit(1);
}

// Configuration
const DEFAULT_CONFIG = {
  docsDir: './docs',
  blogDir: './blog',
  outputFile: './rag-index-embeddings.json',
  chunkSize: 512,        // Smaller chunks for embeddings
  chunkOverlap: 100,
  embeddingModel: 'amazon.titan-embed-text-v2:0',
  region: process.env.AWS_REGION || 'us-east-1',
  batchSize: 5,          // Process 5 chunks at a time to avoid rate limits
  delayMs: 200,          // Delay between batches
};

let bedrockClient = null;

/**
 * Initialize Bedrock client
 */
function initBedrockClient(region) {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region });
  }
  return bedrockClient;
}

/**
 * Generate embedding for text using Titan Embeddings
 */
async function generateEmbedding(text, model = DEFAULT_CONFIG.embeddingModel) {
  const client = initBedrockClient(DEFAULT_CONFIG.region);
  
  const payload = {
    inputText: text.slice(0, 8000), // Titan limit
  };
  
  const command = new InvokeModelCommand({
    modelId: model,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });
  
  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  
  return result.embedding;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--docs':
        config.docsDir = args[++i];
        break;
      case '--blog':
        config.blogDir = args[++i];
        break;
      case '--output':
        config.outputFile = args[++i];
        break;
      case '--chunk-size':
        config.chunkSize = parseInt(args[++i], 10);
        break;
      case '--region':
        config.region = args[++i];
        break;
      case '--model':
        config.embeddingModel = args[++i];
        break;
      case '--help':
        console.log(`
Docusaurus RAG Index Builder with Semantic Embeddings

Usage: build-rag-embeddings [options]

Options:
  --docs <path>       Path to docs directory (default: ./docs)
  --blog <path>       Path to blog directory (default: ./blog)
  --output <path>     Output file path (default: ./rag-index-embeddings.json)
  --chunk-size <n>    Max characters per chunk (default: 512)
  --region <region>   AWS region (default: us-east-1)
  --model <model>     Embedding model ID (default: amazon.titan-embed-text-v2:0)
  --help              Show this help message

Prerequisites:
  - AWS credentials configured (aws configure)
  - Bedrock Titan Embeddings access enabled
  - npm install @aws-sdk/client-bedrock-runtime
        `);
        process.exit(0);
    }
  }
  
  return config;
}

/**
 * Recursively find all Markdown files
 */
function findMarkdownFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findMarkdownFiles(fullPath, files);
    } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Parse frontmatter from Markdown
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return { metadata: {}, content };
  
  const metadata = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      let key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      metadata[key] = val;
    }
  });
  
  return { metadata, content: content.slice(match[0].length) };
}

/**
 * Clean Markdown content
 */
function cleanMarkdown(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+.*$/gm, '')
    .replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, '')
    .replace(/<[A-Z][a-zA-Z]*[^>]*>[\s\S]*?<\/[A-Z][a-zA-Z]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split content into chunks
 */
function splitIntoChunks(content, chunkSize, overlap) {
  const chunks = [];
  const sentences = content.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

/**
 * Process a single file
 */
function processFile(filePath, config, baseDir) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, content: body } = parseFrontmatter(content);
  const cleaned = cleanMarkdown(body);
  
  if (!cleaned || cleaned.length < 50) return [];
  
  const relativePath = path.relative(baseDir, filePath);
  const slug = relativePath.replace(/\\/g, '/').replace(/\.(md|mdx)$/i, '').replace(/\/index$/, '');
  
  const chunks = splitIntoChunks(cleaned, config.chunkSize, config.chunkOverlap);
  
  return chunks.map((chunk, index) => ({
    id: crypto.createHash('md5').update(`${filePath}-${index}`).digest('hex').slice(0, 8),
    source: relativePath.replace(/\\/g, '/'),
    slug,
    title: metadata.title || path.basename(filePath, path.extname(filePath)),
    content: chunk,
    chunkIndex: index,
    totalChunks: chunks.length,
    embedding: null, // Will be filled later
  }));
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function
 */
async function main() {
  const config = parseArgs();
  const startTime = Date.now();
  
  console.log('🔍 Docusaurus RAG Index Builder (Semantic Embeddings)\n');
  console.log(`📁 Docs: ${config.docsDir}`);
  console.log(`📁 Blog: ${config.blogDir}`);
  console.log(`📄 Output: ${config.outputFile}`);
  console.log(`🧠 Model: ${config.embeddingModel}`);
  console.log(`🌍 Region: ${config.region}\n`);
  
  // Find files
  const docsFiles = findMarkdownFiles(config.docsDir);
  const blogFiles = findMarkdownFiles(config.blogDir);
  const allFiles = [...docsFiles, ...blogFiles];
  
  console.log(`📚 Found ${docsFiles.length} docs, ${blogFiles.length} blog posts`);
  
  if (!allFiles.length) {
    console.log('⚠️  No Markdown files found.');
    process.exit(1);
  }
  
  // Process files into chunks
  const chunks = [];
  for (const file of allFiles) {
    const baseDir = file.startsWith(path.resolve(config.docsDir)) ? config.docsDir : config.blogDir;
    chunks.push(...processFile(file, config, baseDir));
  }
  
  console.log(`📑 Generated ${chunks.length} chunks\n`);
  console.log('🚀 Generating embeddings (this may take a while)...\n');
  
  // Generate embeddings in batches
  let processed = 0;
  const errors = [];
  
  for (let i = 0; i < chunks.length; i += config.batchSize) {
    const batch = chunks.slice(i, i + config.batchSize);
    
    await Promise.all(batch.map(async (chunk) => {
      try {
        chunk.embedding = await generateEmbedding(chunk.content, config.embeddingModel);
      } catch (err) {
        errors.push({ id: chunk.id, error: err.message });
        console.error(`   ❌ Error for chunk ${chunk.id}: ${err.message}`);
      }
    }));
    
    processed += batch.length;
    process.stdout.write(`\r   ⏳ Progress: ${processed}/${chunks.length} chunks`);
    
    // Rate limit delay
    if (i + config.batchSize < chunks.length) {
      await sleep(config.delayMs);
    }
  }
  
  console.log('\n');
  
  // Filter out chunks without embeddings
  const successfulChunks = chunks.filter(c => c.embedding !== null);
  
  // Build index
  const index = {
    version: '2.0-embeddings',
    generatedAt: new Date().toISOString(),
    embeddingModel: config.embeddingModel,
    embeddingDimension: successfulChunks[0]?.embedding?.length || 0,
    stats: {
      totalFiles: allFiles.length,
      totalChunks: chunks.length,
      successfulChunks: successfulChunks.length,
      failedChunks: errors.length,
    },
    chunks: successfulChunks,
  };
  
  // Ensure output directory
  const outputDir = path.dirname(config.outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write index
  fs.writeFileSync(config.outputFile, JSON.stringify(index));
  
  const fileSize = (fs.statSync(config.outputFile).size / 1024 / 1024).toFixed(2);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`✅ Index saved: ${config.outputFile}`);
  console.log(`📊 Size: ${fileSize} MB`);
  console.log(`📈 Chunks: ${successfulChunks.length}/${chunks.length} successful`);
  console.log(`⏱️  Time: ${elapsed}s`);
  
  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} chunks failed to embed.`);
  }
  
  console.log('\n✨ Done! Upload to S3 for production use.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

