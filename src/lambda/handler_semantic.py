"""
AWS Lambda Handler with Semantic Search (Vector Embeddings)

Uses Amazon Bedrock Titan Embeddings for semantic similarity search
and Nova models for response generation.

Environment Variables:
    - MODEL_ID: Chat model ID (default: amazon.nova-micro-v1:0)
    - EMBEDDING_MODEL_ID: Embedding model (default: amazon.titan-embed-text-v2:0)
    - MAX_TOKENS: Max response tokens (default: 1024)
    - SYSTEM_PROMPT: System prompt
    - CORS_ALLOW_ORIGIN: CORS origin
    - RAG_INDEX_BUCKET: S3 bucket for embeddings index
    - RAG_INDEX_KEY: S3 key for index file
    - RAG_TOP_K: Number of results (default: 5)
    - SIMILARITY_THRESHOLD: Min similarity score (default: 0.5)
"""

import json
import os
import math
from typing import Any
from functools import lru_cache

import boto3

# Initialize clients
bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name=os.environ.get('AWS_REGION', 'us-east-1')
)

s3_client = boto3.client('s3') if os.environ.get('RAG_INDEX_BUCKET') else None

# Configuration
MODEL_ID = os.environ.get('MODEL_ID', 'amazon.nova-micro-v1:0')
EMBEDDING_MODEL_ID = os.environ.get('EMBEDDING_MODEL_ID', 'amazon.titan-embed-text-v2:0')
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', '1024'))
RAG_TOP_K = int(os.environ.get('RAG_TOP_K', '5'))
SIMILARITY_THRESHOLD = float(os.environ.get('SIMILARITY_THRESHOLD', '0.5'))

DEFAULT_SYSTEM_PROMPT = """You are a helpful AI assistant for a technical documentation site.
Use the provided context from the documentation to answer questions accurately.
If the context doesn't contain relevant information, say so and provide general guidance.
Always be concise and cite specific documentation sections when possible."""

SYSTEM_PROMPT = os.environ.get('SYSTEM_PROMPT', DEFAULT_SYSTEM_PROMPT)

# Cache for embeddings index
_embeddings_cache = None


def generate_embedding(text: str) -> list[float]:
    """Generate embedding vector for text using Titan Embeddings."""
    response = bedrock_runtime.invoke_model(
        modelId=EMBEDDING_MODEL_ID,
        contentType='application/json',
        accept='application/json',
        body=json.dumps({'inputText': text[:8000]})
    )
    
    result = json.loads(response['body'].read())
    return result['embedding']


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return dot_product / (norm_a * norm_b)


def load_embeddings_index():
    """Load embeddings index from S3."""
    global _embeddings_cache
    
    if _embeddings_cache is not None:
        return _embeddings_cache
    
    bucket = os.environ.get('RAG_INDEX_BUCKET')
    key = os.environ.get('RAG_INDEX_KEY', 'rag-index-embeddings.json')
    
    if bucket and s3_client:
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            _embeddings_cache = json.loads(response['Body'].read().decode('utf-8'))
            print(f"Loaded embeddings index: {len(_embeddings_cache.get('chunks', []))} chunks")
            return _embeddings_cache
        except Exception as e:
            print(f"Error loading embeddings: {e}")
    
    # Try local file
    local_path = os.environ.get('RAG_INDEX_LOCAL', '/var/task/rag-index-embeddings.json')
    if os.path.exists(local_path):
        with open(local_path, 'r', encoding='utf-8') as f:
            _embeddings_cache = json.load(f)
            return _embeddings_cache
    
    return None


def semantic_search(query: str, top_k: int = 5, threshold: float = 0.5) -> list[dict]:
    """
    Perform semantic search using vector similarity.
    
    Returns list of relevant chunks sorted by similarity.
    """
    index = load_embeddings_index()
    
    if not index or 'chunks' not in index:
        return []
    
    # Generate query embedding
    query_embedding = generate_embedding(query)
    
    # Calculate similarities
    results = []
    for chunk in index['chunks']:
        if 'embedding' not in chunk or not chunk['embedding']:
            continue
        
        similarity = cosine_similarity(query_embedding, chunk['embedding'])
        
        if similarity >= threshold:
            results.append({
                'chunk': chunk,
                'similarity': similarity,
            })
    
    # Sort by similarity (descending)
    results.sort(key=lambda x: x['similarity'], reverse=True)
    
    # Return top_k results
    return [
        {
            'id': r['chunk']['id'],
            'title': r['chunk'].get('title', ''),
            'slug': r['chunk'].get('slug', ''),
            'source': r['chunk'].get('source', ''),
            'content': r['chunk'].get('content', ''),
            'similarity': round(r['similarity'], 4),
        }
        for r in results[:top_k]
    ]


def build_context_prompt(results: list[dict]) -> str:
    """Build context section from search results."""
    if not results:
        return ""
    
    parts = ["Here is relevant information from the documentation:\n"]
    
    for i, r in enumerate(results, 1):
        parts.append(f"--- Document {i}: {r['title']} (relevance: {r['similarity']:.0%}) ---")
        if r['source']:
            parts.append(f"Source: {r['source']}")
        parts.append(r['content'])
        parts.append("")
    
    return "\n".join(parts)


def create_response(status_code: int, body: dict[str, Any], cors_origin: str = '*') -> dict:
    """Create API Gateway response."""
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
    Lambda handler with semantic search.
    
    Request:
    {
        "message": "How do I deploy?",
        "history": [...],
        "useRag": true
    }
    
    Response:
    {
        "message": "...",
        "sources": [{"title": "...", "slug": "...", "similarity": 0.85}]
    }
    """
    cors_origin = os.environ.get('CORS_ALLOW_ORIGIN', '*')
    
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
        
        # Semantic search
        context_prompt = ""
        sources = []
        
        if use_rag:
            search_results = semantic_search(
                user_message,
                top_k=RAG_TOP_K,
                threshold=SIMILARITY_THRESHOLD
            )
            
            if search_results:
                context_prompt = build_context_prompt(search_results)
                sources = [
                    {
                        'title': r['title'],
                        'slug': r['slug'],
                        'source': r['source'],
                        'similarity': r['similarity'],
                    }
                    for r in search_results
                ]
        
        # Build system prompt
        full_system_prompt = SYSTEM_PROMPT
        if context_prompt:
            full_system_prompt = f"{SYSTEM_PROMPT}\n\n{context_prompt}"
        
        # Build messages
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
        
        # Call Nova
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
        
        # Extract response
        ai_response = ''
        output_msg = response.get('output', {}).get('message', {})
        for block in output_msg.get('content', []):
            if 'text' in block:
                ai_response += block['text']
        
        result = {'message': ai_response.strip()}
        if sources:
            result['sources'] = sources
        
        return create_response(200, result, cors_origin)
        
    except json.JSONDecodeError:
        return create_response(400, {'error': 'Invalid JSON'}, cors_origin)
    except boto3.exceptions.Boto3Error as e:
        print(f'AWS error: {e}')
        return create_response(500, {'error': 'AI service error'}, cors_origin)
    except Exception as e:
        print(f'Error: {e}')
        return create_response(500, {'error': 'Internal server error'}, cors_origin)

