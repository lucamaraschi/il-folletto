import { useState } from 'react';
import { useRules, useDryRun, useCleanup, Rule } from '../hooks/useApi';

export default function Cleanup() {
  const { rules, loading: rulesLoading } = useRules();
  const { results: dryRunResults, loading: dryRunLoading, run: runDryRun, clear: clearDryRun } = useDryRun();
  const { results: cleanupResults, loading: cleanupLoading, run: runCleanup, clear: clearCleanup } = useCleanup();
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());

  const toggleRule = (name: string) => {
    const newSet = new Set(selectedRules);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setSelectedRules(newSet);
    clearDryRun();
    clearCleanup();
  };

  const selectAll = () => {
    setSelectedRules(new Set(rules.map(r => r.name)));
    clearDryRun();
    clearCleanup();
  };

  const selectNone = () => {
    setSelectedRules(new Set());
    clearDryRun();
    clearCleanup();
  };

  const handleDryRun = async () => {
    if (selectedRules.size === 0) return;
    clearCleanup();
    await runDryRun(Array.from(selectedRules));
  };

  const handleCleanup = async () => {
    if (selectedRules.size === 0) return;
    await runCleanup(Array.from(selectedRules));
  };

  // Get totals from dry run summary
  const totalFiles = dryRunResults?.summary.totalFiles ?? 0;
  const totalSizeFormatted = dryRunResults?.summary.totalSizeFormatted ?? '0 B';

  if (rulesLoading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner"></div>
          Loading rules...
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: '1.5rem' }}>Cleanup</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1rem' }}>
        <div>
          <div className="card">
            <div className="card-title">Select Rules</div>
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={selectAll}>Select All</button>
              <button className="btn btn-secondary" onClick={selectNone}>Clear</button>
            </div>

            {rules.map((rule: Rule) => (
              <div
                key={rule.name}
                className="rule-item"
                style={{ cursor: 'pointer' }}
                onClick={() => toggleRule(rule.name)}
              >
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={selectedRules.has(rule.name)}
                  onChange={() => toggleRule(rule.name)}
                />
                <span className="rule-name">{rule.name}</span>
                <span className="rule-action">{rule.action || 'trash'}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleDryRun}
              disabled={selectedRules.size === 0 || dryRunLoading}
              style={{ flex: 1 }}
            >
              {dryRunLoading ? 'Scanning...' : 'Preview'}
            </button>
            <button
              className="btn btn-danger"
              onClick={handleCleanup}
              disabled={selectedRules.size === 0 || cleanupLoading || !dryRunResults}
              style={{ flex: 1 }}
            >
              {cleanupLoading ? 'Cleaning...' : 'Clean'}
            </button>
          </div>
        </div>

        <div>
          {cleanupResults && (
            <div className="card" style={{ marginBottom: '1rem', background: 'var(--success)', color: '#000' }}>
              <div className="card-title" style={{ color: '#000' }}>Cleanup Complete!</div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Total:</strong> {cleanupResults.summary.totalProcessed} files, {cleanupResults.summary.totalSizeFormatted}
              </div>
              {cleanupResults.results.map((result, i) => (
                <div key={i} style={{ marginBottom: '0.5rem' }}>
                  <strong>{result.rule}</strong>: {result.processed} files, {result.totalSizeFormatted}
                  {result.failed > 0 && <span style={{ color: 'var(--error)' }}> ({result.failed} failed)</span>}
                </div>
              ))}
            </div>
          )}

          {dryRunResults && !cleanupResults && (
            <div className="card">
              <div className="card-title">
                Preview: {totalFiles} files ({totalSizeFormatted})
              </div>

              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="stat-value">{totalFiles}</div>
                  <div className="stat-label">Files to Clean</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{totalSizeFormatted}</div>
                  <div className="stat-label">Space to Free</div>
                </div>
              </div>

              {dryRunResults.results.map((result) => (
                <div key={result.rule} style={{ marginBottom: '1rem' }}>
                  <h4 style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>
                    {result.rule} ({result.fileCount} files, {result.totalSizeFormatted})
                  </h4>
                  <div className="file-list" style={{ maxHeight: '150px' }}>
                    {result.files.map((file, i) => (
                      <div key={i} className="file-item">
                        <span>{file.path}</span>
                        <span className="file-size">{file.sizeFormatted}</span>
                      </div>
                    ))}
                    {result.hasMore && (
                      <div style={{ color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                        ... and more files (showing first 100)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!dryRunResults && !cleanupResults && (
            <div className="card">
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                Select rules and click "Preview" to see what will be cleaned
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
