"""
AWS Lambda Handler with RAG Support for Nova AI Chat

This Lambda function integrates with Amazon Bedrock and uses a
pre-built RAG index from Docusaurus content to provide context-aware responses.

Environment Variables:
    - MODEL_ID: Bedrock model ID (default: amazon.nova-micro-v1:0)
    - MAX_TOKENS: Maximum tokens in response (default: 1024)
    - SYSTEM_PROMPT: System prompt for the AI
    - CORS_ALLOW_ORIGIN: Allowed origin for CORS (default: *)
    - RAG_INDEX_BUCKET: S3 bucket containing the RAG index (optional)
    - RAG_INDEX_KEY: S3 key for the RAG index file (optional)
    - RAG_TOP_K: Number of relevant chunks to retrieve (default: 5)
"""

import json
import os
import re
from typing import Any
from functools import lru_cache

import boto3

# Initialize AWS clients
bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name=os.environ.get('AWS_REGION', 'us-east-1')
)

s3_client = boto3.client('s3') if os.environ.get('RAG_INDEX_BUCKET') else None

# Configuration
MODEL_ID = os.environ.get('MODEL_ID', 'amazon.nova-micro-v1:0')
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', '1024'))
RAG_TOP_K = int(os.environ.get('RAG_TOP_K', '5'))

DEFAULT_SYSTEM_PROMPT = """You are a helpful AI assistant for a technical documentation site.
Use the provided context from the documentation to answer questions accurately.
If the context doesn't contain relevant information, say so and provide general guidance.
Always be concise and cite specific documentation sections when possible."""

SYSTEM_PROMPT = os.environ.get('SYSTEM_PROMPT', DEFAULT_SYSTEM_PROMPT)

# In-memory RAG index cache
_rag_index_cache = None


def load_rag_index():
    """Load RAG index from S3 or local file."""
    global _rag_index_cache
    
    if _rag_index_cache is not None:
        return _rag_index_cache
    
    bucket = os.environ.get('RAG_INDEX_BUCKET')
    key = os.environ.get('RAG_INDEX_KEY', 'rag-index.json')
    
    if bucket and s3_client:
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            _rag_index_cache = json.loads(response['Body'].read().decode('utf-8'))
            print(f"Loaded RAG index from S3: {bucket}/{key}")
            return _rag_index_cache
        except Exception as e:
            print(f"Error loading RAG index from S3: {e}")
    
    # Try loading from local file (for testing)
    local_path = os.environ.get('RAG_INDEX_LOCAL', '/var/task/rag-index.json')
    if os.path.exists(local_path):
        with open(local_path, 'r', encoding='utf-8') as f:
            _rag_index_cache = json.load(f)
            print(f"Loaded RAG index from local file: {local_path}")
            return _rag_index_cache
    
    print("No RAG index available")
    return None


def tokenize(text: str) -> set[str]:
    """Simple tokenizer for keyword matching."""
    return set(re.findall(r'\b\w{2,}\b', text.lower()))


def calculate_relevance_score(query_tokens: set[str], chunk: dict) -> float:
    """Calculate relevance score between query and chunk using keyword overlap."""
    chunk_tokens = set(chunk.get('keywords', []))
    content_tokens = tokenize(chunk.get('content', ''))
    all_chunk_tokens = chunk_tokens | content_tokens
    
    if not all_chunk_tokens:
        return 0.0
    
    # Keyword match score
    keyword_overlap = len(query_tokens & chunk_tokens)
    content_overlap = len(query_tokens & content_tokens)
    
    # Weight keywords higher than content matches
    score = (keyword_overlap * 3) + content_overlap
    
    # Boost for title match
    title = chunk.get('title', '').lower()
    title_tokens = tokenize(title)
    if query_tokens & title_tokens:
        score += 5
    
    return score


