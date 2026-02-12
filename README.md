# MEME•BACKED•CURRENCY — AI Dungeon Master Bot

An AI-powered dungeon master that lives on Twitter, posting evolving fantasy lore with AI-generated video and letting the community shape the story through comments.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Required API Keys

| Service | Purpose | Where to get it | Cost |
|---------|---------|-----------------|------|
| **Twitter API** (Basic tier) | Post tweets, read replies | [developer.x.com](https://developer.x.com) | $100/mo |
| **Anthropic Claude** | AI story generation | [console.anthropic.com](https://console.anthropic.com) | ~$3-5/mo at this volume |
| **Kling AI** | Video generation | [klingai.com](https://klingai.com) | ~$15-45/mo |
| **OpenAI** (optional) | DALL-E image fallback | [platform.openai.com](https://platform.openai.com) | ~$6/mo if used |

### 4. Run the bot

```bash
# Start the scheduled bot (posts every N hours based on config)
npm run dev

# Post one lore entry immediately (great for testing)
npm run post-now

# Check current status
npm run status

# Reset all story data (start fresh)
npm run reset
```

## How It Works

1. **Every 6 hours** (configurable), the bot generates a new lore post
2. **Claude AI** writes the next chapter based on world state + community input
3. **Kling AI** generates a 5-second medieval cinematic video for the post
4. The bot posts the lore + video to Twitter with a call-to-action
5. Before the next post, it reads the **most-liked reply** and feeds it back to Claude
6. The story evolves based on what the community wants

## Configuration

Edit `.env` to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `POST_INTERVAL_HOURS` | `6` | Hours between posts (6 = 4 posts/day) |
| `VOTE_WINDOW_MINUTES` | `300` | Minutes to wait before resolving votes |
| `LOG_LEVEL` | `info` | Logging verbosity (debug/info/warn/error) |

## Project Structure

```
src/
├── index.ts                 # Entry point, scheduler, CLI
├── config/index.ts          # Environment config
├── types/index.ts           # TypeScript types
├── services/
│   ├── database.ts          # JSON file-based storage
│   ├── dungeon-master.ts    # Claude AI story generation
│   ├── media-generator.ts   # Kling video + DALL-E fallback
│   └── twitter.ts           # Twitter API posting & reading
├── jobs/
│   └── lore-cycle.ts        # Main orchestration loop
└── utils/
    └── logger.ts            # Winston logging
data/                        # Auto-created at runtime
├── lore_posts.json          # Story history
├── world_state.json         # World bible
├── chapter_summary.json     # AI-generated summaries
├── media/                   # Generated videos/images
└── bot.log                  # Logs
```

## Estimated Monthly Cost

| Tier | Setup | Cost |
|------|-------|------|
| **Minimum** (images only, no Kling) | Claude + DALL-E + Twitter Basic | ~$110/mo |
| **Recommended** (with video) | Claude + Kling + Twitter Basic | ~$120-150/mo |

## Roadmap

- [x] Phase 1: Autonomous lore posting with video
- [x] Phase 1: Community comment voting
- [ ] Phase 2: Player-initiated D&D games (Path 2)
- [ ] Phase 3: Cross-path world consistency
- [ ] Phase 4: Character persistence & XP
