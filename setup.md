# Phone-a-Friend MCP v2 Setup Guide

## Option 1: Easy Setup with npx (Recommended)

### 1. Get API Keys

You'll need API keys from at least 2 of these providers:

- **OpenAI**: https://platform.openai.com/api-keys
- **Google Gemini**: https://aistudio.google.com/app/apikey  
- **Anthropic**: https://console.anthropic.com/

### 2. Configure Claude Desktop

Find your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

Add the MCP server configuration using npx:

```json
{
  "mcpServers": {
    "phone-a-friend": {
      "command": "npx",
      "args": ["phone-friend-mcp-v2"],
      "env": {
        "OPENAI_API_KEY": "sk-your-actual-key",
        "GEMINI_API_KEY": "your-actual-gemini-key",
        "ANTHROPIC_API_KEY": "sk-ant-your-actual-key"
      }
    }
  }
}
```

**Important Notes:**
- Replace the example API keys with your real ones
- You can omit API keys you don't have, but need at least 2
- The first time you use it, npx will automatically download and cache the package

### 3. Restart Claude Desktop

Completely quit and restart Claude Desktop for the MCP server to load.

## Option 2: Manual Setup

### 1. API Keys Setup

Create a `.env` file in the project root with your API keys:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env`:
```bash
OPENAI_API_KEY=sk-your-key-here
GEMINI_API_KEY=your-gemini-key-here  
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**You need at least 2 API keys for the system to work.**

### 2. Build the Project

```bash
npm install
npm run build
```

### 3. Configure Claude Desktop

Find your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

Add the MCP server configuration:

```json
{
  "mcpServers": {
    "phone-a-friend": {
      "command": "node",
      "args": ["C:\\\\phone-friend-mcp-v2\\\\build\\\\index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-your-actual-key",
        "GEMINI_API_KEY": "your-actual-gemini-key",
        "ANTHROPIC_API_KEY": "sk-ant-your-actual-key"
      }
    }
  }
}
```

**Important Notes:**
- Replace `C:\\\\phone-friend-mcp-v2` with your actual project path
- Use forward slashes `/` on Mac/Linux: `/path/to/phone-friend-mcp-v2/build/index.js`
- Replace the example API keys with your real ones
- You can omit API keys you don't have, but need at least 2

### 4. Test the Setup

Before restarting Claude Desktop, test the server manually:

```bash
# This should start without errors
node build/index.js
```

Press Ctrl+C to stop the test.

### 5. Restart Claude Desktop

Completely quit and restart Claude Desktop for the MCP server to load.

## Verification

After restarting Claude Desktop, try asking:

```
"Phone a friend about: What is 2+2?"
```

You should see the AI panel debate and reach consensus quickly on this simple question.

## Troubleshooting

### Common Issues

**"Need at least 2 AI providers configured"**
- Check your API keys in the `.env` file
- Verify the keys are valid by testing them directly with the APIs
- Make sure the environment variables are passed correctly in `claude_desktop_config.json`

**"Module not found" errors**
- Run `npm install` again
- Check that `build/index.js` exists (run `npm run build`)
- Verify the path in your Claude Desktop config

**Claude Desktop not loading the server**
- Check the JSON syntax in `claude_desktop_config.json` 
- Verify the absolute path to your project
- Look at Claude Desktop logs for error messages
- Try restarting Claude Desktop

### Testing Individual Components

You can test the server components individually:

```bash
# Test TypeScript compilation
npm run build

# Test the server starts (should show "server started successfully")
node build/index.js

# Watch for file changes during development
npm run dev
```

## Next Steps

Once setup is complete:

1. Try simple questions first: "What is the capital of France?"
2. Test complex questions: "Will AGI be developed by 2030?"
3. Experiment with the intervention system when AIs disagree
4. Use the cost tracking to monitor token usage

The system works best with questions that have:
- Multiple valid perspectives
- Some complexity or nuance
- Room for reasoned disagreement

Happy debating! 🤖📞