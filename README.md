# Il-Folletto 🧹

A powerful macOS file cleaning daemon with complex pattern matching, terminal UI, and web interface.

## Features

- **Rule-based cleaning**: Define rules with glob patterns, regex, and conditions
- **Scheduled cleanups**: Run cleanups on a schedule using cron expressions
- **Directory watchers**: Trigger cleanups when directories exceed size thresholds
- **Multiple actions**: Trash, delete, move, or compress files
- **Terminal UI**: Interactive terminal interface for monitoring and control
- **Web UI**: Modern web dashboard for managing cleanups
- **Daemon mode**: Run as a background service with launchd integration
- **Dry-run mode**: Preview what would be cleaned before executing

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/il-folletto.git
cd il-folletto

# Install dependencies
npm install
cd web && npm install && cd ..

# Build the project
npm run build

# Link globally (optional)
npm link
```

## Quick Start

```bash
# Initialize configuration
il-folletto config --init

# Edit your config
open ~/.config/il-folletto/config.yaml

# Preview what would be cleaned
il-folletto dry-run

# Run a cleanup
il-folletto clean

# Start the daemon
il-folletto daemon install
il-folletto daemon start

# Launch the TUI
il-folletto tui

# Launch the Web UI
il-folletto web
```

## Configuration

The configuration file is located at `~/.config/il-folletto/config.yaml`.

### Basic Structure

```yaml
version: 1

global:
  dryRun: false          # Global dry-run mode
  logLevel: info         # debug, info, warn, error
  defaultAction: trash   # trash, delete, move, compress
  apiPort: 3847          # API server port
  apiHost: 127.0.0.1     # API server host

rules:
  - name: cache-cleanup
    description: Clean application caches
    enabled: true
    action: trash
    paths:
      - ~/Library/Caches
    patterns:
      - "**/*"
    conditions:
      olderThan: 7d
    exceptions:
      - "**/Homebrew/**"

schedules:
  - name: hourly-cleanup
    enabled: true
    cron: "0 * * * *"
    rules:
      - cache-cleanup

watchers:
  - path: ~/Downloads
    enabled: true
    threshold: 10GB
    rules:
      - downloads-cleanup
    debounceMs: 5000
```

### Rule Options

| Option | Description | Example |
|--------|-------------|---------|
| `name` | Unique rule identifier | `cache-cleanup` |
| `description` | Human-readable description | `Clean old caches` |
| `enabled` | Whether the rule is active | `true` |
| `action` | Action to perform | `trash`, `delete`, `move`, `compress` |
| `moveTo` | Destination for move action | `~/Archive` |
| `target` | What to match | `files`, `directories`, `all` |
| `paths` | Directories to scan | `[~/Library/Caches]` |
| `patterns` | Patterns to match | `["**/*.log", "*.tmp"]` |
| `conditions` | Conditions for matching | See below |
| `exceptions` | Patterns to exclude | `["**/important/**"]` |

### Conditions

| Condition | Description | Example |
|-----------|-------------|---------|
| `olderThan` | File modified more than duration ago | `7d`, `1h`, `30m` |
| `newerThan` | File modified less than duration ago | `1d` |
| `largerThan` | File larger than size | `100MB`, `1GB` |
| `smallerThan` | File smaller than size | `1KB` |
| `modifiedBefore` | Modified before date | `2024-01-01T00:00:00Z` |
| `modifiedAfter` | Modified after date | `2024-01-01T00:00:00Z` |

### Patterns

Il-folletto supports both glob patterns and regex:

```yaml
patterns:
  # Glob patterns
  - "*.log"           # Match .log files
  - "**/*.tmp"        # Match .tmp files in any subdirectory
  - "cache-*"         # Match files starting with cache-

  # Regex patterns (enclosed in /)
  - "/\\.DS_Store$/"  # Match .DS_Store files
  - "/node_modules/"  # Match paths containing node_modules
```

## CLI Commands

### Configuration

```bash
# Show config paths
il-folletto config

# Initialize with defaults
il-folletto config --init

# Show config file path
il-folletto config --path

# Validate configuration
il-folletto config --validate
```

### Cleaning

```bash
# Preview all rules (dry-run)
il-folletto dry-run

# Preview specific rules
il-folletto dry-run cache-cleanup downloads-cleanup

# Execute cleanup (with confirmation)
il-folletto clean

# Execute without confirmation
il-folletto clean -y

# Execute specific rules
il-folletto clean cache-cleanup -y
```

### Rules

```bash
# List all configured rules
il-folletto rules
```

### Daemon

```bash
# Check daemon status
il-folletto daemon status