def retrieve_relevant_chunks(query: str, top_k: int = 5) -> list[dict]:
    """Retrieve most relevant chunks for a query."""
    rag_index = load_rag_index()
    
    if not rag_index or 'chunks' not in rag_index:
        return []
    
    query_tokens = tokenize(query)
    chunks = rag_index['chunks']
    
    # Score all chunks
    scored_chunks = []
    for chunk in chunks:
        score = calculate_relevance_score(query_tokens, chunk)
        if score > 0:
            scored_chunks.append((score, chunk))
    
    # Sort by score and return top_k
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored_chunks[:top_k]]


def build_context_prompt(chunks: list[dict]) -> str:
    """Build context section from retrieved chunks."""
    if not chunks:
        return ""
    
    context_parts = ["Here is relevant information from the documentation:\n"]
    
    for i, chunk in enumerate(chunks, 1):
        title = chunk.get('title', 'Unknown')
        source = chunk.get('source', '')
        content = chunk.get('content', '')
        
        context_parts.append(f"--- Document {i}: {title} ---")
        if source:
            context_parts.append(f"Source: {source}")
        context_parts.append(content)
        context_parts.append("")
    
    return "\n".join(context_parts)


def create_response(
    status_code: int,
    body: dict[str, Any],
    cors_origin: str = '*'
) -> dict[str, Any]:
    """Create API Gateway response with CORS headers."""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': cors_origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
        'body': json.dumps(body)
    }


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda handler with RAG support.
    
    Request body:
    {
        "message": "User's question",
        "history": [...],
        "useRag": true  // Optional, default true
    }
    """
    cors_origin = os.environ.get('CORS_ALLOW_ORIGIN', '*')
    
    # Handle CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return create_response(200, {'message': 'OK'}, cors_origin)
    
    if event.get('httpMethod') != 'POST':
        return create_response(405, {'error': 'Method Not Allowed'}, cors_origin)
    
    try:
        body = json.loads(event.get('body', '{}'))
        user_message = body.get('message', '').strip()
        history = body.get('history', [])
        use_rag = body.get('useRag', True)
        
        if not user_message:
            return create_response(400, {'error': 'Message is required'}, cors_origin)
        
        # Retrieve relevant context if RAG is enabled
        context_prompt = ""
        sources = []
        
        if use_rag:
            relevant_chunks = retrieve_relevant_chunks(user_message, RAG_TOP_K)
            if relevant_chunks:
                context_prompt = build_context_prompt(relevant_chunks)
                sources = [
                    {
                        'title': c.get('title', ''),
                        'slug': c.get('slug', ''),
                        'source': c.get('source', '')
                    }
                    for c in relevant_chunks
                ]
        
        # Build system prompt with context
        full_system_prompt = SYSTEM_PROMPT
        if context_prompt:
            full_system_prompt = f"{SYSTEM_PROMPT}\n\n{context_prompt}"
        
        # Build conversation messages
        messages = []
        
        for msg in history:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            if role in ('user', 'assistant') and content:
                messages.append({
                    'role': role,
                    'content': [{'text': content}]
                })
        
        messages.append({
            'role': 'user',
            'content': [{'text': user_message}]
        })
        
        # Call Bedrock Converse API
        response = bedrock_runtime.converse(
            modelId=MODEL_ID,
            messages=messages,
            system=[{'text': full_system_prompt}],
            inferenceConfig={
                'maxTokens': MAX_TOKENS,
                'temperature': 0.7,
                'topP': 0.9
            }
        )
        
        # Extract response text
        ai_response = ''
        output_message = response.get('output', {}).get('message', {})
        for content_block in output_message.get('content', []):
            if 'text' in content_block:
                ai_response += content_block['text']
        
        result = {
            'message': ai_response.strip(),
        }
        
        # Include sources if RAG was used
        if sources:
            result['sources'] = sources
        
        return create_response(200, result, cors_origin)
        
    except json.JSONDecodeError:
        return create_response(400, {'error': 'Invalid JSON'}, cors_origin)
    except boto3.exceptions.Boto3Error as e:
        print(f'Bedrock error: {e}')
        return create_response(500, {'error': 'AI service error'}, cors_origin)
    except Exception as e:
        print(f'Unexpected error: {e}')
        return create_response(500, {'error': 'Internal server error'}, cors_origin)

