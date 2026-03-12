<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/broom_1f9f9.png" width="120" alt="Il-Folletto">
</p>

<h1 align="center">Il-Folletto</h1>

<p align="center">
  <strong>The intelligent file cleaning daemon for macOS</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#interfaces">Interfaces</a> •
  <a href="#api">API</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/il-folletto"><img src="https://img.shields.io/npm/v/il-folletto?style=flat-square&color=cb3837" alt="npm"></a>
  <img src="https://img.shields.io/badge/platform-macOS-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/node-%3E%3D20-green?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/typescript-5.x-blue?style=flat-square" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square" alt="License">
</p>

---

**Il-Folletto** — named after Italy's iconic Vorwerk vacuum cleaner — is a powerful, rule-based file cleaning daemon that keeps your Mac tidy automatically. Define what to clean, when to clean it, and let il Folletto do the rest.

```
Downloads eating up space?     → Auto-clean files older than 7 days
Screenshots cluttering Desktop? → Delete after 24 hours
Caches growing out of control?  → Purge weekly, keep Homebrew safe
```

## Features

### Core Capabilities

- **Rule-Based Cleaning** — Define precise rules with glob patterns, regex, and smart conditions
- **Scheduled Cleanups** — Set it and forget it with cron expressions
- **Directory Watchers** — Trigger cleanups when folders exceed size thresholds
- **Safe by Default** — Files go to Trash unless you specify otherwise

### Smart Conditions

| Condition | Example | Description |
|-----------|---------|-------------|
| `olderThan` | `7d`, `1h`, `30m` | Files modified more than X ago |
| `newerThan` | `1d` | Files modified less than X ago |
| `largerThan` | `100MB`, `1GB` | Files exceeding size |
| `smallerThan` | `1KB` | Files under size |

### Multiple Actions

| Action | Description |
|--------|-------------|
| `trash` | Move to macOS Trash (recoverable) |
| `delete` | Permanent deletion |
| `move` | Relocate to another directory |
| `compress` | Gzip compression |

### Powerful Interfaces

- **CLI** — Full-featured command-line interface
- **TUI** — Interactive terminal dashboard built with Ink
- **Web UI** — Modern React dashboard with real-time updates
- **REST API** — Full HTTP API with WebSocket support

## Installation

### Via npm (recommended)

```bash
npm install -g il-folletto
```

### From source

```bash
git clone https://github.com/lucamaraschi/il-folletto.git
cd il-folletto
npm install && cd web && npm install && cd ..
npm run build
npm link
```

## Quick Start

```bash
# 1. Initialize configuration
il-folletto config --init

# 2. Preview what would be cleaned
il-folletto dry-run

# 3. Run cleanup (with confirmation)
il-folletto clean

# 4. Install as background daemon
il-folletto daemon install
il-folletto daemon start
```

## Configuration

Configuration lives at `~/.config/il-folletto/config.yaml`

### Example: Keep Downloads Clean

```yaml
version: 1

global:
  dryRun: false
  defaultAction: trash

rules:
  - name: downloads-cleanup
    description: Remove old downloads, keep PDFs
    action: trash
    paths:
      - ~/Downloads
    patterns:
      - "**/*"
    conditions:
      olderThan: 7d
    exceptions:
      - "**/*.pdf"
      - "**/Important/**"

schedules:
  - name: daily-cleanup
    cron: "0 9 * * *"  # Every day at 9 AM
    rules:
      - downloads-cleanup
```

### Example: Auto-Clean When Downloads Exceeds 10GB

```yaml
watchers:
  - path: ~/Downloads
    threshold: 10GB
    rules:
      - downloads-cleanup
    debounceMs: 5000
```

### Example: Clean Screenshots & Screen Recordings

```yaml
rules:
  - name: screenshots
    description: Delete old screenshots
    action: delete
    paths:
      - ~/Desktop
    patterns:
      - "Screenshot*.png"
      - "Screen Recording*.mov"
    conditions:
      olderThan: 3d
```

### Pattern Matching

```yaml
patterns:
  # Glob patterns
  - "*.log"           # Match .log files
  - "**/*.tmp"        # Match .tmp in any subdirectory
  - "cache-*"         # Match files starting with cache-

  # Regex patterns (enclosed in /)
  - "/\\.DS_Store$/"  # Match .DS_Store files
  - "/node_modules/"  # Match paths containing node_modules
```

## Interfaces

### Terminal UI

```bash
il-folletto tui
```

Interactive dashboard with keyboard navigation:
- **Dashboard** — Status, disk usage, cleanup history
- **Rules** — Browse and inspect configured rules
- **Cleanup** — Select rules, preview, and execute

### Web UI

```bash
il-folletto web
```

Modern web dashboard at `http://localhost:3848`:
- Real-time WebSocket updates
- Visual disk usage charts
- One-click cleanup execution

