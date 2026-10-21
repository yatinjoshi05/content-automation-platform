import React from 'react';
import { useRouter } from '../utils/router';
import {
  Sparkles,
  ArrowUpRight,
  Video,
  GitFork,
  BarChart3,
  CheckCircle,
  Youtube,
  Instagram,
  Facebook,
  Cpu,
  Layers,
  ShieldCheck,
  Play
} from '../components/Icons';

export const HomePage: React.FC = () => {
  const { navigate } = useRouter();

  return (
    <div style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      {/* 1. Compact Landing Navigation */}
      <nav
        style={{
          height: 68,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 40px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-glass-heavy)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #FF003C 0%, #990024 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1rem',
              boxShadow: '0 0 12px var(--accent-glow)'
            }}
          >
            CA
          </div>
          <span style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            ContentAuto
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: '0.875rem', fontWeight: 500 }}>
          <a href="#features" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Features
          </a>
          <a href="#workflow" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            How It Works
          </a>
          <a href="#integrations" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Integrations
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary btn-sm">
            Dashboard
          </button>
          <button onClick={() => navigate('/create')} className="btn btn-primary btn-sm">
            Get Started <ArrowUpRight size={14} />
          </button>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <section
        style={{
          padding: '80px 24px 60px',
          maxWidth: 1100,
          margin: '0 auto',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--accent-soft)',
            border: '1px solid var(--border-accent)',
            color: 'var(--accent-primary)',
            fontSize: '0.8125rem',
            fontWeight: 600
          }}
        >
          <Sparkles size={14} /> Autonomous Video Production & Multi-Platform Publishing
        </div>

        <h1
          style={{
            fontSize: 'clamp(2.5rem, 5vw, 4.25rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            maxWidth: 900
          }}
        >
          Turn Ideas into Viral Content <span style={{ color: 'var(--accent-primary)' }}>Automatically</span>
        </h1>

        <p
          style={{
            fontSize: 'clamp(1rem, 2vw, 1.25rem)',
            color: 'var(--text-secondary)',
            maxWidth: 720,
            lineHeight: 1.6
          }}
        >
          End-to-end studio orchestration: AI topic discovery, automated script generation, 9:16 vertical video rendering, technical QA validation, and scheduled publication to YouTube Shorts, Instagram Reels, and Facebook Reels.
        </p>

        <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
          <button onClick={() => navigate('/create')} className="btn btn-primary btn-lg">
            Get Started <ArrowUpRight size={16} />
          </button>
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary btn-lg">
            Explore Dashboard
          </button>
        </div>

        {/* 3. Product Preview */}
        <div
          style={{
            width: '100%',
            marginTop: 48,
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface-primary)',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 30px var(--accent-glow)'
          }}
        >
          {/* Mock Browser Header */}
          <div
            style={{
              height: 40,
              background: 'var(--bg-surface-secondary)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#FF5F56' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#FFBD2E' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#27C93F' }} />
            </div>
            <div
              style={{
                margin: '0 auto',
                background: 'var(--bg-main)',
                padding: '3px 20px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)'
              }}
            >
              content-automation.internal/dashboard
            </div>
          </div>

          {/* Interactive Preview Content */}
          <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div className="glass-card" style={{ padding: 16, textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Content</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>248</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--status-success)', marginTop: 2 }}>+12% vs last month</div>
            </div>
            <div className="glass-card" style={{ padding: 16, textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Published Shorts</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>187</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--status-success)', marginTop: 2 }}>+18% success rate</div>
            </div>
            <div className="glass-card" style={{ padding: 16, textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pending Approval</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>23</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--status-warning)', marginTop: 2 }}>Requires review</div>
            </div>
            <div className="glass-card" style={{ padding: 16, textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Orchestration Jobs</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>99.2%</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--status-success)', marginTop: 2 }}>Durable lease recovery</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Feature Cards */}
      <section id="features" style={{ padding: '80px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 54 }}>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Built for High-Frequency Autonomous Publishing
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 10, fontSize: '1rem' }}>
            Industrial-grade workflow management, strict policy gating, and zero silent paid provider failover.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
          <div className="glass-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={20} />
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>AI Content Creation</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Multi-tier model routing prioritizing Google Gemini 3.6 Flash and Groq Llama 3.3 70B with zero paid model leaks.
            </p>
          </div>

          <div className="glass-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GitFork size={20} />
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Automated Workflows</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              16 modular n8n workflows orchestrating discovery, clip extraction, script drafting, QA verification, and scheduled publishing.
            </p>
          </div>

          <div className="glass-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={20} />
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Multi-Platform Publishing</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Native YouTube Data API v3 Resumable Upload protocol, plus Facebook and Instagram Reels Graph API v21.0 integration adapters.
            </p>
          </div>

          <div className="glass-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart3 size={20} />
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Analytics & Insights</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Strict database isolation between raw engagement telemetry (views, retention) and verified financial earnings.
            </p>
          </div>
        </div>
      </section>

      {/* 5. How It Works Workflow */}
      <section id="workflow" style={{ padding: '80px 24px', background: 'var(--bg-surface-secondary)', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12 }}>
            5-Stage Autonomous Lifecycle
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 48, fontSize: '1rem' }}>
            Structured pipeline with strict human-in-the-loop approval gates.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            {[
              { step: '01', title: 'Discover', desc: 'RSS, trends, and niche topic clustering' },
              { step: '02', title: 'Create', desc: 'AI script synthesis & FFmpeg 9:16 rendering' },
              { step: '03', title: 'Review', desc: 'Technical QA validation & human approval gate' },
              { step: '04', title: 'Publish', desc: 'Resumable upload with private test clamping' },
              { step: '05', title: 'Analyze', desc: 'Performance telemetry & retention tracking' }
            ].map(s => (
              <div key={s.step} className="glass-card" style={{ padding: 20, textAlign: 'left' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                  {s.step}
                </span>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginTop: 8 }}>{s.title}</h4>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Honest Integrations Overview */}
      <section id="integrations" style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12 }}>
          Supported Platform Architecture
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 40, fontSize: '1rem' }}>
          Direct verified integrations with cloud platforms and local infrastructure.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div className="glass-card" style={{ padding: 20, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Youtube size={26} color="#FF0000" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>YouTube Data API v3</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Resumable Upload protocol, OAuth2</div>
            </div>
          </div>
          <div className="glass-card" style={{ padding: 20, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Instagram size={26} color="#E1306C" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Instagram Graph API v21.0</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reels container publishing pipeline</div>
            </div>
          </div>
          <div className="glass-card" style={{ padding: 20, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Facebook size={26} color="#1877F2" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Facebook Reels API v21.0</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Page video reels initialization & commit</div>
            </div>
          </div>
          <div className="glass-card" style={{ padding: 20, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Cpu size={26} color="var(--accent-primary)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Google Gemini & Groq</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Priority 10 Flash, Priority 15 Llama 3.3</div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-default)',
          padding: '40px 40px',
          background: 'var(--bg-surface-primary)',
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div>
          Content Automation Platform &copy; 2026. Local Enterprise Studio.
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <span onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Studio Dashboard
          </span>
          <span onClick={() => navigate('/create')} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Create Content
          </span>
          <span onClick={() => navigate('/settings')} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Settings
          </span>
        </div>
      </footer>
    </div>
  );
};
