// loading-screen.tsx — Turiwa Luxury Splash (Production React / Tailwind Component)
import React, { useEffect, useState, useMemo } from 'react';

export interface LoadingScreenProps {
  onComplete?: () => void;
  duration?: number;
  initialTheme?: 'auto' | 'dark' | 'light';
}

/**
 * Turiwa Flow Mark — Precision Golden-Ratio Vector Mark
 */
export function FlowMarkLogo({ isDark }: { isDark: boolean }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className="relative w-24 h-24 transform transition-transform duration-300 drop-shadow-xl"
      style={{
        animation: 'turiwaLogoBreathe 2.6s ease-in-out infinite',
      }}
    >
      <defs>
        {/* Luminous Neon Gradient */}
        <linearGradient id="flowGradDarkLuxWeb" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FF87" />
          <stop offset="55%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>

        {/* High-End Architectural Jade Gradient */}
        <linearGradient id="flowGradLightLuxWeb" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#064E3B" />
          <stop offset="65%" stopColor="#059669" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>

        <radialGradient id="flowWebAura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={isDark ? '#00E599' : '#059669'} stopOpacity={isDark ? '0.40' : '0.22'} />
          <stop offset="100%" stopColor={isDark ? '#04070A' : '#FFFFFF'} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Volumetric Core Glow */}
      <circle cx="60" cy="58" r="50" fill="url(#flowWebAura)" />

      {/* Precision Golden-Ratio Construction Guide */}
      <circle
        cx="60"
        cy="58"
        r="44"
        stroke={isDark ? 'rgba(0, 255, 135, 0.12)' : 'rgba(6, 95, 70, 0.10)'}
        strokeWidth="0.8"
        strokeDasharray="2 6"
        fill="none"
      />

      <g>
        {/* Central Converging Spine forming the T silhouette */}
        <path
          d="M 60,94 L 60,34"
          stroke={isDark ? 'url(#flowGradDarkLuxWeb)' : 'url(#flowGradLightLuxWeb)'}
          strokeWidth="3.4"
          strokeLinecap="round"
          fill="none"
        />

        {/* Left Converging Curve */}
        <path
          d="M 44,89 C 50,74 52,62 60,52 C 55,42 42,39 30,39"
          stroke={isDark ? 'url(#flowGradDarkLuxWeb)' : '#064E3B'}
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />

        {/* Right Converging Curve */}
        <path
          d="M 76,89 C 70,74 68,62 60,52 C 65,42 78,39 90,39"
          stroke={isDark ? 'url(#flowGradDarkLuxWeb)' : '#064E3B'}
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />

        {/* Primary Top Crossbar */}
        <path
          d="M 30,39 C 40,31 51,30 60,30 C 69,30 80,31 90,39"
          stroke={isDark ? 'url(#flowGradDarkLuxWeb)' : 'url(#flowGradLightLuxWeb)'}
          strokeWidth="3.8"
          strokeLinecap="round"
          fill="none"
        />

        {/* Internal Lattice Arcs */}
        <path
          d="M 36,48 C 48,42 60,42 60,42 C 60,42 72,42 84,48"
          stroke={isDark ? '#00FF87' : '#10B981'}
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
        <path
          d="M 42,62 C 51,57 60,57 60,57 C 60,57 69,57 78,62"
          stroke={isDark ? '#10B981' : '#10B981'}
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />

        {/* Precision Nodes with Outer Halos */}
        <circle cx="30" cy="39" r="5.2" stroke={isDark ? 'rgba(0, 255, 135, 0.35)' : 'rgba(6, 95, 70, 0.25)'} strokeWidth="0.8" fill="none" />
        <circle cx="30" cy="39" r="3.6" fill={isDark ? '#00FF87' : '#064E3B'} />
        <circle cx="30" cy="39" r="1.4" fill={isDark ? '#090D16' : '#FFFFFF'} />

        <circle cx="90" cy="39" r="5.2" stroke={isDark ? 'rgba(0, 255, 135, 0.35)' : 'rgba(6, 95, 70, 0.25)'} strokeWidth="0.8" fill="none" />
        <circle cx="90" cy="39" r="3.6" fill={isDark ? '#00FF87' : '#064E3B'} />
        <circle cx="90" cy="39" r="1.4" fill={isDark ? '#090D16' : '#FFFFFF'} />

        <circle cx="60" cy="30" r="5.8" stroke={isDark ? 'rgba(0, 255, 135, 0.45)' : 'rgba(16, 185, 129, 0.35)'} strokeWidth="0.9" fill="none" />
        <circle cx="60" cy="30" r="4.2" fill={isDark ? '#00FF87' : '#064E3B'} />
        <circle cx="60" cy="30" r="1.6" fill={isDark ? '#090D16' : '#FFFFFF'} />

        <circle cx="36" cy="48" r="2.5" fill={isDark ? '#00FF87' : '#10B981'} />
        <circle cx="84" cy="48" r="2.5" fill={isDark ? '#00FF87' : '#10B981'} />

        <circle cx="60" cy="52" r="3.4" fill={isDark ? '#10B981' : '#065F46'} />
        <circle cx="60" cy="52" r="1.2" fill={isDark ? '#00FF87' : '#FFFFFF'} />

        <circle cx="60" cy="72" r="2.8" fill={isDark ? '#10B981' : '#065F46'} />

        <circle cx="44" cy="89" r="3.2" fill={isDark ? '#10B981' : '#10B981'} />
        <circle cx="76" cy="89" r="3.2" fill={isDark ? '#10B981' : '#10B981'} />

        <circle cx="60" cy="94" r="5.6" stroke={isDark ? 'rgba(0, 255, 135, 0.45)' : 'rgba(6, 95, 70, 0.35)'} strokeWidth="0.9" fill="none" />
        <circle cx="60" cy="94" r="4.0" fill={isDark ? '#00FF87' : '#064E3B'} />
        <circle cx="60" cy="94" r="1.6" fill={isDark ? '#090D16' : '#FFFFFF'} />
      </g>
    </svg>
  );
}

