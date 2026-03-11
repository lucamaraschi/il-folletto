import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import type { Config, CleanupResult } from "../core/types.js";
import { loadConfig, getEnabledRules, getRulesByNames, saveConfig } from "../core/config.js";
import { scanRules, getDiskUsage } from "../core/scanner.js";
import { cleanRules, summarizeResults } from "../core/cleaner.js";
import { formatSize } from "../core/rule-engine.js";
import {
  getUptime,
  getHistory,
  getStats,
  recordCleanup,
  loadState,
} from "./state.js";
import type { Scheduler } from "./scheduler.js";
import type { DirectoryWatcher } from "./watcher.js";

export interface ApiServerOptions {
  host: string;
  port: number;
  scheduler: Scheduler;
  watcher: DirectoryWatcher;
}

export class ApiServer {
  private fastify: FastifyInstance;
  private config: Config;
  private scheduler: Scheduler;
  private watcher: DirectoryWatcher;
  private wsClients: Set<WebSocket> = new Set();

  private routesSetup: boolean = false;

  constructor(config: Config, options: ApiServerOptions) {
    this.config = config;
    this.scheduler = options.scheduler;
    this.watcher = options.watcher;

    this.fastify = Fastify({
      logger: config.global.logLevel === "debug",
    });
  }

  private async setupRoutes(): Promise<void> {
    if (this.routesSetup) return;
    this.routesSetup = true;
    // Register WebSocket plugin
    await this.fastify.register(websocket);

    // CORS headers for web UI
    this.fastify.addHook("onRequest", async (request, reply) => {
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");

      if (request.method === "OPTIONS") {
        reply.status(204).send();
      }
    });

    // Health check
    this.fastify.get("/health", async () => {
      return { status: "ok" };
    });

    // Status endpoint
    this.fastify.get("/api/status", async () => {
      const state = loadState();
      const next = this.scheduler.getNextScheduledCleanup();

      return {
        running: true,
        pid: process.pid,
        uptime: getUptime(),
        uptimeFormatted: this.formatUptime(getUptime()),
        lastCleanup: state.lastCleanup,
        nextScheduled: next?.time ?? null,
        nextScheduleName: next?.schedule ?? null,
        totalCleaned: state.totalCleaned,
        totalSizeFreed: state.totalSizeFreed,
        totalSizeFreedFormatted: formatSize(state.totalSizeFreed),
        dryRun: this.config.global.dryRun,
      };
    });

    // List rules
    this.fastify.get("/api/rules", async () => {
      return {
        rules: this.config.rules.map((rule) => ({
          ...rule,
          action: rule.action ?? this.config.global.defaultAction,
        })),
      };
    });

    // Get single rule
    this.fastify.get<{ Params: { name: string } }>("/api/rules/:name", async (request, reply) => {
      const rule = this.config.rules.find((r) => r.name === request.params.name);
      if (!rule) {
        reply.status(404);
        return { error: "Rule not found" };
      }
      return rule;
    });

    // List schedules
    this.fastify.get("/api/schedules", async () => {
      return {
        schedules: this.scheduler.getJobs(),
      };
    });

    // List watchers
    this.fastify.get("/api/watchers", async () => {
      return {
        watchers: this.watcher.getStatus(),
      };
    });

    // Dry run
    this.fastify.post<{ Body: { rules?: string[] } }>("/api/dry-run", async (request) => {
      const ruleNames = request.body?.rules ?? [];
      const rules =
        ruleNames.length > 0
          ? getRulesByNames(this.config, ruleNames)
          : getEnabledRules(this.config);

      const results = await scanRules(rules);
      const totalFiles = results.reduce((sum, r) => sum + r.totalCount, 0);
      const totalSize = results.reduce((sum, r) => sum + r.totalSize, 0);

      return {
        results: results.map((r) => ({
          rule: r.rule,
          fileCount: r.totalCount,
          totalSize: r.totalSize,
          totalSizeFormatted: formatSize(r.totalSize),
          files: r.files.slice(0, 100).map((f) => ({
            path: f.path,
            size: f.size,
            sizeFormatted: formatSize(f.size),
            mtime: f.mtime,
          })),
          hasMore: r.files.length > 100,
        })),
        summary: {
          totalFiles,
          totalSize,
          totalSizeFormatted: formatSize(totalSize),
        },
      };
    });

    // Execute cleanup
    this.fastify.post<{ Body: { rules?: string[] } }>("/api/clean", async (request) => {
      const ruleNames = request.body?.rules ?? [];
      const rules =
        ruleNames.length > 0
          ? getRulesByNames(this.config, ruleNames)
          : getEnabledRules(this.config);

      this.broadcast({ type: "cleanup:start", rules: rules.map((r) => r.name) });

      const results = await cleanRules(
        rules,
        this.config.global.defaultAction,
        this.config.global.dryRun,
        (progress) => {
          this.broadcast({
            type: "cleanup:progress",
            current: progress.current,
            total: progress.total,
            file: progress.currentFile,
            action: progress.action,
          });
        }
      );

      // Record cleanup
      if (!this.config.global.dryRun) {
        recordCleanup(results, "manual");
      }

      const summary = summarizeResults(results);

      this.broadcast({
        type: "cleanup:complete",
        processed: summary.totalProcessed,
        failed: summary.totalFailed,
        sizeFreed: summary.totalSize,
      });

      return {
        results: results.map((r) => ({
          rule: r.rule,
          action: r.action,
          processed: r.processed,
          failed: r.failed,
          totalSize: r.totalSize,
          totalSizeFormatted: formatSize(r.totalSize),
          duration: r.duration,
          errors: r.errors,
        })),
        summary: {
          totalProcessed: summary.totalProcessed,
          totalFailed: summary.totalFailed,
          totalSize: summary.totalSize,
          totalSizeFormatted: formatSize(summary.totalSize),
          totalDuration: summary.totalDuration,
        },
      };
    });

    // Get history
    this.fastify.get<{ Querystring: { limit?: string } }>("/api/history", async (request) => {
      const limit = parseInt(request.query.limit ?? "50", 10);
      const history = getHistory(limit);

      return {
        history: history.map((h) => ({
          ...h,
          sizeFreedFormatted: formatSize(h.sizeFreed),
        })),
      };
    });

    // Get statistics
    this.fastify.get("/api/stats", async () => {
      const stats = getStats();
      return {
        ...stats,
        totalSizeFreedFormatted: formatSize(stats.totalSizeFreed),
      };
    });

    // Get disk usage
    this.fastify.get("/api/disk", async () => {
      const usage = await getDiskUsage();
      if (!usage) {
        return { error: "Could not get disk usage" };
      }
      return {
        total: usage.total,
        used: usage.used,
        free: usage.free,
        usedPercent: usage.usedPercent,
        totalFormatted: formatSize(usage.total),
        usedFormatted: formatSize(usage.used),
        freeFormatted: formatSize(usage.free),
      };
    });

    // Get config
    this.fastify.get("/api/config", async () => {
      return this.config;
    });

    // Update config
    this.fastify.put<{ Body: Config }>("/api/config", async (request, reply) => {
      try {
        const newConfig = request.body;
        await saveConfig(newConfig);
        this.config = newConfig;
        this.scheduler.updateConfig(newConfig);
        this.watcher.updateConfig(newConfig);

        this.broadcast({ type: "config:updated" });

        return { success: true };
      } catch (error) {
        reply.status(400);
        return {
          error: "Invalid configuration",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Reload config from disk
    this.fastify.post("/api/config/reload", async () => {
      const newConfig = await loadConfig();
      this.config = newConfig;
      this.scheduler.updateConfig(newConfig);
      this.watcher.updateConfig(newConfig);

      this.broadcast({ type: "config:reloaded" });

      return { success: true, config: newConfig };
    });

    // WebSocket endpoint
    this.fastify.get("/ws", { websocket: true }, (socket) => {
      this.wsClients.add(socket);

      socket.on("close", () => {
        this.wsClients.delete(socket);
      });

      socket.on("message", (message: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWsMessage(socket, data);
        } catch {
          // Ignore invalid messages
        }
      });

      // Send initial status
      socket.send(JSON.stringify({ type: "connected", pid: process.pid }));
    });
  }

  private handleWsMessage(socket: WebSocket, data: { type: string; [key: string]: unknown }): void {
    switch (data.type) {
      case "ping":
        socket.send(JSON.stringify({ type: "pong" }));
        break;
      case "subscribe":
        // Already subscribed by connecting
        break;
    }
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  broadcast(message: Record<string, unknown>): void {
    const data = JSON.stringify(message);
    for (const client of this.wsClients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  /**
   * Start the API server
   */
  async start(host: string, port: number): Promise<void> {
    await this.setupRoutes();
    await this.fastify.listen({ host, port });
    console.log(`API server listening on http://${host}:${port}`);
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    // Close all WebSocket connections
    for (const client of this.wsClients) {
      client.close();
    }
    this.wsClients.clear();

    await this.fastify.close();
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Update config reference
   */
  updateConfig(config: Config): void {
    this.config = config;
  }
}
