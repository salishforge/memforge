"""MemForge Python SDK — LLM tool definitions.

Provides tool schemas for OpenAI function calling and Anthropic tool use.

Usage:
    from memforge.tools import openai_tools, anthropic_tools

    # OpenAI
    response = openai.chat.completions.create(tools=openai_tools(), ...)

    # Anthropic
    response = anthropic.messages.create(tools=anthropic_tools(), ...)
"""

from __future__ import annotations

from typing import Any


def _base_tools() -> list[dict[str, Any]]:
    """Base tool definitions in Anthropic format."""
    return [
        {
            "name": "memforge_add",
            "description": "Store a memory event for an agent. Returns the created memory ID.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string", "description": "Agent identifier"},
                    "content": {"type": "string", "description": "Memory content to store"},
                    "metadata": {"type": "object", "description": "Optional metadata"},
                    "outcome_type": {"type": "string", "enum": ["neutral", "error", "success", "decision", "observation"]},
                },
                "required": ["agent_id", "content"],
            },
        },
        {
            "name": "memforge_query",
            "description": "Search an agent's memory. Returns ranked results by relevance.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string", "description": "Agent identifier"},
                    "q": {"type": "string", "description": "Search query text"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 200, "default": 10},
                    "mode": {"type": "string", "enum": ["keyword", "semantic", "hybrid", "code"]},
                    "max_tokens": {"type": "integer", "minimum": 1, "description": "Token budget for results"},
                },
                "required": ["agent_id", "q"],
            },
        },
        {
            "name": "memforge_consolidate",
            "description": "Consolidate hot-tier events into searchable warm-tier memories.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"},
                    "mode": {"type": "string", "enum": ["concat", "summarize"]},
                },
                "required": ["agent_id"],
            },
        },
        {
            "name": "memforge_active_recall",
            "description": "Proactively surface relevant memories and procedures for a given context.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"},
                    "context": {"type": "string", "description": "What the agent is about to do"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 20, "default": 5},
                },
                "required": ["agent_id", "context"],
            },
        },
        {
            "name": "memforge_resume",
            "description": "Get session resumption context: recent memories, procedures, contradictions.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 20, "default": 5},
                },
                "required": ["agent_id"],
            },
        },
        {
            "name": "memforge_feedback",
            "description": "Record whether retrieved memories were helpful (positive/negative/neutral).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"},
                    "retrieval_ids": {"type": "array", "items": {"type": "integer"}},
                    "outcome": {"type": "string", "enum": ["positive", "negative", "neutral"]},
                },
                "required": ["agent_id", "retrieval_ids", "outcome"],
            },
        },
        {
            "name": "memforge_sleep",
            "description": "Run a sleep cycle: score, triage, revise, maintain graph, reflect.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"},
                    "token_budget": {"type": "integer", "maximum": 200000},
                },
                "required": ["agent_id"],
            },
        },
        {
            "name": "memforge_health",
            "description": "Get memory health metrics: importance, confidence, revision velocity.",
            "input_schema": {
                "type": "object",
                "properties": {"agent_id": {"type": "string"}},
                "required": ["agent_id"],
            },
        },
        {
            "name": "memforge_stats",
            "description": "Get memory tier statistics: hot, warm, cold counts.",
            "input_schema": {
                "type": "object",
                "properties": {"agent_id": {"type": "string"}},
                "required": ["agent_id"],
            },
        },
    ]


def anthropic_tools() -> list[dict[str, Any]]:
    """Tool definitions in Anthropic format for Claude tool use."""
    return _base_tools()


def openai_tools() -> list[dict[str, Any]]:
    """Tool definitions in OpenAI function calling format."""
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            },
        }
        for tool in _base_tools()
    ]
