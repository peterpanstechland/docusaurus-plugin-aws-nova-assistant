#!/usr/bin/env node
/**
 * Build RAG Index for Docusaurus Site
 * 
 * This script scans all Markdown/MDX files in your Docusaurus site
 * and generates a JSON knowledge base for the Nova AI assistant.
 * 
 * Usage:
 *   npx build-rag-index --docs ./docs --blog ./blog --output ./static/rag-index.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const DEFAULT_CONFIG = {
  docsDir: './docs',
  blogDir: './blog',
  outputFile: './static/rag-index.json',
  chunkSize: 1000,       // Max characters per chunk
  chunkOverlap: 200,     // Overlap between chunks
  excludePatterns: [
    '**/node_modules/**',
    '**/_category_.json',
    '**/authors.yml',
    '**/tags.yml',
  ],
};

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
      case '--help':
        console.log(`
Docusaurus RAG Index Builder

Usage: build-rag-index [options]

Options:
  --docs <path>       Path to docs directory (default: ./docs)
  --blog <path>       Path to blog directory (default: ./blog)
  --output <path>     Output JSON file path (default: ./static/rag-index.json)
  --chunk-size <n>    Max characters per chunk (default: 1000)
  --help              Show this help message
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
  if (!fs.existsSync(dir)) {
    return files;
  }
  
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
 * Parse frontmatter from Markdown content
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { metadata: {}, content };
  }
  
  const frontmatter = match[1];
  const metadata = {};
  
  // Simple YAML parsing for common fields
  const lines = frontmatter.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      metadata[key] = value;
    }
  }
  
  const bodyContent = content.slice(match[0].length);
  return { metadata, content: bodyContent };
}

/**
 * Clean Markdown content for indexing
 */
function cleanMarkdownContent(content) {
  return content
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`[^`]+`/g, '')
    // Remove images
    .replace(/!\[.*?\]\(.*?\)/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove import/export statements
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+.*$/gm, '')
    // Remove JSX components
    .replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, '')
    .replace(/<[A-Z][a-zA-Z]*[^>]*>[\s\S]*?<\/[A-Z][a-zA-Z]*>/g, '')
    // Normalize whitespace
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
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Keep overlap from the end of current chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Generate a unique ID for a chunk
 */
function generateChunkId(filePath, chunkIndex) {
  const hash = crypto
    .createHash('md5')
    .update(`${filePath}-${chunkIndex}`)
    .digest('hex')
    .slice(0, 8);
  return hash;
}

/**
 * Extract keywords from content (simple TF approach)
 */
function extractKeywords(content, maxKeywords = 10) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
    'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now',
  ]);
  
  const words = content.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  const frequency = {};
  for (const word of words) {
    frequency[word] = (frequency[word] || 0) + 1;
  }
  
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Process a single file
 */
function processFile(filePath, config, baseDir) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, content: bodyContent } = parseFrontmatter(content);
  const cleanedContent = cleanMarkdownContent(bodyContent);
  
  if (!cleanedContent || cleanedContent.length < 50) {
    return [];
  }
  
  const relativePath = path.relative(baseDir, filePath);
  const slug = relativePath
    .replace(/\\/g, '/')
    .replace(/\.(md|mdx)$/i, '')
    .replace(/\/index$/, '');
  
  const chunks = splitIntoChunks(cleanedContent, config.chunkSize, config.chunkOverlap);
  
  return chunks.map((chunk, index) => ({
    id: generateChunkId(filePath, index),
    source: relativePath.replace(/\\/g, '/'),
    slug: slug,
    title: metadata.title || path.basename(filePath, path.extname(filePath)),
    section: metadata.sidebar_label || metadata.title || '',
    content: chunk,
    keywords: extractKeywords(chunk),
    chunkIndex: index,
    totalChunks: chunks.length,
  }));
}

/**
 * Main function
 */
async function main() {
  const config = parseArgs();
  const startTime = Date.now();
  
  console.log('🔍 Docusaurus RAG Index Builder\n');
  console.log(`📁 Docs directory: ${config.docsDir}`);
  console.log(`📁 Blog directory: ${config.blogDir}`);
  console.log(`📄 Output file: ${config.outputFile}\n`);
  
  // Find all markdown files
  const docsFiles = findMarkdownFiles(config.docsDir);
  const blogFiles = findMarkdownFiles(config.blogDir);
  const allFiles = [...docsFiles, ...blogFiles];
  
  console.log(`📚 Found ${docsFiles.length} docs files`);
  console.log(`📝 Found ${blogFiles.length} blog files`);
  console.log(`📑 Total: ${allFiles.length} files\n`);
  
  if (allFiles.length === 0) {
    console.log('⚠️  No Markdown files found. Check your paths.');
    process.exit(1);
  }
  
  // Process all files
  const chunks = [];
  let processedFiles = 0;
  
  for (const file of allFiles) {
    const baseDir = file.startsWith(path.resolve(config.docsDir)) 
      ? config.docsDir 
      : config.blogDir;
    
    const fileChunks = processFile(file, config, baseDir);
    chunks.push(...fileChunks);
    processedFiles++;
    
    if (processedFiles % 10 === 0) {
      process.stdout.write(`\r⏳ Processing... ${processedFiles}/${allFiles.length} files`);
    }
  }
  
  console.log(`\r✅ Processed ${processedFiles} files -> ${chunks.length} chunks\n`);
  
  // Build the index
  const index = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    stats: {
      totalFiles: allFiles.length,
      totalChunks: chunks.length,
      docsFiles: docsFiles.length,
      blogFiles: blogFiles.length,
    },
    chunks: chunks,
  };
  
  // Ensure output directory exists
  const outputDir = path.dirname(config.outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write index file
  fs.writeFileSync(config.outputFile, JSON.stringify(index, null, 2));
  
  const fileSize = (fs.statSync(config.outputFile).size / 1024).toFixed(2);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`📦 Index saved to: ${config.outputFile}`);
  console.log(`📊 File size: ${fileSize} KB`);
  console.log(`⏱️  Completed in ${elapsed}s\n`);
  
  console.log('✨ RAG index built successfully!');
  console.log('   Upload this file to your Lambda or serve it statically.');
}

main().catch(console.error);

