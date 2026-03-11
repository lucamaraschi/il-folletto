import { useState, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import Rules from './components/Rules';
import Cleanup from './components/Cleanup';
import { useWebSocket } from './hooks/useApi';

type View = 'dashboard' | 'rules' | 'cleanup';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [notification, setNotification] = useState<string | null>(null);

  const handleWebSocketMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; message?: string };
    if (msg.type === 'cleanup-complete') {
      setNotification('Cleanup completed!');
      setTimeout(() => setNotification(null), 3000);
    } else if (msg.type === 'cleanup-started') {
      setNotification('Cleanup started...');
      setTimeout(() => setNotification(null), 3000);
    }
  }, []);

  const { connected } = useWebSocket(handleWebSocketMessage);

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="nav">
        <span className="nav-brand">il-folletto</span>
        <div className="nav-links">
          <a
            href="#"
            className={`nav-link ${view === 'dashboard' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setView('dashboard'); }}
          >
            Dashboard
          </a>
          <a
            href="#"
            className={`nav-link ${view === 'rules' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setView('rules'); }}
          >
            Rules
          </a>
          <a
            href="#"
            className={`nav-link ${view === 'cleanup' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setView('cleanup'); }}
          >
            Cleanup
          </a>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`status-dot ${connected ? 'active' : 'inactive'}`}></span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </nav>

      {notification && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          background: 'var(--bg-card)',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          {notification}
        </div>
      )}

      <main style={{ paddingTop: '1rem' }}>
        {view === 'dashboard' && <Dashboard />}
        {view === 'rules' && <Rules />}
        {view === 'cleanup' && <Cleanup />}
      </main>
    </div>
  );
}
