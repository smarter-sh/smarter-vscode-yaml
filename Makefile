SHELL := /bin/bash
PROJECT_NAME := smarter-vscode-yaml
SRC_DIR := src
DIST_DIR := dist
.DEFAULT_GOAL := help

export PATH := /usr/local/bin:$(PATH)
export

ifeq ($(OS),Windows_NT)
    PYTHON := python.exe
    ACTIVATE_VENV := venv\Scripts\activate
else
    PYTHON := python3.12
    ACTIVATE_VENV := source venv/bin/activate
endif
PIP := $(PYTHON) -m pip

ifneq ("$(wildcard .env)","")
else
	@touch .env
endif
include .env

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
	npm install && \
	mkdir -p .pypi_cache && \
	$(PYTHON) -m venv venv && \
	$(ACTIVATE_VENV) && \
	PIP_CACHE_DIR=.pypi_cache $(PIP) install --upgrade pip && \
	PIP_CACHE_DIR=.pypi_cache $(PIP) install -r requirements/local.txt && \
	pre-commit install && \
	pre-commit autoupdate

# Run tests
test:
	@echo "Running tests..."
	npm test

# Build the project
build:
	@echo "Building the project..."
	npm run build

# https://marketplace.visualstudio.com/manage/publishers/querium/
package:
	@echo "Packaging the project..." && \
	rm -rf node_modules dist package-lock.json && \
	npm install && \
	npm run build && \
	npm run package

package-list:
	vsce ls
# Deploy the project
deploy:
	@echo "Deploying the project..."
	@echo "Deploy logic goes here (e.g., publishing to a registry or uploading files)"

# Clean up build artifacts
clean:
	@echo "Cleaning up..."
	rm -rf $(DIST_DIR)
