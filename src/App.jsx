import React, { useEffect, Component } from 'react';
import { GameProvider, useGame } from './GameContext';
import IntroView from './components/IntroView';
import IdentityView from './components/IdentityView';
import CareerView from './components/CareerView';
import MatchView from './components/MatchView';
import SummaryView from './components/SummaryView';
import HelpModal from './components/HelpModal';
import NewsModal from './components/NewsModal';
import ShareModal from './components/ShareModal';
import TopBar from './components/TopBar';
import Footer from './components/Footer';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif',
          color: '#e0e0e0', background: '#0e100f', minHeight: '100vh',
          padding: '2rem', fontSize: '14px', lineHeight: 1.8,
        }}>
          <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>渲染出错</h2>
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            background: '#1a1a1a', padding: '1rem', borderRadius: '8px',
            fontSize: '12px', color: '#f87171',
          }}>{this.state.error?.message}{'\n\n'}{this.state.error?.stack}</pre>
          {this.state.info?.componentStack && (
            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              background: '#1a1a1a', padding: '1rem', borderRadius: '8px',
              fontSize: '11px', color: '#888', marginTop: '1rem',
            }}>{this.state.info.componentStack}</pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function GameShell() {
  const { state, PHASES } = useGame();
  const { phase } = state;

  useEffect(() => {
    document.body.classList.toggle('no-actionbar', phase !== PHASES.IDENTITY);
    document.body.classList.toggle('in-career', phase === PHASES.CAREER);
    document.body.classList.toggle('in-match', phase === PHASES.MATCH);
  }, [phase, PHASES]);

  return (
    <>
      <TopBar />
      <main id="app" className={phase === PHASES.CAREER || phase === PHASES.SUMMARY ? 'wide' : ''}>
        {phase === PHASES.INTRO && <IntroView />}
        {phase === PHASES.IDENTITY && <IdentityView />}
        {phase === PHASES.CAREER && <CareerView />}
        {phase === PHASES.MATCH && <MatchView />}
        {phase === PHASES.SUMMARY && <SummaryView />}
      </main>
      <Footer />
      <HelpModal />
      <NewsModal />
      <ShareModal />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GameProvider>
        <GameShell />
      </GameProvider>
    </ErrorBoundary>
  );
}
