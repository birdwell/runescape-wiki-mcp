#!/bin/bash

echo "Starting RuneScape Wiki MCP Server in DEBUG mode..."
echo "========================================"
echo ""
echo "Debug logs will appear below:"
echo ""

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Start the server with debug enabled and redirect stderr to a file
DEBUG=true node dist/index.js 2> debug.log 