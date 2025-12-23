.PHONY: all start start-claude stop clean libretranslate check-docker help

DOCKER_NAME = libretranslate-server
PROXY_PORT = 8080
LIBRETRANSLATE_PORT = 5001

help:
	@echo "LLM Translator - OpenAI-compatible API proxy"
	@echo ""
	@echo "Commands:"
	@echo "  make start        - Start with LibreTranslate backend (requires Docker)"
	@echo "  make start-claude - Start with Claude CLI backend only (no Docker)"
	@echo "  make stop         - Stop all services"
	@echo "  make clean        - Remove Docker container and node_modules"
	@echo ""
	@echo "Backends:"
	@echo "  /libretranslate/v1  - Uses LibreTranslate Docker container"
	@echo "  /claude/v1          - Uses Claude CLI (claude -p)"
	@echo ""

all: start

# Install dependencies
node_modules: package.json
	npm install

# Check Docker availability and start if needed
check-docker:
	@if ! command -v docker >/dev/null 2>&1; then \
		echo ""; \
		echo "ERROR: Docker is not installed."; \
		echo ""; \
		echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop/"; \
		echo "Or use 'make start-claude' to run without Docker (Claude CLI only)."; \
		echo ""; \
		exit 1; \
	fi
	@if ! docker info >/dev/null 2>&1; then \
		echo "Docker is not running. Attempting to start Docker Desktop..."; \
		open -a Docker 2>/dev/null || (echo "Could not start Docker Desktop automatically." && exit 1); \
		echo "Waiting for Docker to start (this may take up to 60 seconds)..."; \
		for i in 1 2 3 4 5 6 7 8 9 10 11 12; do \
			if docker info >/dev/null 2>&1; then \
				echo "Docker is now running."; \
				break; \
			fi; \
			if [ $$i -eq 12 ]; then \
				echo ""; \
				echo "ERROR: Docker failed to start within 60 seconds."; \
				echo "Please start Docker Desktop manually and try again."; \
				echo ""; \
				exit 1; \
			fi; \
			sleep 5; \
		done; \
	fi

# Start LibreTranslate in Docker (background)
libretranslate: check-docker
	@echo "Starting LibreTranslate Docker container..."
	@docker rm -f $(DOCKER_NAME) 2>/dev/null || true
	@docker run -d --name $(DOCKER_NAME) -p $(LIBRETRANSLATE_PORT):5000 \
		libretranslate/libretranslate --load-only en,hu
	@echo "Waiting for LibreTranslate to initialize..."
	@sleep 5
	@echo "LibreTranslate running on port $(LIBRETRANSLATE_PORT)"

# Start with LibreTranslate (full setup)
start: node_modules libretranslate
	@node server.js

# Start without Docker (Claude CLI only)
start-claude: node_modules
	@echo ""
	@echo "Starting server (Claude CLI backend only)..."
	@echo "Note: LibreTranslate endpoints will not work without Docker"
	@echo ""
	@node server.js

# Stop all services
stop:
	@echo "Stopping services..."
	@docker stop $(DOCKER_NAME) 2>/dev/null || true
	@pkill -f "node server.js" 2>/dev/null || true
	@echo "Services stopped."

# Clean up
clean: stop
	@docker rm -f $(DOCKER_NAME) 2>/dev/null || true
	@rm -rf node_modules
	@echo "Cleaned up."
