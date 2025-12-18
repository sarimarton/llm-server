.PHONY: all start stop clean libretranslate help

DOCKER_NAME = libretranslate-server
PROXY_PORT = 8080
LIBRETRANSLATE_PORT = 5001

help:
	@echo "LibreTranslate OpenAI Proxy"
	@echo ""
	@echo "Commands:"
	@echo "  make start    - Start LibreTranslate and proxy server"
	@echo "  make stop     - Stop all services"
	@echo "  make clean    - Remove Docker container and node_modules"
	@echo ""

all: start

# Install dependencies
node_modules: package.json
	npm install

# Start LibreTranslate in Docker (background)
libretranslate:
	@echo "Starting LibreTranslate Docker container..."
	@docker rm -f $(DOCKER_NAME) 2>/dev/null || true
	@docker run -d --name $(DOCKER_NAME) -p $(LIBRETRANSLATE_PORT):5000 \
		libretranslate/libretranslate --load-only en,hu
	@echo "Waiting for LibreTranslate to initialize..."
	@sleep 5
	@echo "LibreTranslate running on port $(LIBRETRANSLATE_PORT)"

# Start everything
start: node_modules libretranslate
	@echo ""
	@echo "=============================================="
	@echo "MacWhisper Configuration:"
	@echo "=============================================="
	@echo "  Name:       LibreTranslate"
	@echo "  Base URL:   http://localhost:$(PROXY_PORT)/v1"
	@echo "  API Key:    dummy"
	@echo "  Model Name: libretranslate"
	@echo "=============================================="
	@echo ""
	@echo "Starting proxy server (Ctrl+C to stop)..."
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
