import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api';

export interface DaemonStatus {
  running: boolean;
  pid: number;
  uptime: number;
  uptimeFormatted: string;
  lastCleanup: string | null;
  nextScheduled: string | null;
  nextScheduleName: string | null;
  totalCleaned: number;
  totalSizeFreed: number;
  totalSizeFreedFormatted: string;
  dryRun: boolean;
}

export interface Rule {
  name: string;
  description?: string;
  enabled?: boolean;
  action?: 'trash' | 'delete' | 'move' | 'compress';
  target?: 'files' | 'directories' | 'all';
  paths: string[];
  patterns: string[];
  conditions?: {
    olderThan?: string;
    newerThan?: string;
    largerThan?: string;
    smallerThan?: string;
  };
  exceptions?: string[];
}

export interface Schedule {
  name: string;
  enabled?: boolean;
  cron: string;
  rules: string[];
}

export interface Config {
  version: number;
  global?: {
    dryRun?: boolean;
    logLevel?: string;
    defaultAction?: string;
  };
  rules: Rule[];
  schedules?: Schedule[];
}

export interface FileResult {
  path: string;
  size: number;
  sizeFormatted: string;
  mtime: string;
}

export interface ScanResult {
  rule: string;
  fileCount: number;
  totalSize: number;
  totalSizeFormatted: string;
  files: FileResult[];
  hasMore: boolean;
}

export interface DryRunResponse {
  results: ScanResult[];
  summary: {
    totalFiles: number;
    totalSize: number;
    totalSizeFormatted: string;
  };
}

export interface CleanupResultItem {
  rule: string;
  action: string;
  processed: number;
  failed: number;
  totalSize: number;
  totalSizeFormatted: string;
  duration: number;
  errors: Array<{ path: string; error: string }>;
}

export interface CleanupResponse {
  results: CleanupResultItem[];
  summary: {
    totalProcessed: number;
    totalFailed: number;
    totalSize: number;
    totalSizeFormatted: string;
    totalDuration: number;
  };
}

export interface HistoryEntry {
  timestamp: string;
  rule: string;
  filesProcessed: number;
  filesFailed: number;
  sizeFreed: number;
  sizeFreedFormatted: string;
  trigger: 'manual' | 'scheduled' | 'watcher';
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export function useStatus() {
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi<DaemonStatus>('/status');
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { status, loading, error, refresh };
}

export function useRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi<{ rules: Rule[] }>('/rules');
      setRules(data.rules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateRule = useCallback(async (name: string, rule: Rule) => {
    await fetchApi(`/rules/${name}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
    });
    await refresh();
  }, [refresh]);

  const createRule = useCallback(async (rule: Rule) => {
    await fetchApi('/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
    await refresh();
  }, [refresh]);

  const deleteRule = useCallback(async (name: string) => {
    await fetchApi(`/rules/${name}`, { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  return { rules, loading, error, refresh, updateRule, createRule, deleteRule };
}

export function useConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi<Config>('/config');
      setConfig(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { config, loading, error, refresh };
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi<{ history: HistoryEntry[] }>('/history');
      setHistory(data.history);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { history, loading, error, refresh };
}

export function useDryRun() {
  const [results, setResults] = useState<DryRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (ruleNames?: string[]) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<DryRunResponse>('/dry-run', {
        method: 'POST',
        body: JSON.stringify({ rules: ruleNames }),
      });
      setResults(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dry run failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return { results, loading, error, run, clear };
}

export function useCleanup() {
  const [results, setResults] = useState<CleanupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (ruleNames?: string[]) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<CleanupResponse>('/clean', {
        method: 'POST',
        body: JSON.stringify({ rules: ruleNames }),
      });
      setResults(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cleanup failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return { results, loading, error, run, clear };
}

export function useWebSocket(onMessage: (data: unknown) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [onMessage]);

  return { connected };
}

export interface DiskUsage {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
  totalFormatted: string;
  usedFormatted: string;
  freeFormatted: string;
}

export function useDiskUsage() {
  const [disk, setDisk] = useState<DiskUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi<DiskUsage>('/disk');
      setDisk(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch disk usage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [refresh]);

  return { disk, loading, error, refresh };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString();
}