### CLI Commands

| Command | Description |
|---------|-------------|
| `il-folletto config` | Show config file paths |
| `il-folletto config --init` | Create default configuration |
| `il-folletto config --path` | Print config file path |
| `il-folletto config --validate` | Validate configuration file |
| `il-folletto rules` | List all configured rules |
| `il-folletto add-rule` | Interactive rule creation wizard |
| `il-folletto dry-run [rules...]` | Preview cleanup (no changes) |
| `il-folletto clean [rules...]` | Execute cleanup with confirmation |
| `il-folletto clean -y [rules...]` | Execute cleanup without confirmation |
| `il-folletto history` | Show cleanup history |
| `il-folletto history -n 50` | Show last 50 history entries |
| `il-folletto stats` | Show cleanup statistics |
| `il-folletto tui` | Launch terminal UI |
| `il-folletto web` | Launch web UI |
| `il-folletto web -p 8080` | Launch web UI on custom port |
| `il-folletto web --no-open` | Launch without opening browser |

### Daemon Commands

| Command | Description |
|---------|-------------|
| `il-folletto daemon status` | Show daemon status |
| `il-folletto daemon install` | Install launchd service (auto-start on login) |
| `il-folletto daemon uninstall` | Remove launchd service |
| `il-folletto daemon start` | Start daemon via launchd |
| `il-folletto daemon stop` | Stop daemon |
| `il-folletto daemon run` | Run daemon in foreground (for development) |
| `il-folletto daemon logs` | View daemon logs |
| `il-folletto daemon logs -n 100` | View last 100 log lines |

## API

The daemon exposes a REST API on `localhost:3847`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/status` | Daemon status & uptime |
| `GET` | `/api/rules` | List all rules |
| `GET` | `/api/rules/:name` | Get specific rule |
| `GET` | `/api/schedules` | List scheduled jobs |
| `GET` | `/api/watchers` | List active watchers |
| `POST` | `/api/dry-run` | Preview cleanup |
| `POST` | `/api/clean` | Execute cleanup |
| `GET` | `/api/history` | Cleanup history |
| `GET` | `/api/stats` | Statistics |
| `GET` | `/api/disk` | Disk usage |
| `GET` | `/api/config` | Get configuration |
| `PUT` | `/api/config` | Update configuration |
| `POST` | `/api/config/reload` | Reload config from disk |
| `WS` | `/ws` | Real-time WebSocket updates |

```bash
# Health check
curl http://localhost:3847/health

# Preview cleanup
curl -X POST http://localhost:3847/api/dry-run \
  -H "Content-Type: application/json" \
  -d '{"rules": ["downloads-cleanup"]}'

# Execute cleanup
curl -X POST http://localhost:3847/api/clean \
  -H "Content-Type: application/json" \
  -d '{"rules": ["downloads-cleanup"]}'
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                       il-folletto                           │
├─────────────────────────────────────────────────────────────┤
│  CLI (commander.js)                                         │
│  └── config, clean, dry-run, rules, daemon, tui, web       │
├─────────────────────────────────────────────────────────────┤
│  Daemon Process                                             │
│  ├── Scheduler (node-cron)    → Runs rules on schedule     │
│  ├── Watchers (chokidar)      → Triggers on size threshold │
│  ├── Rule Engine              → Pattern matching & filters │
│  ├── Cleaner                  → File operations            │
│  └── API Server (fastify)     → HTTP + WebSocket           │
├─────────────────────────────────────────────────────────────┤
│  Interfaces                                                 │
│  ├── TUI (ink)                → Terminal dashboard         │
│  └── Web UI (react + vite)    → Browser dashboard          │
├─────────────────────────────────────────────────────────────┤
│  Config: ~/.config/il-folletto/config.yaml                 │
│  State:  ~/.config/il-folletto/state.json                  │
│  Logs:   ~/.config/il-folletto/logs/                       │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| CLI | Commander.js |
| TUI | Ink (React for terminals) |
| Web UI | React + Vite |
| HTTP Server | Fastify |
| WebSocket | @fastify/websocket |
| File Watching | Chokidar |
| Scheduling | node-cron |
| Config | cosmiconfig (YAML) |
| Pattern Matching | fast-glob + micromatch |
| Validation | Zod |
| macOS Trash | trash |
| Testing | Vitest |

## Development

```bash
# Development mode
npm run dev

# Run tests
npm test

# Type check
npx tsc --noEmit

# Build
npm run build
```

## Why "Il-Folletto"?

*Il Folletto* is the iconic Vorwerk vacuum cleaner, a household name in Italy since 1938—famously sold door-to-door and synonymous with keeping homes spotless. This tool carries on that legacy: a tireless cleaning companion for your filesystem.

## License

MIT © [Luca Maraschi](https://github.com/lucamaraschi)
