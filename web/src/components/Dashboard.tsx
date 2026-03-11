import { useStatus, useHistory, useDiskUsage, formatBytes, formatDate } from '../hooks/useApi';

function DiskUsageChart({ usedPercent, used, total, free }: { usedPercent: number; used: string; total: string; free: string }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (usedPercent / 100) * circumference;

  // Color based on usage
  const getColor = (percent: number) => {
    if (percent >= 90) return '#ef4444'; // red
    if (percent >= 75) return '#f59e0b'; // amber
    return '#10b981'; // green
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
      <div style={{ position: 'relative', width: '120px', height: '120px' }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          {/* Background circle */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="var(--card-bg)"
            strokeWidth="10"
          />
          {/* Progress circle */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={getColor(usedPercent)}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)' }}>
            {usedPercent}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>used</div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Used</span>
            <span style={{ color: 'var(--text)' }}>{used}</span>
          </div>
          <div style={{
            height: '6px',
            background: 'var(--card-bg)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${usedPercent}%`,
              height: '100%',
              background: getColor(usedPercent),
              borderRadius: '3px',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <span>Free: {free}</span>
          <span>Total: {total}</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { status, loading: statusLoading, error: statusError } = useStatus();
  const { history, loading: historyLoading } = useHistory();
  const { disk, loading: diskLoading } = useDiskUsage();

  const recentHistory = history.slice(0, 10);
  const totalCleaned = history.reduce((acc, h) => acc + h.sizeFreed, 0);
  const totalFiles = history.reduce((acc, h) => acc + h.filesProcessed, 0);

  return (
    <div className="container">
      <h1 style={{ marginBottom: '1.5rem' }}>Dashboard</h1>

      {statusError && (
        <div className="card" style={{ background: 'var(--error)', color: 'white', marginBottom: '1rem' }}>
          Daemon not running: {statusError}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">
            {statusLoading ? '...' : status?.running ? (
              <span className="status">
                <span className="status-dot active"></span>
                Running
              </span>
            ) : (
              <span className="status">
                <span className="status-dot inactive"></span>
                Stopped
              </span>
            )}
          </div>
          <div className="stat-label">Daemon Status</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">
            {status?.uptimeFormatted ?? '-'}
          </div>
          <div className="stat-label">Uptime</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{status?.totalCleaned ?? '-'}</div>
          <div className="stat-label">Files Cleaned</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{status?.totalSizeFreedFormatted ?? '-'}</div>
          <div className="stat-label">Space Freed</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div className="card">
          <div className="card-title">Disk Usage</div>
          {diskLoading ? (
            <div className="loading">
              <div className="spinner"></div>
              Loading disk info...
            </div>
          ) : disk ? (
            <DiskUsageChart
              usedPercent={disk.usedPercent}
              used={disk.usedFormatted}
              total={disk.totalFormatted}
              free={disk.freeFormatted}
            />
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Could not load disk usage</p>
          )}
        </div>

        <div className="card">
          <div className="card-title">Last Cleanup</div>
          {status?.lastCleanup ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              {formatDate(status.lastCleanup)}
            </p>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>No cleanup run yet</p>
          )}
          <div style={{ marginTop: '1rem' }}>
            <div className="card-title" style={{ marginTop: '0.5rem' }}>Session Stats</div>
            <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text)' }}>
                  {formatBytes(totalCleaned)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Space Freed</div>
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text)' }}>
                  {totalFiles}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Files Cleaned</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">Recent Activity</div>
        {historyLoading ? (
          <div className="loading">
            <div className="spinner"></div>
            Loading history...
          </div>
        ) : recentHistory.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No cleanup history yet</p>
        ) : (
          <div>
            {recentHistory.map((entry, i) => (
              <div key={i} className="history-item">
                <span className="history-time">{formatDate(entry.timestamp)}</span>
                <span className="history-rule">{entry.rule}</span>
                <span className="history-stats">
                  {entry.filesProcessed} files, {entry.sizeFreedFormatted}
                </span>
                <span className="history-trigger">{entry.trigger}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
