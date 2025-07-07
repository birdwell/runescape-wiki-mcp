# Debugging Guide for MCP Servers

## Overview

MCP (Model Context Protocol) servers communicate via stdio (standard input/output), which can make debugging challenging. This guide provides multiple approaches to debug issues.

## 1. Enable Debug Logging

### Quick Start
```bash
# Run with debug logging enabled
npm run debug

# Or manually:
DEBUG=true node dist/index.js
```

### What Gets Logged
- All API requests and responses
- Tool invocations with parameters
- Success/failure status of operations
- Error details with stack traces

Debug logs are written to stderr, so they won't interfere with the MCP protocol on stdout.

## 2. Using MCP Inspector

The MCP Inspector provides a visual interface for testing your server:

```bash
# Install globally
npm install -g @modelcontextprotocol/inspector

# Run your server with the inspector
npx @modelcontextprotocol/inspector node dist/index.js

# Or use the npm script
npm run inspector
```

The inspector allows you to:
- View all available tools and resources
- Make test calls with custom parameters
- See real-time request/response data
- Inspect error messages and stack traces

## 3. Common Debugging Scenarios

### API 404 Errors

When you see "API request failed: 404 Not found":

1. Check the URL being requested in debug logs
2. Verify the API endpoint exists
3. Test the endpoint manually:
   ```bash
   curl -H "User-Agent: RuneScape Wiki MCP" \
        "https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json?item=18830"
   ```

### Finding Item IDs

For items like Frost Dragon Bones:
1. Use the `search_items` tool with appropriate category
2. Browse categories using `get_category_info`
3. Check the official RuneScape Wiki for item IDs

### Server Won't Start

If the server fails to start:
1. Check for build errors: `npm run build`
2. Look for port conflicts (MCP uses stdio, not ports)
3. Verify Node.js version: `node --version` (requires >= 18.0.0)

## 4. Testing Tools

### Direct Testing
```bash
# Test a specific tool directly
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_item_price","arguments":{"itemId":4151}},"id":1}' | node dist/index.js
```

### Unit Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/priceTools.test.ts

# Run with coverage
npm run test:coverage
```

## 5. Adding Custom Debug Points

Add debug logging to any function:

```typescript
import { debugLog } from './utils.js';

export async function someFunction(params: any) {
    debugLog('Function called', params);
    
    try {
        // Your code here
        const result = await doSomething();
        debugLog('Function succeeded', result);
        return result;
    } catch (error) {
        debugLog('Function failed', error);
        throw error;
    }
}
```

## 6. Troubleshooting Tips

1. **Server crashes immediately**: Check for syntax errors in the build
2. **Tools not appearing**: Ensure they're exported in the tools index
3. **Unexpected responses**: Use debug mode to see actual API responses
4. **Timeout errors**: RS3 APIs can be slow, consider adding retry logic

## 7. Monitoring in Production

For production debugging:
1. Redirect stderr to a log file: `npm start 2> debug.log`
2. Use environment variables for different log levels
3. Consider adding timestamps and request IDs for tracking

## Example Debug Session

```bash
# Terminal 1: Start server with debugging
DEBUG=true npm start 2> debug.log

# Terminal 2: Tail the debug log
tail -f debug.log

# Terminal 3: Use your MCP client (Claude, etc.)
# Make requests and watch the logs
```

## Need Help?

1. Check the debug logs first
2. Verify API endpoints are accessible
3. Test with the MCP Inspector
4. Check the official RuneScape API documentation
5. Review the test files for examples 