export default function LoadingScreen({
  onComplete,
  duration = 2800,
  initialTheme = 'auto',
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  // Theme auto-detection & localStorage persistence
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('turiwa-theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }
    return true; // Default to obsidian dark
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem('turiwa-theme');
      if (!saved) {
        setIsDark(e.matches);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('turiwa-theme', next ? 'dark' : 'light');
    }
  };

  // Dynamic status progression message
  const stageMessage = useMemo(() => {
    if (progress < 24) return 'Initializing secure enclave...';
    if (progress < 52) return 'Synchronizing collective chama ledger...';
    if (progress < 80) return 'Verifying cryptographic multi-sig...';
    if (progress < 99) return 'Establishing institutional tunnel...';
    return 'Welcome to Turiwa';
  }, [progress]);

  // Progress timer and milestone triggers
  useEffect(() => {
    const start = Date.now();
    let milestoneTick = 0;

    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);

      // Web haptics at milestones
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        if (pct >= 25 && milestoneTick < 25) {
          milestoneTick = 25;
          navigator.vibrate?.(12);
        } else if (pct >= 50 && milestoneTick < 50) {
          milestoneTick = 50;
          navigator.vibrate?.(12);
        } else if (pct >= 75 && milestoneTick < 75) {
          milestoneTick = 75;
          navigator.vibrate?.(15);
        }
      }

      if (pct >= 100) {
        clearInterval(timer);
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.([30, 40, 45]);
        }
        setIsExiting(true);
        setTimeout(() => {
          onComplete?.();
        }, 420);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [duration, onComplete]);

  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress / 100);

  // Position of leading particle
  const angle = (progress / 100) * 360 - 90;
  const particleRad = (angle * Math.PI) / 180;
  const particleX = 36 + radius * Math.cos(particleRad);
  const particleY = 36 + radius * Math.sin(particleRad);

  return (
    <div
      className={`
        fixed inset-0 flex flex-col items-center justify-center overflow-hidden
        transition-colors duration-700 select-none
        ${isDark ? 'bg-[#04070A]' : 'bg-[#F8FAF9]'}
        ${isExiting ? 'opacity-0 scale-95 transition-all duration-420 ease-[cubic-bezier(0.4,0,0.2,1)]' : 'opacity-100 scale-100'}
      `}
    >
      <style>{`
        @keyframes turiwaLogoBreathe {
          0%, 100% { transform: scale(1.0) translateY(0); }
          50% { transform: scale(1.04) translateY(-3px); }
        }
        @keyframes turiwaOrbitSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes turiwaAuroraPulse {
          0%, 100% { opacity: 0.20; transform: scale(1.0); }
          50% { opacity: 0.38; transform: scale(1.06); }
        }
        @keyframes turiwaRadarPing {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        @keyframes turiwaBeadBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      {/* Primary Atmospheric Aurora */}
      <div
        className={`
          absolute w-[520px] h-[520px] rounded-full blur-[110px] pointer-events-none
          ${isDark ? 'bg-[#00FF87]' : 'bg-[#10B981]'}
        `}
        style={{
          top: '12%',
          animation: 'turiwaAuroraPulse 3.4s ease-in-out infinite',
        }}
      />

      {/* Secondary Depth Aurora */}
      <div
        className={`
          absolute w-[440px] h-[440px] rounded-full blur-[90px] pointer-events-none
          ${isDark ? 'bg-[#059669]/60' : 'bg-[#D4AF37]/30'}
        `}
        style={{
          bottom: '10%',
          right: '5%',
          animation: 'turiwaAuroraPulse 4s ease-in-out infinite reverse',
        }}
      />

      {/* Precision Rotating Celestial Orbit Rings */}
      <div
        className="absolute w-[480px] h-[480px] pointer-events-none"
        style={{ animation: 'turiwaOrbitSlow 26s linear infinite' }}
      >
        <svg viewBox="0 0 480 480" className="w-full h-full">
          <circle
            cx="240"
            cy="240"
            r="170"
            stroke={isDark ? 'rgba(0, 255, 135, 0.08)' : 'rgba(6, 95, 70, 0.08)'}
            strokeWidth="0.8"
            strokeDasharray="4 14"
            fill="none"
          />
          <circle
            cx="240"
            cy="240"
            r="225"
            stroke={isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.05)'}
            strokeWidth="0.6"
            strokeDasharray="2 18"
            fill="none"
          />
        </svg>
      </div>

      {/* Floating Luxury Glass Enclave Card */}
      <div
        className={`
          relative w-[340px] px-8 pt-6 pb-8 rounded-[36px] backdrop-blur-2xl
          border transition-all duration-300 flex flex-col items-center
          ${
            isDark
              ? 'bg-[#0B1117]/85 border-[#00E599]/25 shadow-[0_24px_64px_rgba(0,229,153,0.12),inset_0_1px_1px_rgba(255,255,255,0.12)]'
              : 'bg-white/95 border-[#033B29]/15 shadow-[0_24px_60px_rgba(3,59,41,0.08),inset_0_1px_2px_rgba(255,255,255,0.95)]'
          }
        `}
      >
        {/* Specular Rim Line */}
        <div
          className={`
            absolute top-0 left-8 right-8 h-[1px]
            ${isDark ? 'bg-white/15' : 'bg-white/90'}
          `}
        />

        {/* Security Enclave Status Badge */}
        <div
          className={`
            flex items-center gap-2 px-3 py-1 rounded-full border mb-6
            ${
              isDark
                ? 'bg-[#00E599]/[0.08] border-[#00E599]/30 text-[#00E599]'
                : 'bg-[#033B29]/[0.06] border-[#033B29]/18 text-[#033B29]'
            }
          `}
        >
          <span
            className={`
              w-1.5 h-1.5 rounded-full inline-block
              ${isDark ? 'bg-[#00E599]' : 'bg-[#059669]'}
            `}
            style={{ animation: 'turiwaRadarPing 1.2s ease-in-out infinite' }}
          />
          <span className="text-[9px] font-bold tracking-[1.6px] uppercase font-mono">
            TURIWA SECURE NETWORK • V2.4
          </span>
        </div>

        {/* Hero Logo Mark */}
        <div className="relative mb-3 flex items-center justify-center">
          <FlowMarkLogo isDark={isDark} />
        </div>

        {/* Brand Typographic Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <h1
            className={`
              text-xl font-black tracking-[6px] uppercase
              ${isDark ? 'text-[#F4F7FA]' : 'text-[#033B29]'}
            `}
          >
            TURIWA
          </h1>
          <p
            className={`
              text-[9px] font-semibold tracking-[2.4px] uppercase mt-1
              ${isDark ? 'text-[#7E8F9F]' : 'text-[#50655B]'}
            `}
          >
            USHIRIKA • UKUAJI • UMOJA
          </p>
        </div>

        {/* Precision Tachymeter Gauge */}
        <div className="relative w-[72px] h-[72px] mb-6 flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 72 72">
            <defs>
              <linearGradient id="webGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isDark ? '#00FF87' : '#059669'} />
                <stop offset="60%" stopColor={isDark ? '#10B981' : '#10B981'} />
                <stop offset="100%" stopColor={isDark ? '#34D399' : '#22C55E'} />
              </linearGradient>
            </defs>

            {/* Outer Precision Tick Ring (24 ticks) */}
            <g transform="translate(36, 36)">
              {Array.from({ length: 24 }).map((_, i) => (
                <line
                  key={i}
                  x1="0"
                  y1="-34"
                  x2="0"
                  y2="-32"
                  stroke={isDark ? 'rgba(0, 255, 135, 0.18)' : 'rgba(6, 95, 70, 0.16)'}
                  strokeWidth="1"
                  transform={`rotate(${(i * 360) / 24})`}
                />
              ))}
            </g>

            {/* Background Track */}
            <circle
              cx="36"
              cy="36"
              r={radius}
              fill="none"
              stroke={isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(226, 232, 240, 0.9)'}
              strokeWidth="3.6"
            />

            {/* Active Progress Arc */}
            <g transform="rotate(-90 36 36)">
              <circle
                cx="36"
                cy="36"
                r={radius}
                fill="none"
                stroke="url(#webGaugeGrad)"
                strokeWidth="3.6"
                strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${strokeDashoffset}`}
                className="transition-all duration-100 ease-out"
              />
            </g>

            {/* Active Leading Node */}
            {progress > 2 && (
              <circle
                cx={particleX}
                cy={particleY}
                r={3}
                fill={isDark ? '#00FF87' : '#059669'}
              />
            )}
          </svg>

          {/* Centered Readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span
              className={`
                text-[13px] font-black font-mono tracking-tight
                ${isDark ? 'text-[#00FF87]' : 'text-[#064E3B]'}
              `}
            >
              {Math.round(progress)}%
            </span>
            <span
              className={`
                text-[7px] font-bold tracking-[1.4px] uppercase -mt-0.5
                ${isDark ? 'text-[#00FF87]/65' : 'text-[#065F46]/70'}
              `}
            >
              SYNC
            </span>
          </div>
        </div>

        {/* Dynamic Contextual Progression Row */}
        <div className="flex items-center gap-2 max-w-[270px]">
          <span
            className={`
              text-[11px] font-semibold tracking-wide truncate
              ${isDark ? 'text-[#F8FAFC]' : 'text-[#0F172A]'}
            `}
          >
            {stageMessage}
          </span>
          <span className="flex gap-1 items-center shrink-0">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`
                  w-1 h-1 rounded-full inline-block
                  ${isDark ? 'bg-[#00FF87]' : 'bg-[#10B981]'}
                `}
                style={{
                  animation: 'turiwaBeadBounce 0.65s ease-out infinite',
                  animationDelay: `${i * 160}ms`,
                }}
              />
            ))}
          </span>
        </div>
      </div>

      {/* Floating Theme Toggle */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle Theme"
        className={`
          absolute bottom-8 right-8 text-sm p-3 rounded-full border backdrop-blur-md
          shadow-lg transition-all hover:scale-105 active:scale-95
          ${
            isDark
              ? 'bg-[#0F172A]/80 border-[#00FF87]/30 text-white shadow-emerald-950/40'
              : 'bg-white/85 border-[#065F46]/20 text-gray-800 shadow-slate-200/80'
          }
        `}
      >
        {isDark ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
