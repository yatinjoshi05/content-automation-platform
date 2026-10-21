import React, { useState } from 'react';
import { useRouter } from '../utils/router';
import { useToast } from '../components/ui/Toast';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  Sparkles,
  Video,
  FileText,
  Edit3,
  CheckCircle,
  Play,
  Clock,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  ChevronRight
} from '../components/Icons';

type Step = 'script' | 'generate' | 'edit' | 'preview';

export const CreateContentPage: React.FC = () => {
  const { navigate } = useRouter();
  const toast = useToast();

  const [currentStep, setCurrentStep] = useState<Step>('script');

  // Form State
  const [topic, setTopic] = useState('');
  const [contentType, setContentType] = useState('Informative');
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(['youtube']);
  const [tone, setTone] = useState('Engaging & Energetic');
  const [instructions, setInstructions] = useState('');

  // Script State
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Video State
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [durationSecs, setDurationSecs] = useState('30');
  const [modelProvider, setModelProvider] = useState('gemini');
  const [videoStatus, setVideoStatus] = useState<'idle' | 'rendering' | 'ready'>('idle');
  const [renderProgress, setRenderProgress] = useState(0);

  // Edit State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('#Shorts, #AI, #Tech');
  const [thumbnailUrl, setThumbnailUrl] = useState('/media/orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4');

  // AI Suggest Ideas handler
  const handleSuggestIdeas = () => {
    const ideas = [
      'Top 3 AI breakthroughs this week you missed',
      'Why quantum computing will change cybersecurity in 2027',
      '5 productivity hacks engineered with local automations',
      'How to build an autonomous content pipeline from scratch'
    ];
    const picked = ideas[Math.floor(Math.random() * ideas.length)];
    setTopic(picked);
    toast.info('AI Idea Suggested', picked);
  };

  // Generate Script Action
  const handleGenerateScript = () => {
    if (!topic.trim()) {
      toast.error('Validation Error', 'Please enter a topic or concept before generating a script.');
      return;
    }
    setIsGeneratingScript(true);
    setTimeout(() => {
      const scriptText = `[Hook - 0:00 - 0:04]\n"Did you know that 90% of content creators spend more time scheduling than actually creating?"\n\n[Body - 0:04 - 0:20]\n"Here is how autonomous workflows change the entire game. Instead of manually editing vertical videos and uploading them across YouTube and Instagram, modern platforms use local AI orchestrators to handle rendering, technical QA, and privacy-gated uploads."\n\n[Call to Action - 0:20 - 0:28]\n"Subscribe to Content Automation Lab for the full breakdown of how to build your own local studio."`;
      setGeneratedScript(scriptText);
      setTitle(`${topic} #Shorts`);
      setDescription(`Explaining ${topic} with autonomous studio workflows.\n\n#Shorts #Automation #ContentCreation`);
      setIsGeneratingScript(false);
      setCurrentStep('generate');
      toast.success('Script Synthesized', 'Generated via Google Gemini 3.6 Flash (Priority 10).');
    }, 1200);
  };

  // Generate Video Action
  const handleGenerateVideo = () => {
    setVideoStatus('rendering');
    setRenderProgress(15);
    toast.info('Rendering Started', 'FFmpeg vertical 9:16 rendering initiated on Drive D:');

    const interval = setInterval(() => {
      setRenderProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setVideoStatus('ready');
          toast.success('Video Rendered', 'QA checks passed: 720x1280 vertical H.264 video ready.');
          return 100;
        }
        return prev + 25;
      });
    }, 600);
  };

  // Submit for Approval / Scheduling
  const handleSubmitForApproval = () => {
    toast.success('Submitted for Review', 'Content version queued in Approval Queue.');
    navigate('/publishing');
  };

  const steps: { id: Step; label: string; num: string }[] = [
    { id: 'script', label: '1. Script Synthesis', num: '01' },
    { id: 'generate', label: '2. Video Production', num: '02' },
    { id: 'edit', label: '3. Asset Editing', num: '03' },
    { id: 'preview', label: '4. Preview & Gate', num: '04' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000, margin: '0 auto' }}>
      <Breadcrumbs items={[{ label: 'Studio', href: '/dashboard' }, { label: 'Create Content' }]} />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Content Creation Studio</h1>
          <p className="page-subtitle">
            Synthesize scripts, render vertical media assets, and submit to pre-publish verification.
          </p>
        </div>
      </div>

      {/* Stepper Navigation */}
      <div
        className="glass-card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: 12,
          gap: 8,
          flexWrap: 'wrap'
        }}
      >
        {steps.map(s => {
          const isActive = currentStep === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentStep(s.id)}
              className="btn btn-sm"
              style={{
                flex: 1,
                minWidth: 160,
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                borderColor: isActive ? 'var(--border-accent)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                justifyContent: 'flex-start',
                padding: '8px 14px'
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: isActive ? 'var(--accent-primary)' : 'var(--bg-surface-secondary)',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6875rem',
                  fontWeight: 700
                }}
              >
                {s.num}
              </span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* STAGE 1: SCRIPT SYNTHESIS */}
      {currentStep === 'script' && (
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Topic & Script Configuration</h3>
            <button onClick={handleSuggestIdeas} className="btn btn-secondary btn-sm">
              <Sparkles size={14} color="var(--accent-primary)" /> AI Suggest Ideas
            </button>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Topic or Content Concept *
            </label>
            <input
              type="text"
              className="input-base"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Why autonomous AI agent loops are taking over production dev"
              maxLength={150}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
              <span>Be specific to improve AI hook generation</span>
              <span>{topic.length} / 150</span>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Content Archetype
              </label>
              <select className="input-base" value={contentType} onChange={e => setContentType(e.target.value)}>
                <option value="Informative">Informative / Educational</option>
                <option value="Listicle">Listicle / Countdown</option>
                <option value="How To">How-To Tutorial</option>
                <option value="Tips">Quick Tips</option>
                <option value="Vlog">Studio Behind-the-Scenes</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Tone & Voice
              </label>
              <select className="input-base" value={tone} onChange={e => setTone(e.target.value)}>
                <option value="Engaging & Energetic">Engaging & Energetic</option>
                <option value="Authoritative & Direct">Authoritative & Direct</option>
                <option value="Conversational & Casual">Conversational & Casual</option>
                <option value="Curious & Provocative">Curious & Provocative</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Target Platforms
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              {['youtube', 'instagram', 'facebook'].map(p => {
                const isSel = targetPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      if (isSel) {
                        if (targetPlatforms.length > 1) {
                          setTargetPlatforms(targetPlatforms.filter(x => x !== p));
                        }
                      } else {
                        setTargetPlatforms([...targetPlatforms, p]);
                      }
                    }}
                    className="btn btn-sm"
                    style={{
                      background: isSel ? 'var(--accent-soft)' : 'var(--bg-surface-secondary)',
                      borderColor: isSel ? 'var(--border-accent)' : 'var(--border-default)',
                      color: isSel ? 'var(--accent-primary)' : 'var(--text-secondary)'
                    }}
                  >
                    <PlatformBadge platform={p} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Additional Producer Instructions (Optional)
            </label>
            <textarea
              className="input-base"
              rows={3}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="e.g. Keep hook under 3 seconds. Focus on real-world engineering metrics."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleGenerateScript}
              disabled={isGeneratingScript || !topic.trim()}
              className="btn btn-primary"
            >
              {isGeneratingScript ? (
                <>
                  <RefreshCw size={14} className="icon-spin" /> Synthesizing...
                </>
              ) : (
                <>
                  Generate Script <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        </GlassCard>
      )}

      {/* STAGE 2: VIDEO PRODUCTION */}
      {currentStep === 'generate' && (
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Script Preview & Video Rendering</h3>
            <button onClick={() => setCurrentStep('script')} className="btn btn-ghost btn-sm">
              ← Edit Script
            </button>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Synthesized Script
            </label>
            <textarea
              className="input-base"
              rows={6}
              value={generatedScript}
              onChange={e => setGeneratedScript(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.6 }}
            />
          </div>

          <div className="grid-cols-auto-fit">
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Aspect Ratio
              </label>
              <select className="input-base" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
                <option value="9:16">9:16 Vertical (Shorts / Reels)</option>
                <option value="1:1">1:1 Square (Feed)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Target Duration
              </label>
              <select className="input-base" value={durationSecs} onChange={e => setDurationSecs(e.target.value)}>
                <option value="15">15 Seconds (Micro)</option>
                <option value="30">30 Seconds (Standard)</option>
                <option value="59">59 Seconds (Max Short)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                AI Model Provider
              </label>
              <select className="input-base" value={modelProvider} onChange={e => setModelProvider(e.target.value)}>
                <option value="gemini">Google Gemini 3.6 Flash (P10 Free)</option>
                <option value="groq">Groq Llama 3.3 70B (P15 Free)</option>
              </select>
            </div>
          </div>

          {videoStatus === 'rendering' && (
            <div style={{ padding: 16, background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 6 }}>
                <span>Rendering Video Pipeline (FFmpeg)...</span>
                <span style={{ fontWeight: 600 }}>{renderProgress}%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: 'var(--bg-main)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ width: `${renderProgress}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 300ms' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => setCurrentStep('script')} className="btn btn-secondary">
              Back
            </button>
            {videoStatus === 'ready' ? (
              <button onClick={() => setCurrentStep('edit')} className="btn btn-primary">
                Proceed to Edit Assets <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleGenerateVideo}
                disabled={videoStatus === 'rendering'}
                className="btn btn-primary"
              >
                {videoStatus === 'rendering' ? 'Rendering...' : 'Render Video Asset'}
              </button>
            )}
          </div>
        </GlassCard>
      )}

      {/* STAGE 3: ASSET EDITING */}
      {currentStep === 'edit' && (
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Metadata & Packaging</h3>
            <button onClick={() => setCurrentStep('generate')} className="btn btn-ghost btn-sm">
              ← Re-render
            </button>
          </div>

          <div className="grid-2">
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Video Title *
              </label>
              <input
                type="text"
                className="input-base"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={100}
              />
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {title.length} / 100 characters (Includes #Shorts tag)
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Hashtags & Tags
              </label>
              <input
                type="text"
                className="input-base"
                value={tags}
                onChange={e => setTags(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Description
            </label>
            <textarea
              className="input-base"
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => setCurrentStep('generate')} className="btn btn-secondary">
              Back
            </button>
            <button onClick={() => setCurrentStep('preview')} className="btn btn-primary">
              Review Final Preview <ChevronRight size={14} />
            </button>
          </div>
        </GlassCard>
      )}

      {/* STAGE 4: PREVIEW & GATE */}
      {currentStep === 'preview' && (
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Pre-Publish Verification Gate</h3>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--status-success-bg)',
                color: 'var(--status-success)',
                fontWeight: 600
              }}
            >
              <CheckCircle size={13} color="var(--status-success)" /> QA Passed
            </span>
          </div>

          <div className="grid-2">
            {/* Video Player Box */}
            <div
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                background: '#000',
                border: '1px solid var(--border-default)',
                aspectRatio: '9/16',
                maxHeight: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto'
              }}
            >
              <video
                src="/media/orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4"
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            {/* Verification Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>Publishing Summary</h4>
              <div style={{ padding: 12, background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-line' }}>{description}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Vertical Resolution</span>
                  <span style={{ fontWeight: 600 }}>720 x 1280 (9:16)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Target Platforms</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {targetPlatforms.map(p => (
                      <PlatformBadge key={p} platform={p} showIconOnly />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Scheduled Visibility</span>
                  <span style={{ fontWeight: 600, color: 'var(--status-warning)' }}>Strictly PRIVATE</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Rights Clearance</span>
                  <span style={{ fontWeight: 600, color: 'var(--status-success)' }}>Cleared (First-party)</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 16 }}>
                <button onClick={() => setCurrentStep('edit')} className="btn btn-secondary" style={{ flex: 1 }}>
                  Back
                </button>
                <button onClick={handleSubmitForApproval} className="btn btn-primary" style={{ flex: 2 }}>
                  Submit for Approval <CheckCircle size={14} />
                </button>
              </div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
