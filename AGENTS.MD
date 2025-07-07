# RuneScape Wiki MCP Server - Agent Instructions

## Overview

This MCP (Model Context Protocol) server provides access to RuneScape 3 (RS3) Grand Exchange prices, item data, and player statistics through the official RuneScape APIs. This guide contains everything you need to know to operate and troubleshoot the server.

## Architecture

### Server Structure
```
runescape-wiki-mcp/
├── src/
│   ├── index.ts          # Entry point
│   ├── server.ts         # MCP server setup
│   ├── constants.ts      # API endpoints and configuration
│   ├── utils.ts          # Helper functions and logging
│   ├── resources.ts      # MCP resources (data endpoints)
│   ├── types.ts          # TypeScript types
│   └── tools/
│       ├── index.ts      # Tool aggregator
│       ├── priceTools.ts # Grand Exchange price tools
│       ├── itemTools.ts  # Item information tools
│       └── playerTools.ts # Player statistics tools
```

### Communication
- MCP servers communicate via **stdio** (standard input/output)
- Requests come in on stdin as JSON-RPC
- Responses go out on stdout
- Debug logs go to stderr (won't interfere with protocol)

## Available Tools

### 1. Price Tools (`priceTools.ts`)

#### `get_item_price`
Get current Grand Exchange price for a specific item.
```json
{
  "name": "get_item_price",
  "arguments": {
    "itemId": 18832  // Frost Dragon Bones
  }
}
```

#### `get_ge_info`
Get Grand Exchange database information including last update.
```json
{
  "name": "get_ge_info",
  "arguments": {}
}
```

#### `get_category_info`
Get information about item categories.
```json
{
  "name": "get_category_info",
  "arguments": {
    "category": 1  // Category ID (1-32)
  }
}
```

#### `search_items`
Search for items by category and starting letter.
```json
{
  "name": "search_items",
  "arguments": {
    "category": 1,
    "alpha": "f",  // Use "#" for numbers
    "page": 1
  }
}
```

### 2. Item Tools (`itemTools.ts`)

#### `get_item_detail`
Get detailed item information from the official API.
```json
{
  "name": "get_item_detail",
  "arguments": {
    "itemId": 4151  // Abyssal whip
  }
}
```

#### `get_item_graph`
Get historical price data (last 180 days).
```json
{
  "name": "get_item_graph",
  "arguments": {
    "itemId": 4151
  }
}
```

#### `browse_items_by_category`
Browse items in the Grand Exchange catalogue.
```json
{
  "name": "browse_items_by_category",
  "arguments": {
    "category": 24,  // Category ID (0-43)
    "alpha": "a",    // Optional, default "a"
    "page": 1        // Optional, default 1
  }
}
```

### 3. Player Tools (`playerTools.ts`)

#### `get_player_stats`
Get player statistics from RS3 hiscores.
```json
{
  "name": "get_player_stats",
  "arguments": {
    "username": "Zezima",
    "gameMode": "normal"  // Options: "normal", "ironman", "hardcore"
  }
}
```

## API Endpoints

### Base URLs
- **Grand Exchange API**: `https://secure.runescape.com/m=itemdb_rs/api`
- **Hiscores API**: `https://secure.runescape.com/m=hiscore`

### Important Endpoints
1. **Item Details**: `/catalogue/detail.json?item={itemId}`
2. **Item Graph**: `/graph/{itemId}.json`
3. **Category Info**: `/catalogue/category.json?category={categoryId}`
4. **Search Items**: `/catalogue/items.json?category={cat}&alpha={letter}&page={page}`
5. **GE Info**: `/info.json`
6. **Player Stats**: `/{gameMode}/index_lite.ws?player={username}`

### User Agent Requirement
All API requests MUST include the User-Agent header:
```
User-Agent: RuneScape Wiki MCP Server - github.com/user/runescape-wiki-mcp
```

## Common Item IDs

```
Abyssal whip: 4151
Frost dragon bones: 18832
Dragon bones: 536
Baby dragon bones: 534
Bond: 29492
```

## Debugging

### 1. Enable Debug Mode
```bash
# Method 1: Using npm script
npm run debug

# Method 2: Environment variable
DEBUG=true node dist/index.js

# Method 3: Debug script
./debug-server.sh
```

### 2. Debug Output
When debug mode is enabled, you'll see:
- All API request URLs
- Response status codes
- Response data
- Tool invocations with parameters
- Error details with stack traces

### 3. Common Issues and Solutions

#### 404 Not Found
- **Cause**: Invalid item ID or API endpoint
- **Solution**: Verify item ID exists, check endpoint format
- **Debug**: Check the exact URL being requested in debug logs

#### No Response from Server
- **Cause**: Server not running or crashed
- **Solution**: 
  ```bash
  # Check if running
  ps aux | grep "node.*dist/index.js"
  
  # Restart
  npm run build && npm start
  ```

#### Tool Not Found
- **Cause**: Tool name typo or not exported
- **Solution**: Check exact tool names in the code
- **Available tools**: Check `src/tools/index.ts`

### 4. Testing API Endpoints
```bash
# Test item price endpoint
curl -H "User-Agent: RuneScape Wiki MCP Server - github.com/user/runescape-wiki-mcp" \
     "https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json?item=18832"

# Test GE info
curl -H "User-Agent: RuneScape Wiki MCP Server - github.com/user/runescape-wiki-mcp" \
     "https://secure.runescape.com/m=itemdb_rs/api/info.json"
```

## MCP Resources

The server provides two resources that can be read:

1. **`runescape://prices/latest`** - Grand Exchange database info
2. **`runescape://items/mapping`** - Item category information

## Server Management

### Starting the Server
```bash
# Build first
npm run build

# Normal start
npm start

# Debug mode
npm run debug

# With MCP Inspector
npm run inspector
```

### Stopping the Server
```bash
# Find process
ps aux | grep "node.*dist/index.js"

# Kill by PID
kill <PID>

# Kill all MCP processes
ps aux | grep "node.*dist/index.js" | grep -v grep | awk '{print $2}' | xargs kill
```

### Monitoring
```bash
# Watch debug logs
tail -f debug.log

# Check if server is responding
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

## Best Practices

1. **Always use debug mode during development**
   - Helps identify API issues quickly
   - Shows exact URLs and responses

2. **Handle API failures gracefully**
   - RS3 APIs can be slow or temporarily unavailable
   - Consider implementing retry logic

3. **Cache responses when appropriate**
   - GE prices update periodically, not real-time
   - Category info rarely changes

4. **Use proper item IDs**
   - Search for items first if ID unknown
   - Web search "RS3 {item name} item ID"

5. **Test with known working examples**
   - Abyssal whip (4151) for testing
   - Frost dragon bones (18832) for high-value items

## Quick Reference

### Find Item IDs
1. Use `search_items` with appropriate category and letter
2. Check RuneScape Wiki: `https://runescape.wiki/w/{Item_name}`
3. Use the official GE: `https://secure.runescape.com/m=itemdb_rs/`

### Category IDs
- 1-32: Various item categories
- Check with `get_category_info` to explore

### Game Modes for Hiscores
- `normal`: Regular accounts
- `ironman`: Ironman mode
- `hardcore`: Hardcore ironman mode

## Troubleshooting Checklist

1. ✓ Is the server built? (`npm run build`)
2. ✓ Is the server running? (`ps aux | grep node`)
3. ✓ Are you using the correct tool name?
4. ✓ Are you passing required parameters?
5. ✓ Is the item ID valid?
6. ✓ Check debug logs for API responses
7. ✓ Test the API endpoint directly with curl

## Important Notes

- This server is for **RS3 only**, not OSRS
- API rate limits may apply (be respectful)
- Some endpoints may be slow (RS3 APIs can lag)
- Always include the User-Agent header
- Item IDs are different between RS3 and OSRS

## Additional Resources

- RuneScape Wiki: https://runescape.wiki/
- Official GE: https://secure.runescape.com/m=itemdb_rs/
- RS3 Hiscores: https://secure.runescape.com/m=hiscore/

## Using @RuneScape Wiki in Claude

### Setup
1. Ensure the MCP server is running: `npm start`
2. In Claude, use @RuneScape Wiki to access the tools
3. Claude will automatically connect to the MCP server

### Example Queries for Claude

#### Getting Prices
```
@RuneScape Wiki Can you check the current price of Frost Dragon Bones?
```
Claude will use: `get_item_price` with `itemId: 18832`

#### Finding Items
```
@RuneScape Wiki What items start with "Dragon" in the combat category?
```
Claude will use: `search_items` with appropriate category and alpha

#### Player Stats
```
@RuneScape Wiki Show me the stats for player "Zezima"
```
Claude will use: `get_player_stats` with username

### Understanding Tool Responses

#### Price Response Example
```json
{
  "item": {
    "id": 18832,
    "name": "Frost dragon bones",
    "current": {"trend": "neutral", "price": "21.3k"},
    "today": {"trend": "negative", "price": "-279"},
    "members": "true",
    "day30": {"trend": "negative", "change": "-4.0%"}
  }
}
```

#### Player Stats Response
```json
{
  "Overall": {
    "rank": 1,
    "level": 2898,
    "experience": 5400000000
  },
  "Attack": {
    "rank": 15,
    "level": 99,
    "experience": 200000000
  }
  // ... more skills
}
```

## API Categories Reference

### Item Categories (for browse/search)
```
0: Miscellaneous
1: Ammo
2: Arrows
3: Bolts
4: Construction materials
5: Construction products
6: Cooking ingredients
7: Costumes
8: Crafting materials
9: Familiars
10: Farming produce
11: Fletching materials
12: Food and Drink
13: Herblore materials
14: Hunting equipment
15: Hunting Produce
16: Jewellery
17: Mage armour
18: Mage weapons
19: Melee armour - low level
20: Melee armour - mid level
21: Melee armour - high level
22: Melee weapons - low level
23: Melee weapons - mid level
24: Melee weapons - high level
25: Mining and Smithing
26: Potions
27: Prayer armour
28: Prayer materials
29: Range armour
30: Range weapons
31: Runecrafting
32: Runes, Spells and Teleports
33: Seeds
34: Summoning scrolls
35: Tools and containers
36: Woodcutting product
37: Pocket items
38: Stone spirits
39: Salvage
40: Firemaking products
41: Archaeology materials
```

## Complete Tool Examples

### Finding an Item ID
```javascript
// Step 1: Search by category and letter
await handleTool('search_items', {
  category: 24,  // High level melee weapons
  alpha: 'a',
  page: 1
});

// Step 2: Get detailed info once you have the ID
await handleTool('get_item_detail', {
  itemId: 4151  // Found Abyssal whip
});
```

### Price Checking Workflow
```javascript
// 1. Get current price
const price = await handleTool('get_item_price', {
  itemId: 18832
});

// 2. Get historical data
const history = await handleTool('get_item_graph', {
  itemId: 18832
});

// 3. Check when GE was last updated
const info = await handleTool('get_ge_info', {});
```

### Player Comparison
```javascript
// Compare multiple players
const players = ['Zezima', 'Lynx Titan', 'Player123'];

for (const username of players) {
  const stats = await handleTool('get_player_stats', {
    username,
    gameMode: 'normal'
  });
  // Process stats...
}
```

## Error Handling Patterns

### Robust API Calls
```javascript
async function getItemPriceSafely(itemId) {
  try {
    debugLog(`Fetching price for item ${itemId}`);
    const result = await makeApiRequest(
      `${RS3_PRICES_API}/catalogue/detail.json?item=${itemId}`
    );
    debugLog('Price fetch successful', result);
    return result;
  } catch (error) {
    debugLog('Price fetch failed', error);
    
    // Check specific error types
    if (error.message.includes('404')) {
      throw new Error(`Item ${itemId} not found in Grand Exchange`);
    } else if (error.message.includes('timeout')) {
      // Retry once
      debugLog('Retrying after timeout...');
      return await makeApiRequest(url);
    }
    
    throw error;
  }
}
```

## Performance Tips

1. **Batch Operations**: When checking multiple items, use parallel requests
2. **Caching**: GE prices update every ~5 minutes, cache accordingly
3. **Rate Limiting**: Add delays between requests if processing many items
4. **Error Recovery**: RS3 APIs can be flaky, always have retry logic

## Testing Your Implementation

### Unit Test Example
```javascript
describe('Price Tools', () => {
  it('should get Frost Dragon Bones price', async () => {
    const result = await handlePriceTool('get_item_price', {
      itemId: 18832
    });
    
    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('Frost dragon bones');
  });
});
```

### Integration Test
```bash
# Test the full flow
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_item_price","arguments":{"itemId":18832}},"id":1}' | node dist/index.js | jq .
```

## Security Considerations

1. **User Agent**: Always include to avoid being blocked
2. **Rate Limits**: Respect API limits to avoid IP bans
3. **Input Validation**: Validate item IDs and usernames
4. **Error Messages**: Don't expose internal errors to users

## Future Improvements

Consider adding:
1. Caching layer for frequently requested items
2. Bulk operations for multiple items
3. WebSocket support for real-time price updates
4. OSRS support (different endpoints)
5. More detailed error messages with suggestions

## Troubleshooting Checklist

1. ✓ Is the server built? (`npm run build`)
2. ✓ Is the server running? (`ps aux | grep node`)
3. ✓ Are you using the correct tool name?
4. ✓ Are you passing required parameters?
5. ✓ Is the item ID valid?
6. ✓ Check debug logs for API responses
7. ✓ Test the API endpoint directly with curl

## Important Notes

- This server is for **RS3 only**, not OSRS
- API rate limits may apply (be respectful)
- Some endpoints may be slow (RS3 APIs can lag)
- Always include the User-Agent header
- Item IDs are different between RS3 and OSRS

## Additional Resources

- RuneScape Wiki: https://runescape.wiki/
- Official GE: https://secure.runescape.com/m=itemdb_rs/
- RS3 Hiscores: https://secure.runescape.com/m=hiscore/ 