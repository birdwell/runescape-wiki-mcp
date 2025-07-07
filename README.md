# RuneScape Wiki MCP Server

A Model Context Protocol (MCP) server that provides access to RuneScape Wiki APIs, including real-time Grand Exchange prices, item data, and player statistics for RuneScape 3 (RS3).

## Features

- **Real-time Grand Exchange Prices**: Get current, 5-minute, and 1-hour average prices for all items
- **Item Database**: Access complete item mappings with metadata (names, IDs, examine text, etc.)
- **Price Time Series**: Historical price data with configurable time intervals
- **Player Statistics**: Lookup player stats from RuneScape 3 hiscores
- **Multiple Game Modes**: Support for normal, ironman, and hardcore ironman accounts
- **MCP Resources**: Direct access to price and item data through MCP resource URIs

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

This will start the TypeScript compiler in watch mode and automatically restart the server when files change.

## Usage

### With Claude Desktop

Add the following configuration to your Claude Desktop config file:

```json
{
  "mcpServers": {
    "runescape-wiki": {
      "command": "node",
      "args": ["/path/to/runescape-wiki-mcp/dist/index.js"]
    }
  }
}
```

### With MCP Inspector

Test the server using the MCP Inspector:

```bash
# Using npm script (recommended)
npm run inspector

# Or manually with npx
npx @modelcontextprotocol/inspector node dist/index.js
```

### Quick Test

Verify the server is working correctly:

```bash
npm test
```

## Available Tools

### `get_latest_prices`

Get the latest Grand Exchange prices for all items or a specific item.

**Parameters:**
- `itemId` (optional): Item ID to get price for specific item

**Example:**
```json
{
  "itemId": 4151
}
```

### `get_item_mapping`

Get the complete mapping of all items with their IDs, names, and metadata.

**Parameters:** None

**Returns:** Array of items with:
- `id`: Item ID
- `name`: Item name
- `examine`: Examine text
- `members`: Whether it's a members-only item
- `lowalch`: Low alchemy value
- `highalch`: High alchemy value
- `limit`: Grand Exchange buy limit
- `value`: Item value
- `icon`: Icon filename

### `get_5m_prices`

Get 5-minute average prices for all items.

**Parameters:**
- `timestamp` (optional): Unix timestamp to get prices for specific time

### `get_1h_prices`

Get 1-hour average prices for all items.

**Parameters:**
- `timestamp` (optional): Unix timestamp to get prices for specific time

### `get_timeseries`

Get price time series data for a specific item.

**Parameters:**
- `itemId` (required): Item ID to get time series for
- `timestep` (required): Time interval - one of: `5m`, `1h`, `6h`, `24h`

**Example:**
```json
{
  "itemId": 4151,
  "timestep": "1h"
}
```

### `get_player_stats`

Get player statistics from RuneScape 3 hiscores.

**Parameters:**
- `username` (required): Player username to lookup
- `gameMode` (optional): Game mode - one of: `normal`, `ironman`, `hardcore`

**Example:**
```json
{
  "username": "Zezima",
  "gameMode": "normal"
}
```

**Returns:** Parsed statistics including:
- Overall rank and total level
- Individual skill levels, experience, and ranks
- Formatted data for all 30 skills (including Summoning, Dungeoneering, Divination, Invention, Archaeology, and Necromancy)

## Available Resources

### `runescape://prices/latest`

Direct access to the latest Grand Exchange prices for all items.

### `runescape://items/mapping`

Direct access to the complete item mapping data.

## API Endpoints

This server uses the following RuneScape Wiki APIs:

- **RS3 Prices API**: `https://prices.runescape.wiki/api/v1/rs`
  - Latest prices, 5-minute averages, 1-hour averages, time series data
- **RS3 Hiscores API**: `https://secure.runescape.com/m=hiscore`
  - Player statistics for different game modes

## Rate Limits

The RuneScape Wiki APIs have the following guidelines:
- Use a descriptive User-Agent (automatically handled by this server)
- Avoid excessive requests that could impact API stability
- The server implements proper error handling and respects API limitations

## Error Handling

The server includes comprehensive error handling:
- API request failures are caught and returned as error responses
- Invalid parameters are validated before making API calls
- Network timeouts and connection issues are handled gracefully
- Player not found errors are properly reported

## Development

### Project Structure

```
src/
├── index.ts          # Main server implementation
├── types/            # TypeScript type definitions
└── utils/            # Utility functions

dist/                 # Compiled JavaScript output
```

### Scripts

- `npm run build`: Compile TypeScript to JavaScript
- `npm run watch`: Watch for changes and recompile
- `npm start`: Start the server in production mode
- `npm run dev`: Start in development mode with auto-restart
- `npm test`: Run a simple test to verify the server is working
- `npm run inspector`: Launch the MCP Inspector to test the server

### Adding New Tools

1. Define the tool in the `tools` array with proper schema
2. Add a case handler in the `CallToolRequestSchema` handler
3. Implement the API logic with proper error handling
4. Update this README with documentation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [RuneScape Wiki](https://runescape.wiki/) for providing the APIs
- [Model Context Protocol](https://modelcontextprotocol.io/) for the MCP specification
- Jagex for RuneScape 3

## Support

For issues, questions, or feature requests, please open an issue on the GitHub repository.

---

**Note**: This is an unofficial tool and is not affiliated with Jagex or the RuneScape Wiki. Please respect the API usage guidelines and terms of service. 