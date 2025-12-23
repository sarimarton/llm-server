# LLM Server

OpenAI-compatible API proxy for MacWhisper integration, with support for LibreTranslate and Claude CLI backends.

## Quick Start

```bash
make start
```

A `make start` automatikusan futtatja az `npm install`-t ha szükséges.

## MacWhisper Configuration

### Option 1: LibreTranslate (requires Docker)

| Setting    | Value                                   |
|------------|-----------------------------------------|
| Name       | LibreTranslate                          |
| Base URL   | http://localhost:8080/libretranslate/v1 |
| API Key    | dummy (any value works)                 |
| Model Name | libretranslate                          |

### Option 2: Claude CLI (requires `claude` command)

| Setting    | Value                            |
|------------|----------------------------------|
| Name       | Claude                           |
| Base URL   | http://localhost:8080/claude/v1  |
| API Key    | dummy (any value works)          |
| Model Name | claude                           |

## Commands

- `make start` - Start LibreTranslate Docker + proxy server
- `make stop` - Stop all services
- `make clean` - Remove Docker container

## Requirements

- Node.js 18+
- Docker (for LibreTranslate backend)
- Claude CLI (for Claude backend) - install via `npm install -g @anthropic-ai/claude-code`
