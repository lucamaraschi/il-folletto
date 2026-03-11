# Il-Folletto: macOS File Cleaning Daemon

A Node.js/TypeScript daemon for intelligent file cleaning on macOS with complex pattern matching, TUI, and Web UI.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         il-folletto                          │
├─────────────────────────────────────────────────────────────┤
│  CLI Entry Point (commander.js)                             │
│  ├── start daemon                                           │
│  ├── stop daemon                                            │
│  ├── tui (interactive mode)                                 │
│  └── web (launch web ui)                                    │
├─────────────────────────────────────────────────────────────┤
│  Daemon (background process)                                │
│  ├── Scheduler (node-cron)                                  │
│  ├── File Watcher (chokidar)                                │
│  ├── Rule Engine                                            │
│  ├── Cleaner (actual file operations)                       │
│  └── HTTP API Server (fastify)                              │
├─────────────────────────────────────────────────────────────┤
│  Interfaces                                                 │
│  ├── TUI (ink + react)                                      │
│  └── Web UI (react + vite)                                  │
├─────────────────────────────────────────────────────────────┤
│  Config (~/.config/il-folletto/config.yaml)                 │
│  Logs (~/.config/il-folletto/logs/)                         │
│  State (~/.config/il-folletto/state.json)                   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Rule Engine
Complex pattern matching with:
- **Glob patterns**: `**/*.log`, `~/.cache/**`
- **Regex patterns**: `/\.DS_Store$/`, `/node_modules/`
- **Conditions**:
  - `olderThan`: "7d", "1h", "30m"
  - `newerThan`: duration
  - `largerThan`: "100MB", "1GB"
  - `smallerThan`: "1KB"
- **Exceptions**: patterns to exclude
- **Actions**: `delete`, `trash`, `move`, `compress`
- **Target**: `files`, `directories`, `all`

### 2. Config File Format (YAML)

```yaml
version: 1
global:
  dryRun: false
  logLevel: info
  defaultAction: trash  # trash | delete | move | compress

schedules:
  - name: hourly-cleanup
    cron: "0 * * * *"
    rules: [cache-cleanup, logs-cleanup]

watchers:
  - path: ~/Downloads
    threshold: 10GB
    rules: [downloads-cleanup]

rules:
  - name: cache-cleanup
    description: Clean application caches
    action: trash
    paths:
      - ~/Library/Caches/**
    patterns:
      - "**/*"
    conditions:
      olderThan: 7d
    exceptions:
      - "**/Homebrew/**"
```

### 3. Daemon Process
- Runs as macOS launchd service (auto-start on boot)
- Managed via `launchctl` (load/unload/status)
- Plist installed to `~/Library/LaunchAgents/com.il-folletto.daemon.plist`
- Exposes HTTP API on localhost:3847
- Manages scheduler and watchers
- Emits events for real-time updates (WebSocket)

### 4. HTTP API
```
GET  /api/status          - Daemon status
GET  /api/rules           - List all rules
GET  /api/rules/:name     - Get single rule
GET  /api/schedules       - List schedules
GET  /api/watchers        - List watchers
POST /api/dry-run         - Preview what would be cleaned
POST /api/clean           - Execute cleanup
GET  /api/history         - Cleanup history
GET  /api/stats           - Statistics
GET  /api/config          - Get config
PUT  /api/config          - Update config
POST /api/config/reload   - Reload from disk
WS   /ws                  - Real-time updates
```

### 5. TUI (Ink + React)
Features:
- Dashboard: system status, last cleanup, disk usage
- Rule browser: view/edit rules
- Live preview: dry-run with file list
- Execution: trigger cleanup with progress
- Logs: real-time log viewer

### 6. Web UI (React + Vite)
Features:
- Same functionality as TUI
- Visual rule browser
- Interactive cleanup interface
- Real-time WebSocket updates
- Dark theme

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript |
| Runtime | Node.js 20+ |
| CLI | Commander.js |
| TUI | Ink (React for CLI) |
| Web UI | React + Vite |
| HTTP Server | Fastify |
| File Watching | Chokidar |
| Scheduling | node-cron |
| Config | cosmiconfig (YAML) |
| Glob Matching | fast-glob + micromatch |
| Daemon | macOS launchd (native) |
| Trash | trash (macOS Trash integration) |
| Build | tsup |

## Project Structure

```
il-folletto/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI entry (commander.js)
│   ├── daemon/
│   │   ├── index.ts          # Daemon main process
│   │   ├── scheduler.ts      # Cron scheduler (node-cron)
│   │   ├── watcher.ts        # File system watcher (chokidar)
│   │   ├── api.ts            # HTTP API server (fastify)
│   │   └── state.ts          # State persistence
│   ├── core/
│   │   ├── types.ts          # Core type definitions (Zod)
│   │   ├── rule-engine.ts    # Rule matching logic
│   │   ├── cleaner.ts        # File operations
│   │   ├── config.ts         # Config loading/validation
│   │   └── scanner.ts        # Directory scanning
│   ├── tui/
│   │   ├── app.tsx           # Main TUI app (ink)
│   │   └── components/       # TUI components
│   └── launchd/
│       ├── plist.ts          # Generate launchd plist
│       └── manager.ts        # Install/uninstall/status
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css
│       ├── components/
│       │   ├── Dashboard.tsx
│       │   ├── Rules.tsx
│       │   └── Cleanup.tsx
│       └── hooks/
│           └── useApi.ts
└── resources/
    └── default-config.yaml
```

## Implementation Phases

### Phase 1: Core Foundation
- Project setup (package.json, tsconfig.json)
- Type definitions with Zod schemas
- Config system (YAML loading, validation)
- Rule engine (pattern matching, conditions)
- Scanner (directory traversal, file metadata)
- Cleaner (trash, delete, move, compress)
- CLI entry point

### Phase 2: Daemon & API
- Daemon process with signal handling
- State persistence
- Scheduler (cron jobs)
- File watcher (threshold triggers)
- HTTP API (Fastify + WebSocket)
- launchd integration

### Phase 3: TUI
- Ink app setup
- Dashboard component
- Rules browser
- Cleanup view with dry-run/execute

### Phase 4: Web UI
- Vite + React setup
- API client hooks
- Dashboard page
- Rules page
- Cleanup page
- WebSocket integration

### Phase 5: Polish
- Error handling improvements
- Unit tests
- Documentation
