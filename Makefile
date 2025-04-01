# Variables
PROJECT_NAME := smarter-vscode-yaml
SRC_DIR := src
DIST_DIR := dist

# Default target
.DEFAULT_GOAL := help

# Help target
help:
	@echo "Available targets:"
	@echo "  init	- Install dependencies and prepare the environment"
	@echo "  test	- Run tests"
	@echo "  build	- Build the project"
	@echo "  deploy	- Deploy the project"

# Initialize the project
init:
	@echo "Initializing the project..."
	npm install

# Run tests
test:
	@echo "Running tests..."
	npm test

# Build the project
build:
	@echo "Building the project..."
	npm run build

# Deploy the project
deploy:
	@echo "Deploying the project..."
	@echo "Deploy logic goes here (e.g., publishing to a registry or uploading files)"

# Clean up build artifacts
clean:
	@echo "Cleaning up..."
	rm -rf $(DIST_DIR)
	