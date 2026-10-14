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
	@echo "  test-integration	- Run the integration tests in VS Code"
	@echo "  contracts	- Copy the api contract from ../smarter (SMARTER_REF=<git ref> to read a ref)"
	@echo "  build	- Build the project"
	@echo "  deploy	- Deploy the project"

analyze:
	cloc . --exclude-ext=svg,zip,json --fullpath --not-match-d=smarter/smarter/static/assets/ --vcs=git

# Initialize the project
init:
	@echo "Initializing the project..."
	rm -rf node_modules && \
	NODE_ENV=development npm ci && \
	mkdir -p .pypi_cache && \
	$(PYTHON) -m venv venv && \
	$(ACTIVATE_VENV) && \
	PIP_CACHE_DIR=.pypi_cache $(PIP) install --upgrade pip && \
	PIP_CACHE_DIR=.pypi_cache $(PIP) install -r requirements/local.txt && \
	pre-commit install && \
	pre-commit install --hook-type commit-msg && \
	pre-commit autoupdate

# Run tests
test:
	@echo "Running tests..."
	npm test

# Run the integration tests in VS Code
test-integration:
	npm run test:integration

# Copy the smarter platform's api contract from ../smarter, and regenerate the api's types
contracts:
	scripts/sync-contracts.sh ../smarter $(SMARTER_REF)
	npm run contract:types

# Build the project
build:
	@echo "Building the project..."
	npm run build

change-log:
	@echo "Generating changelog..."
	npx conventional-changelog -p angular -i CHANGELOG.md -s

# https://marketplace.visualstudio.com/manage/publishers/querium/
package:
	@echo "Packaging the project..." && \
	rm -rf node_modules dist && \
	NODE_ENV=development npm ci && \
	npm run build && \
	npm run package

package-list:
	vsce ls
# Deploy the project
release:
	npx vsce package
	npx vsce publish


# Clean up build artifacts
#
clean:
	@echo "Cleaning up..."
	rm -rf $(DIST_DIR)
