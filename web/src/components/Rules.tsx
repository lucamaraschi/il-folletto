import { useState } from 'react';
import { useRules, Rule, useDryRun } from '../hooks/useApi';

interface RuleDetailProps {
  rule: Rule;
  onClose: () => void;
  onPreview: () => void;
  previewLoading: boolean;
}

function RuleDetail({ rule, onClose, onPreview, previewLoading }: RuleDetailProps) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ marginBottom: '0.5rem' }}>{rule.name}</h2>
          {rule.description && (
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{rule.description}</p>
          )}
        </div>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Action</h4>
          <span className={`btn btn-${rule.action === 'delete' ? 'danger' : 'secondary'}`} style={{ cursor: 'default' }}>
            {rule.action || 'trash'}
          </span>
        </div>

        <div>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Target</h4>
          <span>{rule.target || 'files'}</span>
        </div>

        <div>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Paths</h4>
          <ul style={{ listStyle: 'none', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {rule.paths.map((p, i) => (
              <li key={i} style={{ color: 'var(--text-primary)' }}>{p}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Patterns</h4>
          <ul style={{ listStyle: 'none', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {rule.patterns.map((p, i) => (
              <li key={i} style={{ color: 'var(--accent)' }}>{p}</li>
            ))}
          </ul>
        </div>
      </div>

      {rule.conditions && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Conditions</h4>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {rule.conditions.olderThan && (
              <span className="btn btn-secondary" style={{ cursor: 'default' }}>
                Older than: {rule.conditions.olderThan}
              </span>
            )}
            {rule.conditions.newerThan && (
              <span className="btn btn-secondary" style={{ cursor: 'default' }}>
                Newer than: {rule.conditions.newerThan}
              </span>
            )}
            {rule.conditions.largerThan && (
              <span className="btn btn-secondary" style={{ cursor: 'default' }}>
                Larger than: {rule.conditions.largerThan}
              </span>
            )}
            {rule.conditions.smallerThan && (
              <span className="btn btn-secondary" style={{ cursor: 'default' }}>
                Smaller than: {rule.conditions.smallerThan}
              </span>
            )}
          </div>
        </div>
      )}

      {rule.exceptions && rule.exceptions.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Exceptions</h4>
          <ul style={{ listStyle: 'none', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {rule.exceptions.map((e, i) => (
              <li key={i} style={{ color: 'var(--warning)' }}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <button
          className="btn btn-primary"
          onClick={onPreview}
          disabled={previewLoading}
        >
          {previewLoading ? 'Scanning...' : 'Preview Files'}
        </button>
      </div>
    </div>
  );
}

export default function Rules() {
  const { rules, loading, error } = useRules();
  const { results: previewResults, loading: previewLoading, run: runDryRun, clear: clearPreview } = useDryRun();
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);

  const handlePreview = async (ruleName: string) => {
    await runDryRun([ruleName]);
  };

  const previewData = selectedRule && previewResults
    ? previewResults.results.find(r => r.rule === selectedRule.name)
    : null;
  const previewFiles = previewData?.files || [];

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner"></div>
          Loading rules...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ background: 'var(--error)', color: 'white' }}>
          Error loading rules: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: '1.5rem' }}>Rules</h1>

      <div style={{ display: 'grid', gridTemplateColumns: selectedRule ? '300px 1fr' : '1fr', gap: '1rem' }}>
        <div>
          {rules.map((rule) => (
            <div
              key={rule.name}
              className="rule-item"
              style={{
                cursor: 'pointer',
                borderLeft: selectedRule?.name === rule.name ? '3px solid var(--accent)' : '3px solid transparent',
              }}
              onClick={() => {
                setSelectedRule(rule);
                clearPreview();
              }}
            >
              <input
                type="checkbox"
                className="checkbox"
                checked={rule.enabled !== false}
                readOnly
              />
              <span className="rule-name">{rule.name}</span>
              <span className="rule-action">{rule.action || 'trash'}</span>
            </div>
          ))}
        </div>

        {selectedRule && (
          <div>
            <RuleDetail
              rule={selectedRule}
              onClose={() => {
                setSelectedRule(null);
                clearPreview();
              }}
              onPreview={() => handlePreview(selectedRule.name)}
              previewLoading={previewLoading}
            />

            {previewData && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-title">
                  Preview: {previewData.fileCount} files ({previewData.totalSizeFormatted})
                </div>
                <div className="file-list">
                  {previewFiles.map((file, i) => (
                    <div key={i} className="file-item">
                      <span>{file.path}</span>
                      <span className="file-size">{file.sizeFormatted}</span>
                    </div>
                  ))}
                  {previewData.hasMore && (
                    <div style={{ color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                      ... and more files (showing first 100)
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
