.PHONY: all install start start-claude stop clean libretranslate check-docker check-tailscale setup-tailscale help

DOCKER_NAME = libretranslate-server
LIBRETRANSLATE_PORT = 5001

help:
	@echo ""
	@echo "LLM Server - OpenAI-compatible API proxy"
	@echo ""
	@echo "Setup:"
	@echo "  make install          - Install dependencies and configure Tailscale"
	@echo ""
	@echo "Run:"
	@echo "  make start            - Start with LibreTranslate backend (requires Docker)"
	@echo "  make start-claude     - Start with Claude CLI backend only (no Docker)"
	@echo ""
	@echo "Other:"
	@echo "  make stop             - Stop all services"
	@echo "  make clean            - Remove Docker container and node_modules"
	@echo "  make setup-tailscale  - Configure Tailscale serve (for HTTPS)"
	@echo "  make check-tailscale  - Check Tailscale installation status"
	@echo ""
	@echo "Backends:"
	@echo "  /libretranslate/v1    - Uses LibreTranslate Docker container"
	@echo "  /claude/v1            - Uses Claude CLI (claude -p)"
	@echo ""

all: start

# ============================================================================
# Installation
# ============================================================================

node_modules: package.json
	npm install

install: node_modules check-tailscale
	@echo ""
	@echo "Installation complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  make start-claude   - Start server (Claude only)"
	@echo "  make start          - Start server (with LibreTranslate, requires Docker)"
	@echo ""

# ============================================================================
# Tailscale
# ============================================================================

check-tailscale:
	@echo ""
	@echo "Checking Tailscale..."
	@if [ "$$(uname)" = "Darwin" ]; then \
		if [ -d "/Applications/Tailscale.app" ]; then \
			echo "✓ Tailscale is installed"; \
			if /Applications/Tailscale.app/Contents/MacOS/Tailscale status >/dev/null 2>&1; then \
				echo "✓ Tailscale is running"; \
				echo ""; \
				echo "Tailscale IP: $$(/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4 2>/dev/null)"; \
			else \
				echo "⚠ Tailscale is not running"; \
				echo "  Start it from the menu bar or run: open -a Tailscale"; \
			fi; \
		else \
			echo "⚠ Tailscale is not installed"; \
			echo ""; \
			echo "To install Tailscale on macOS:"; \
			echo ""; \
			echo "  Option 1: Download from website"; \
			echo "    https://tailscale.com/download/mac"; \
			echo ""; \
			echo "  Option 2: Install via Homebrew"; \
			echo "    brew install --cask tailscale"; \
			echo ""; \
			echo "After installation:"; \
			echo "  1. Open Tailscale from Applications"; \
			echo "  2. Sign in with your account"; \
			echo "  3. Run 'make setup-tailscale' to enable HTTPS"; \
			echo ""; \
		fi; \
	else \
		if command -v tailscale >/dev/null 2>&1; then \
			echo "✓ Tailscale is installed"; \
			if tailscale status >/dev/null 2>&1; then \
				echo "✓ Tailscale is running"; \
				echo ""; \
				echo "Tailscale IP: $$(tailscale ip -4 2>/dev/null)"; \
			else \
				echo "⚠ Tailscale is not running"; \
				echo "  Run: sudo tailscale up"; \
			fi; \
		else \
			echo "⚠ Tailscale is not installed"; \
			echo ""; \
			echo "To install Tailscale on Linux:"; \
			echo "  curl -fsSL https://tailscale.com/install.sh | sh"; \
			echo ""; \
			echo "Then run: sudo tailscale up"; \
			echo ""; \
		fi; \
	fi
	@echo ""

setup-tailscale: node_modules
	@node src/index.js --setup-tailscale

# ============================================================================
# Docker (LibreTranslate)
# ============================================================================

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

libretranslate: check-docker
	@echo "Starting LibreTranslate Docker container..."
	@docker rm -f $(DOCKER_NAME) 2>/dev/null || true
	@docker run -d --name $(DOCKER_NAME) -p $(LIBRETRANSLATE_PORT):5000 \
		libretranslate/libretranslate --load-only en,hu
	@echo "Waiting for LibreTranslate to initialize..."
	@sleep 5
	@echo "LibreTranslate running on port $(LIBRETRANSLATE_PORT)"

# ============================================================================
# Server
# ============================================================================

start: node_modules libretranslate
	@node src/index.js

start-claude: node_modules
	@echo ""
	@echo "Starting server (Claude CLI backend only)..."
	@echo "Note: LibreTranslate endpoints will not work without Docker"
	@echo ""
	@node src/index.js

# ============================================================================
# Cleanup
# ============================================================================

stop:
	@echo "Stopping services..."
	@docker stop $(DOCKER_NAME) 2>/dev/null || true
	@pkill -f "node src/index.js" 2>/dev/null || true
	@echo "Services stopped."

clean: stop
	@docker rm -f $(DOCKER_NAME) 2>/dev/null || true
	@rm -rf node_modules
	@echo "Cleaned up."