# Install launchd service (auto-start on login)
il-folletto daemon install

# Uninstall launchd service
il-folletto daemon uninstall

# Start daemon via launchd
il-folletto daemon start

# Stop daemon
il-folletto daemon stop

# Run daemon in foreground (for development)
il-folletto daemon run

# View daemon logs
il-folletto daemon logs
il-folletto daemon logs -n 100
```

### History & Stats

```bash
# View cleanup history
il-folletto history
il-folletto history -n 50

# View statistics
il-folletto stats
```

### User Interfaces

```bash
# Launch terminal UI
il-folletto tui

# Launch web UI
il-folletto web

# Launch web UI on custom port
il-folletto web -p 8080

# Launch without opening browser
il-folletto web --no-open
```

## API

When the daemon is running, it exposes an HTTP API on `localhost:3847`.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/status` | Daemon status |
| GET | `/api/rules` | List all rules |
| GET | `/api/rules/:name` | Get single rule |
| GET | `/api/schedules` | List scheduled jobs |
| GET | `/api/watchers` | List active watchers |
| POST | `/api/dry-run` | Preview cleanup |
| POST | `/api/clean` | Execute cleanup |
| GET | `/api/history` | Cleanup history |
| GET | `/api/stats` | Statistics |
| GET | `/api/config` | Get configuration |
| PUT | `/api/config` | Update configuration |
| POST | `/api/config/reload` | Reload from disk |
| WS | `/ws` | Real-time WebSocket updates |

### Examples

```bash
# Get daemon status
curl http://localhost:3847/api/status

# Preview cleanup
curl -X POST http://localhost:3847/api/dry-run \
  -H "Content-Type: application/json" \
  -d '{"rules": ["cache-cleanup"]}'

# Execute cleanup
curl -X POST http://localhost:3847/api/clean \
  -H "Content-Type: application/json" \
  -d '{"rules": ["cache-cleanup"]}'
```

## Example Configurations

### Clean Old Downloads

```yaml
rules:
  - name: downloads-cleanup
    description: Remove old files from Downloads
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
```

### Clean Screenshots

```yaml
rules:
  - name: screenshots-cleanup
    description: Delete old screenshots from Desktop
    action: delete
    paths:
      - ~/Desktop
    patterns:
      - "Screenshot*.png"
      - "Screen Recording*.mov"
    conditions:
      olderThan: 3d
```

### Compress Old Logs

```yaml
rules:
  - name: compress-logs
    description: Compress log files older than 1 day
    action: compress
    paths:
      - ~/Library/Logs
    patterns:
      - "**/*.log"
    conditions:
      olderThan: 1d
    exceptions:
      - "**/*.gz"
```

### Clean Large Cache Files

```yaml
rules:
  - name: large-cache-cleanup
    description: Remove cache files larger than 100MB
    action: trash
    paths:
      - ~/Library/Caches
    patterns:
      - "**/*"
    conditions:
      largerThan: 100MB
```

### Hourly Schedule

```yaml
schedules:
  - name: hourly-maintenance
    cron: "0 * * * *"
    rules:
      - cache-cleanup
      - downloads-cleanup
```

### Daily Schedule

```yaml
schedules:
  - name: daily-cleanup
    cron: "0 3 * * *"  # Run at 3 AM
    rules:
      - all  # Run all enabled rules
```

### Directory Watcher

```yaml
watchers:
  - path: ~/Downloads
    threshold: 5GB
    rules:
      - downloads-cleanup
    debounceMs: 10000
```

## Development

```bash
# Run in development mode
npm run dev

# Run TUI in development
npm run dev tui

# Run web UI in development
cd web && npm run dev

# Type check
npm run typecheck

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## File Locations

| File | Location |
|------|----------|
| Config | `~/.config/il-folletto/config.yaml` |
| State | `~/.config/il-folletto/state.json` |
| Logs | `~/.config/il-folletto/logs/` |
| Launchd plist | `~/Library/LaunchAgents/com.il-folletto.daemon.plist` |

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **CLI**: Commander.js
- **TUI**: Ink (React for terminals)
- **Web UI**: React + Vite
- **HTTP Server**: Fastify + WebSocket
- **File Watching**: Chokidar
- **Scheduling**: node-cron
- **Config**: cosmiconfig (YAML)
- **Pattern Matching**: fast-glob + micromatch
- **Validation**: Zod
- **Trash**: trash (macOS Trash integration)

## License

MIT
