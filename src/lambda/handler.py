"""
AWS Lambda Handler for Nova AI Chat

This Lambda function integrates with Amazon Bedrock to provide
AI-powered chat responses using Amazon Nova models.

Environment Variables:
    - MODEL_ID: Bedrock model ID (default: amazon.nova-micro-v1:0)
    - MAX_TOKENS: Maximum tokens in response (default: 1024)
    - SYSTEM_PROMPT: System prompt for the AI
    - CORS_ALLOW_ORIGIN: Allowed origin for CORS (default: *)
    - AWS_REGION: AWS region for Bedrock (default: us-east-1)
"""

import json
import os
from typing import Any

import boto3

# Initialize Bedrock client
bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name=os.environ.get('AWS_REGION', 'us-east-1')
)

# Configuration
MODEL_ID = os.environ.get('MODEL_ID', 'amazon.nova-micro-v1:0')
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', '1024'))
SYSTEM_PROMPT = os.environ.get(
    'SYSTEM_PROMPT',
    'You are a helpful AI assistant. Answer questions concisely and accurately.'
)


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
    Lambda handler for Nova AI Chat.
    
    Expected request body:
    {
        "message": "User's question",
        "history": [
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ]
    }
    
    Response:
    {
        "message": "AI response"
    }
    """
    cors_origin = os.environ.get('CORS_ALLOW_ORIGIN', '*')
    
    # Handle CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return create_response(200, {'message': 'OK'}, cors_origin)
    
    # Only accept POST
    if event.get('httpMethod') != 'POST':
        return create_response(405, {'error': 'Method Not Allowed'}, cors_origin)
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        user_message = body.get('message', '').strip()
        history = body.get('history', [])
        
        if not user_message:
            return create_response(400, {'error': 'Message is required'}, cors_origin)
        
        # Build conversation messages
        messages = []
        
        # Add conversation history
        for msg in history:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            if role in ('user', 'assistant') and content:
                messages.append({
                    'role': role,
                    'content': [{'text': content}]
                })
        
        # Add current user message
        messages.append({
            'role': 'user',
            'content': [{'text': user_message}]
        })
        
        # Call Bedrock Converse API
        response = bedrock_runtime.converse(
            modelId=MODEL_ID,
            messages=messages,
            system=[{'text': SYSTEM_PROMPT}],
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
        
        return create_response(200, {'message': ai_response.strip()}, cors_origin)
        
    except json.JSONDecodeError:
        return create_response(400, {'error': 'Invalid JSON'}, cors_origin)
    except boto3.exceptions.Boto3Error as e:
        print(f'Bedrock error: {e}')
        return create_response(500, {'error': 'AI service error'}, cors_origin)
    except Exception as e:
        print(f'Unexpected error: {e}')
        return create_response(500, {'error': 'Internal server error'}, cors_origin)

