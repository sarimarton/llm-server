# LLM Translator

OpenAI-compatible API proxy for LibreTranslate, designed for MacWhisper integration.

## Quick Start

```bash
make start
```

A `make start` automatikusan futtatja az `npm install`-t ha szükséges.

## MacWhisper Configuration

| Setting    | Value                         |
|------------|-------------------------------|
| Name       | LibreTranslate                |
| Base URL   | http://localhost:8080/v1      |
| API Key    | dummy (any value works)       |
| Model Name | libretranslate                |

## Commands

- `make start` - Start LibreTranslate Docker + proxy server
- `make stop` - Stop all services
- `make clean` - Remove Docker container

## Requirements

- Docker
- Node.js 18+
