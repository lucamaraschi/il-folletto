import cron, { type ScheduledTask } from "node-cron";
import type { Config, Schedule, CleanupResult } from "../core/types.js";
import { getRulesByNames } from "../core/config.js";
import { cleanRules } from "../core/cleaner.js";
import { recordCleanup } from "./state.js";

export interface SchedulerEvents {
  onScheduleStart?: (schedule: Schedule) => void;
  onScheduleComplete?: (schedule: Schedule, results: CleanupResult[]) => void;
  onScheduleError?: (schedule: Schedule, error: Error) => void;
}

interface ScheduledJob {
  schedule: Schedule;
  task: ScheduledTask;
  nextRun: Date | null;
}

export class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private config: Config;
  private events: SchedulerEvents;
  private running: boolean = false;

  constructor(config: Config, events: SchedulerEvents = {}) {
    this.config = config;
    this.events = events;
  }

  /**
   * Start all enabled schedules
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const schedule of this.config.schedules) {
      if (!schedule.enabled) continue;
      this.addSchedule(schedule);
    }
  }

  /**
   * Stop all schedules
   */
  stop(): void {
    this.running = false;
    for (const job of this.jobs.values()) {
      job.task.stop();
    }
    this.jobs.clear();
  }

  /**
   * Add a schedule
   */
  addSchedule(schedule: Schedule): void {
    if (this.jobs.has(schedule.name)) {
      this.removeSchedule(schedule.name);
    }

    if (!cron.validate(schedule.cron)) {
      console.error(`Invalid cron expression for schedule ${schedule.name}: ${schedule.cron}`);
      return;
    }

    const task = cron.schedule(
      schedule.cron,
      async () => {
        await this.executeSchedule(schedule);
      },
      { scheduled: true }
    );

    this.jobs.set(schedule.name, {
      schedule,
      task,
      nextRun: this.getNextRun(schedule.cron),
    });
  }

  /**
   * Remove a schedule
   */
  removeSchedule(name: string): void {
    const job = this.jobs.get(name);
    if (job) {
      job.task.stop();
      this.jobs.delete(name);
    }
  }

  /**
   * Execute a schedule manually
   */
  async executeSchedule(schedule: Schedule): Promise<CleanupResult[]> {
    this.events.onScheduleStart?.(schedule);

    try {
      const rules = getRulesByNames(this.config, schedule.rules);

      if (rules.length === 0) {
        console.warn(`No rules found for schedule ${schedule.name}`);
        return [];
      }

      const results = await cleanRules(
        rules,
        this.config.global.defaultAction,
        this.config.global.dryRun
      );

      // Record the cleanup
      if (!this.config.global.dryRun) {
        recordCleanup(results, "scheduled");
      }

      this.events.onScheduleComplete?.(schedule, results);

      // Update next run time
      const job = this.jobs.get(schedule.name);
      if (job) {
        job.nextRun = this.getNextRun(schedule.cron);
      }

      return results;
    } catch (error) {
      this.events.onScheduleError?.(schedule, error as Error);
      throw error;
    }
  }

  /**
   * Get next run time for a cron expression
   */
  private getNextRun(cronExpression: string): Date | null {
    try {
      // node-cron doesn't provide next run time directly
      // We'll use a simple approximation
      const parts = cronExpression.split(" ");
      if (parts.length < 5) return null;

      const now = new Date();
      const next = new Date(now);

      // Parse minute
      const minute = parts[0] ?? "*";
      if (minute !== "*") {
        next.setMinutes(parseInt(minute, 10));
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
      }

      return next;
    } catch {
      return null;
    }
  }

  /**
   * Get all scheduled jobs
   */
  getJobs(): Array<{
    name: string;
    cron: string;
    enabled: boolean;
    nextRun: Date | null;
    rules: string[];
  }> {
    const result: Array<{
      name: string;
      cron: string;
      enabled: boolean;
      nextRun: Date | null;
      rules: string[];
    }> = [];

    // Include all schedules, not just active jobs
    for (const schedule of this.config.schedules) {
      const job = this.jobs.get(schedule.name);
      result.push({
        name: schedule.name,
        cron: schedule.cron,
        enabled: schedule.enabled,
        nextRun: job?.nextRun ?? null,
        rules: schedule.rules,
      });
    }

    return result;
  }

  /**
   * Get next scheduled cleanup
   */
  getNextScheduledCleanup(): { schedule: string; time: Date } | null {
    let earliest: { schedule: string; time: Date } | null = null;

    for (const [name, job] of this.jobs) {
      if (job.nextRun) {
        if (!earliest || job.nextRun < earliest.time) {
          earliest = { schedule: name, time: job.nextRun };
        }
      }
    }

    return earliest;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Config): void {
    this.config = config;

    // Restart if running
    if (this.running) {
      this.stop();
      this.start();
    }
  }
}
