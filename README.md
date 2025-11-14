# Phone-a-Friend MCP v2 🤖📞

An MCP (Model Context Protocol) server that creates an AI consensus panel with OpenAI, Google Gemini, and Anthropic Claude to debate complex questions and reach consensus.

## Quick Start

### 1. Get API Keys

You'll need API keys from at least 2 of these providers:

- **OpenAI**: https://platform.openai.com/api-keys
- **Google Gemini**: https://aistudio.google.com/app/apikey  
- **Anthropic**: https://console.anthropic.com/

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# You need at least 2 API keys for the system to work
```

### 3. Build the Server

```bash
npm install
npm run build
```

### 4. Configure Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "phone-a-friend": {
      "command": "node",
      "args": ["C:\\phone-friend-mcp-v2\\build\\index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "GEMINI_API_KEY": "AI...",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

**⚠️ Important**: Replace `C:\\phone-friend-mcp-v2` with the actual path to this project.

### 5. Restart Claude Desktop

The server will appear in Claude's MCP tools menu.

## Usage

### Basic Consensus Panel

```
Phone a friend about: "Is P=NP?"
```

The AI panel will debate for up to 3 rounds and either reach consensus or request human intervention.

### Advanced Usage

Use the `phone_a_friend` tool with parameters:

- **question** (required): The complex question
- **context** (optional): Additional context  
- **max_rounds** (default: 3): Maximum debate rounds
- **max_cost_usd** (default: 2.0): Budget limit
- **strategy** (default: "debate"): debate | synthesize | tournament

### When AIs Disagree

If no consensus is reached, you'll get an intervention summary with options:

1. **Continue 2 rounds**: `continue_debate` with `continue_2_rounds`
2. **Continue until consensus**: `continue_debate` with `continue_until_consensus` 
3. **Accept specific answer**: `continue_debate` with `accept_answer` + `selected_ai`
4. **Synthesize and stop**: `continue_debate` with `synthesize_and_stop`

### Deep Analysis

Use `analyze_disagreement` with the session_id to understand why AIs disagree:

- Core conflict identification
- Disagreement type (factual/interpretive/philosophical)
- Resolvability score
- Specific differences between positions

### Detailed Debate Report

Use `get_debate_log` to generate a comprehensive round-by-round analysis:

```
get_debate_log with session_id and format (markdown or plain_text)
```

**Report includes:**
- 📊 Round-by-round breakdown with all AI responses
- 📈 Consensus evolution tracking (increases/decreases over time)
- 💭 Confidence level changes for each AI per round
- 🎯 Detailed cost breakdown (per AI, per round)
- 📉 Final analysis explaining why consensus changed
- ⏱️ Duration and session metadata

**Perfect for:**
- Exporting debates for documentation
- Understanding how AI positions evolved
- Analyzing cost efficiency per round
- Sharing debate results with others

## Example Workflow

```
User: "Phone a friend about whether AGI will arrive before 2030"

Claude: I'll convene the AI panel to discuss this question.
[Calls phone_a_friend tool...]

🚨 AI Panel Deadlock - Round 3/3

GPT-4: AGI unlikely before 2030 due to technical challenges (75% confidence)
Claude: Possible but depends on breakthroughs (60% confidence)  
Gemini: Very unlikely, needs more research (80% confidence)

Cost: $0.73/$2.00

Your options:
1. Continue 2 more rounds
2. Accept Gemini's answer (most confident)
3. Synthesize positions
...

User: "Continue 2 more rounds"

Claude: [Calls continue_debate with continue_2_rounds...]
```

## Cost Management

- Default budget: $2.00 per session
- Warning at 75% of budget
- Hard stop at 100%
- Real-time cost tracking by model and round
- Token usage monitoring

**Default models (optimized for cost):**
- **gpt-4o-mini**: $0.00015 input, $0.00060 output per 1K tokens
- **gemini-2.0-flash-exp**: $0.0001 input, $0.0005 output per 1M tokens (~free)
- **claude-3-5-sonnet-20241022**: $0.003 input, $0.015 output per 1K tokens

**Typical cost per debate:** $0.01-0.20 (1-20 öre) for 3 rounds

### Upgrading to Premium Models

The system uses cost-effective models by default. For maximum capability (at higher cost), edit `src/ai-clients.ts`:

**OpenAI (15x more expensive):**
```typescript
private defaultModel = 'gpt-4o';  // $0.0025 input, $0.010 output per 1K tokens
```

**Gemini (35,000x more expensive!):**
```typescript
private defaultModel = 'gemini-2.5-pro';  // $3.50 input, $10.50 output per 1M tokens
```

**Claude (5x more expensive):**
```typescript
private defaultModel = 'claude-sonnet-4-20250514';  // $0.015 input, $0.075 output per 1K tokens
```

⚠️ **Warning**: Premium models dramatically increase costs. Gemini 2.5 Pro especially is 35,000x more expensive than the default!

## Architecture

```
src/
├── index.ts              # MCP server entry point
├── consensus-engine.ts   # Debate orchestration
├── ai-clients.ts         # OpenAI/Gemini/Anthropic wrappers
├── cost-controller.ts    # Budget and token tracking  
└── types.ts              # TypeScript interfaces
```

## Debate Flow

1. **Round 1**: Each AI answers independently
2. **Round 2+**: AIs see others' responses and debate
3. **Consensus Check**: Semantic similarity analysis
4. **If Consensus**: Return unified answer
5. **If Deadlock**: Request human intervention

## Troubleshooting

### "Need at least 2 AI providers configured"

- Check your `.env` file has valid API keys
- Test API keys with curl/API clients
- Ensure environment variables are passed to MCP server

### Build Errors

```bash
npm run clean
npm install
npm run build
```

### Claude Desktop Not Loading

- Check `claude_desktop_config.json` syntax
- Verify absolute path to `build/index.js`
- Check Claude Desktop logs
- Restart Claude Desktop

## Development

```bash
# Development mode (watch for changes)
npm run dev

# Clean build
npm run clean && npm run build

# Test specific components
node build/index.js
```

## License

ISC License - see package.json