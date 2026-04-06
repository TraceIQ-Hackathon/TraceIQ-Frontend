"use client";

import { useState, useRef, useEffect } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  formatRunTestError,
  isRunTestError,
  runTest,
  type RunTestResponse,
} from "@/lib/traceiq";

const SCENARIOS = [
  {
    apiValue: "healthy" as const,
    label: "Healthy API",
    emoji: "✅",
    badge: "Baseline",
    badgeColor: "#22C55E",
    description:
      "Stable, well-performing API with low latency, consistent responses, and minimal errors—a baseline for good performance.",
    glow: "rgba(34, 197, 94, 0.15)",
    border: "rgba(34, 197, 94, 0.3)",
  },
  {
    apiValue: "slow" as const,
    label: "High Latency",
    emoji: "⏱️",
    badge: "Bottleneck",
    badgeColor: "#F59E0B",
    description:
      "Slow responses under load simulating processing or database bottlenecks. Errors stay low, but wait times climb significantly.",
    glow: "rgba(245, 158, 11, 0.15)",
    border: "rgba(245, 158, 11, 0.3)",
  },
  {
    apiValue: "error" as const,
    label: "Frequent Errors",
    emoji: "🔥",
    badge: "Unstable",
    badgeColor: "#EF4444",
    description:
      "Unreliable behavior under stress: failures, timeouts, and flaky responses—so you can see reliability issues clearly.",
    glow: "rgba(239, 68, 68, 0.15)",
    border: "rgba(239, 68, 68, 0.3)",
  },
] as const;

// ── LIVE FLOWS ────────────────────────────────────────────────────────────────
// Real multi-step flows against a live backend.
// Each flow chains several endpoints to simulate genuine user journeys.
const LIVE_FLOWS = [
  {
    id: "core-trade" as const,
    label: "Core Trade Flow",
    emoji: "🤝",
    badge: "Full Loop",
    badgeColor: "#22C55E",
    description:
      "The complete marketplace loop in one flow — a user discovers an item, decides to trade, makes an offer, and closes the deal.",
    pitch: "Discovery → Decision → Action → Outcome",
    steps: ["Browse Feed", "View Item", "Propose Trade", "Track Offer", "Accept Deal"],
    glow: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.3)",
    ready: true,
  },
  {
    id: "negotiation" as const,
    label: "Trade Negotiation",
    emoji: "💬",
    badge: "Live Interaction",
    badgeColor: "#3B82F6",
    description:
      "Two users go back and forth — proposing, messaging, and updating terms — the way real negotiations actually play out.",
    pitch: "Proposal → Conversation → Counter-offer",
    steps: ["Propose Trade", "Check Status", "Send Message", "Read Thread", "Update Terms"],
    glow: "rgba(59, 130, 246, 0.12)",
    border: "rgba(59, 130, 246, 0.3)",
    ready: true,
  },
  {
    id: "trust-reputation" as const,
    label: "Trust & Reputation",
    emoji: "⭐",
    badge: "Trust Layer",
    badgeColor: "#F59E0B",
    description:
      "After a trade closes, both sides leave reviews and reputation scores update — building verifiable trust across the entire platform.",
    pitch: "Completion → Review → Reputation",
    steps: ["Complete Trade", "Leave Review", "View Profile", "See Reviews", "Check Reputation"],
    glow: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.3)",
    ready: true,
  },
] as const;

const FEATURES = [
  { icon: "⚡", label: "Load Testing", desc: "Up to 250 simulated requests" },
  { icon: "🧠", label: "AI Analysis", desc: "GPT-powered root cause detection" },
  { icon: "📊", label: "Live Metrics", desc: "P50, P95, P99 latency" },
  { icon: "🔍", label: "Bottleneck Detection", desc: "Rule-based classification" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

function DualLineChart({
  latencies,
  scenario,
  p95,
  p99,
}: {
  latencies: number[];
  scenario: "healthy" | "slow" | "error";
  p95: number;
  p99: number;
}) {
  const [hovered, setHovered] = useState<{ idx: number; xPct: number } | null>(null);

  const showError = scenario !== "healthy";
  const POINTS = 32;
  const VW = 560;
  const VH = 180;
  const PAD = { top: 16, right: showError ? 52 : 16, bottom: 36, left: 52 };
  const CW = VW - PAD.left - PAD.right;
  const CH = VH - PAD.top - PAD.bottom;

  if (latencies.length === 0) return null;

  const n = Math.min(POINTS, latencies.length);
  const bucketSize = latencies.length / n;
  const latencyBuckets: number[] = [];
  const errorBuckets: number[] = [];

  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(Math.floor((i + 1) * bucketSize), latencies.length);
    const slice = latencies.slice(start, end);
    if (slice.length === 0) continue;
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    const spikeCount = slice.filter((v) => v > p95).length;
    latencyBuckets.push(avg);
    errorBuckets.push(spikeCount / slice.length);
  }

  const latMin = Math.min(...latencyBuckets);
  const latMax = Math.max(...latencyBuckets);
  const latRange = Math.max(latMax - latMin, 1);

  const toLatY = (v: number) => PAD.top + CH - ((v - latMin) / latRange) * CH;
  const toErrY = (v: number) => PAD.top + CH - v * CH;
  const toX = (i: number) => PAD.left + (i / (latencyBuckets.length - 1)) * CW;

  function smoothPath(ys: number[]) {
    const pts = ys.map((y, i) => ({ x: toX(i), y }));
    if (pts.length < 2) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`;
    }
    return d;
  }

  function fillPath(ys: number[]) {
    const line = smoothPath(ys);
    return `${line} L ${toX(ys.length - 1)} ${PAD.top + CH} L ${toX(0)} ${PAD.top + CH} Z`;
  }

  const latYs = latencyBuckets.map(toLatY);
  const errYs = errorBuckets.map(toErrY);
  const latTicks = [latMin, (latMin + latMax) / 2, latMax];
  const errTicks = [0, 0.5, 1];

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseVbX = ((e.clientX - rect.left) / rect.width) * VW;
    if (mouseVbX < PAD.left || mouseVbX > PAD.left + CW) {
      setHovered(null);
      return;
    }
    const frac = (mouseVbX - PAD.left) / CW;
    const idx = Math.max(0, Math.min(latencyBuckets.length - 1, Math.round(frac * (latencyBuckets.length - 1))));
    setHovered({ idx, xPct: toX(idx) / VW });
  }

  const bucketStartReq = (idx: number) => Math.floor(idx * bucketSize) + 1;
  const bucketEndReq = (idx: number) => Math.min(Math.floor((idx + 1) * bucketSize), latencies.length);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Latency over requests
        </p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="inline-block h-px w-5 rounded-full bg-accent" />
            Latency (ms)
          </span>
          {showError && (
            <span className="flex items-center gap-1.5 text-[10px] text-muted">
              <span className="inline-block h-px w-5 rounded-full bg-red-400" />
              Spike rate
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          className="w-full overflow-visible"
          style={{ cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ED9B40" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ED9B40" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.02" />
            </linearGradient>
            <clipPath id="chartClip">
              <rect x={PAD.left} y={PAD.top} width={CW} height={CH} />
            </clipPath>
          </defs>

          {/* Grid lines */}
          {latTicks.map((_, i) => {
            const y = PAD.top + ((latTicks.length - 1 - i) / (latTicks.length - 1)) * CH;
            return (
              <line key={i} x1={PAD.left} y1={y} x2={PAD.left + CW} y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            );
          })}

          {/* P95 / P99 reference lines */}
          {[
            { value: p95, label: "P95", color: "#F59E0B" },
            { value: p99, label: "P99", color: "#EF4444" },
          ].map(({ value, label, color }) => {
            if (value < latMin || value > latMax) return null;
            const y = toLatY(value);
            return (
              <g key={label}>
                <line
                  x1={PAD.left} y1={y} x2={PAD.left + CW} y2={y}
                  stroke={color} strokeWidth="1" strokeDasharray="5 4" strokeOpacity="0.55"
                />
                <rect
                  x={PAD.left + CW - 28} y={y - 9}
                  width={28} height={13}
                  fill="#0b0f14" rx="2"
                />
                <text
                  x={PAD.left + CW - 2} y={y + 1}
                  textAnchor="end" fontSize="8" fill={color}
                  fontFamily="ui-monospace, monospace" fontWeight="700"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Area fills */}
          <path d={fillPath(latYs)} fill="url(#latGrad)" clipPath="url(#chartClip)" />
          {showError && (
            <path d={fillPath(errYs)} fill="url(#errGrad)" clipPath="url(#chartClip)" />
          )}

          {/* Error line */}
          {showError && (
            <motion.path
              d={smoothPath(errYs)}
              fill="none" stroke="#EF4444" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              clipPath="url(#chartClip)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.4, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            />
          )}

          {/* Latency line */}
          <motion.path
            d={smoothPath(latYs)}
            fill="none" stroke="#ED9B40" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            clipPath="url(#chartClip)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          />

          {/* Crosshair + dots */}
          {hovered && (
            <>
              <line
                x1={toX(hovered.idx)} y1={PAD.top}
                x2={toX(hovered.idx)} y2={PAD.top + CH}
                stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="4 3"
              />
              <circle cx={toX(hovered.idx)} cy={latYs[hovered.idx]}
                r={4} fill="#ED9B40" stroke="#0B0F14" strokeWidth="2" />
              {showError && (
                <circle cx={toX(hovered.idx)} cy={errYs[hovered.idx]}
                  r={4} fill="#EF4444" stroke="#0B0F14" strokeWidth="2" />
              )}
            </>
          )}

          {/* Left Y-axis: latency */}
          {latTicks.map((v, i) => {
            const y = PAD.top + ((latTicks.length - 1 - i) / (latTicks.length - 1)) * CH;
            return (
              <text key={i} x={PAD.left - 8} y={y + 4} textAnchor="end"
                fontSize="9" fill="#6B7280" fontFamily="ui-monospace, monospace">
                {v.toFixed(0)}
              </text>
            );
          })}

          {/* Right Y-axis: spike rate */}
          {showError && errTicks.map((v, i) => {
            const y = PAD.top + ((errTicks.length - 1 - i) / (errTicks.length - 1)) * CH;
            return (
              <text key={i} x={PAD.left + CW + 8} y={y + 4} textAnchor="start"
                fontSize="9" fill="#6B7280" fontFamily="ui-monospace, monospace">
                {(v * 100).toFixed(0)}%
              </text>
            );
          })}

          {/* X-axis labels */}
          <text x={PAD.left} y={VH - 6} textAnchor="start"
            fontSize="9" fill="#6B7280" fontFamily="ui-monospace, monospace">
            Req 1
          </text>
          <text x={PAD.left + CW} y={VH - 6} textAnchor="end"
            fontSize="9" fill="#6B7280" fontFamily="ui-monospace, monospace">
            Req {latencies.length}
          </text>

          {/* Axes */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH}
            stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <line x1={PAD.left} y1={PAD.top + CH} x2={PAD.left + CW} y2={PAD.top + CH}
            stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          {showError && (
            <line x1={PAD.left + CW} y1={PAD.top} x2={PAD.left + CW} y2={PAD.top + CH}
              stroke="rgba(239,68,68,0.2)" strokeWidth="1" />
          )}
        </svg>

        {/* Tooltip */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.1 }}
              className="pointer-events-none absolute top-4 z-20 min-w-[130px] rounded-lg border border-white/15 bg-[#0b0f14]/95 px-3 py-2.5 shadow-xl backdrop-blur-sm"
              style={{
                left: `${hovered.xPct * 100}%`,
                transform: hovered.xPct > 0.6 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
              }}
            >
              <p className="mb-2 font-mono text-[10px] text-muted">
                Req {bucketStartReq(hovered.idx)}–{bucketEndReq(hovered.idx)}
              </p>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                    Latency
                  </span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {latencyBuckets[hovered.idx].toFixed(1)}<span className="text-muted"> ms</span>
                  </span>
                </div>
                {showError && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-[10px] text-muted">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400/60" />
                      Spikes
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {(errorBuckets[hovered.idx] * 100).toFixed(0)}<span className="text-muted">%</span>
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [selected, setSelected] = useState<number | null>(null);
  const [requestCount, setRequestCount] = useState(80);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const featuresRef = useRef(null);
  const resultsSectionRef = useRef<HTMLElement>(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!result && !error) return;
    resultsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result, error]);

  const handleRun = async () => {
    if (selected === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await runTest({
        scenario: SCENARIOS[selected].apiValue,
        request_count: requestCount,
      });
      if (process.env.NODE_ENV === "development") {
        console.debug("[TraceIQ] run completed", {
          issue: data.issue,
          requestCount: data.meta.request_count,
        });
      }
      setResult(data);
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.error("[TraceIQ] run failed", e);
      }
      if (isRunTestError(e)) {
        setError(formatRunTestError(e));
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleModeSwitch = (next: "demo" | "live") => {
    if (next === mode || loading) return;
    setMode(next);
    setSelected(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Animated background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(237,155,64,0.4) 0%, transparent 70%)",
          }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-40 top-1/3 h-[500px] w-[500px] rounded-full opacity-15"
          style={{
            background:
              "radial-gradient(circle, rgba(20,52,43,0.8) 0%, transparent 70%)",
          }}
          animate={{ x: [0, -25, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        <motion.div
          className="absolute bottom-0 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full opacity-10"
          style={{
            background:
              "radial-gradient(circle, rgba(237,155,64,0.3) 0%, transparent 70%)",
          }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(237,155,64,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(237,155,64,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-[900px] flex-col gap-16 px-4 py-14 sm:px-6">
        {/* ── HERO ── */}
        <motion.header
          className="flex flex-col gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold tracking-widest text-accent uppercase">
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              Hackathon Build · 2025
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="relative">
            <h1 className="text-5xl font-black tracking-tight sm:text-6xl">
              <span className="text-foreground">Trace</span>
              <span
                className="relative"
                style={{
                  background: "linear-gradient(135deg, #ED9B40 0%, #F2A957 50%, #FBBF24 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                IQ
              </span>
            </h1>
            <motion.div
              className="mt-1 h-1 w-24 rounded-full bg-accent"
              initial={{ scaleX: 0, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 0.5, ease: "easeOut" }}
            />
          </motion.div>

          <motion.p
            variants={itemVariants}
            className="max-w-xl text-base leading-relaxed text-muted"
          >
            Stress-test your APIs under real load and make sense of the results.
            TraceIQ combines{" "}
            <span className="font-semibold text-foreground">load testing</span> with{" "}
            <span className="font-semibold text-accent">AI-powered analysis</span>—
            measuring latency, surfacing bottlenecks, and explaining impact in plain
            language.
          </motion.p>

          {/* Feature pills */}
          <motion.div
            ref={featuresRef}
            variants={containerVariants}
            initial="hidden"
            animate={featuresInView ? "visible" : "hidden"}
            className="flex flex-wrap gap-2"
          >
            {FEATURES.map((f) => (
              <motion.div
                key={f.label}
                variants={itemVariants}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted backdrop-blur-sm"
                whileHover={{ borderColor: "rgba(237,155,64,0.4)", color: "#e5e7eb", scale: 1.02 }}
                transition={{ duration: 0.15 }}
              >
                <span>{f.icon}</span>
                <span className="font-medium text-foreground">{f.label}</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">{f.desc}</span>
              </motion.div>
            ))}
          </motion.div>
        </motion.header>

        {/* ── MODE SWITCHER + SCENARIOS / LIVE FLOWS ── */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex flex-col gap-5"
          aria-labelledby="scenarios-label"
        >
          {/* Mode toggle */}
          <motion.div variants={itemVariants} className="flex justify-center">
            <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 gap-1 backdrop-blur-sm">
              <motion.button
                type="button"
                onClick={() => handleModeSwitch("demo")}
                disabled={loading}
                className="relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                style={{
                  color: mode === "demo" ? "#0a1f1a" : "#9CA3AF",
                }}
                whileHover={mode !== "demo" ? { color: "#e5e7eb" } : {}}
                transition={{ duration: 0.15 }}
              >
                {mode === "demo" && (
                  <motion.div
                    layoutId="mode-pill"
                    className="absolute inset-0 rounded-lg bg-accent"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative">🧪</span>
                <span className="relative">Demo Scenarios</span>
              </motion.button>
              <motion.button
                type="button"
                onClick={() => handleModeSwitch("live")}
                disabled={loading}
                className="relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                style={{
                  color: mode === "live" ? "#0a1f1a" : "#9CA3AF",
                }}
                whileHover={mode !== "live" ? { color: "#e5e7eb" } : {}}
                transition={{ duration: 0.15 }}
              >
                {mode === "live" && (
                  <motion.div
                    layoutId="mode-pill"
                    className="absolute inset-0 rounded-lg bg-accent"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative">🌐</span>
                <span className="relative">Live Flows</span>
                <span
                  className="relative rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{
                    color: mode === "live" ? "#0a1f1a" : "#6366F1",
                    background: mode === "live" ? "rgba(0,0,0,0.15)" : "rgba(99,102,241,0.15)",
                  }}
                >
                  Real
                </span>
              </motion.button>
            </div>
          </motion.div>

          {/* Mode description strip */}
          <AnimatePresence mode="wait">
            {mode === "live" && (
              <motion.div
                key="live-banner"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.07] px-4 py-2.5 text-xs text-indigo-300"
              >
                <span className="shrink-0">🌐</span>
                <span>
                  <span className="font-semibold text-indigo-200">Live Flows</span> run against a real backend with real endpoints — chaining multiple calls together to simulate how users actually move through the app.
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div variants={itemVariants} className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <h2
              id="scenarios-label"
              className="text-xs font-semibold uppercase tracking-widest text-muted"
            >
              {mode === "demo" ? "Step 1 — Pick a Scenario" : "Step 1 — Pick a Flow"}
            </h2>
            <div className="h-px flex-1 bg-white/10" />
          </motion.div>

          <AnimatePresence mode="wait">
            {mode === "demo" ? (
              <motion.div
                key="demo-grid"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-3"
              >
                {SCENARIOS.map((scenario, index) => (
                  <motion.button
                    key={scenario.label}
                    type="button"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
                    onClick={() => setSelected(index)}
                    disabled={loading}
                    className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor:
                        selected === index ? scenario.border : "rgba(255,255,255,0.08)",
                      background:
                        selected === index
                          ? `radial-gradient(ellipse at top left, ${scenario.glow}, transparent 70%), #14342b`
                          : "rgba(20,52,43,0.4)",
                    }}
                    whileHover={{
                      scale: 1.02,
                      borderColor: scenario.border,
                      background: `radial-gradient(ellipse at top left, ${scenario.glow}, transparent 70%), #14342b`,
                    }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AnimatePresence>
                      {selected === index && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0 }}
                          className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-background"
                        >
                          ✓
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl">{scenario.emoji}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          color: scenario.badgeColor,
                          background: `${scenario.badgeColor}20`,
                        }}
                      >
                        {scenario.badge}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold text-foreground">
                        {scenario.label}
                      </span>
                      <span className="text-xs leading-relaxed text-muted">
                        {scenario.description}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="live-grid"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-3"
              >
                {LIVE_FLOWS.map((flow, index) => (
                  <motion.button
                    key={flow.id}
                    type="button"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
                    onClick={() => setSelected(index)}
                    disabled={loading}
                    className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: selected === index ? flow.border : "rgba(255,255,255,0.08)",
                      background:
                        selected === index
                          ? `radial-gradient(ellipse at top left, ${flow.glow}, transparent 70%), #14342b`
                          : "rgba(20,52,43,0.4)",
                    }}
                    whileHover={{
                      scale: 1.02,
                      borderColor: flow.border,
                      background: `radial-gradient(ellipse at top left, ${flow.glow}, transparent 70%), #14342b`,
                    }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Selected indicator */}
                    <AnimatePresence>
                      {selected === index && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0 }}
                          className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-background"
                        >
                          ✓
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl">{flow.emoji}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          color: flow.badgeColor,
                          background: `${flow.badgeColor}20`,
                        }}
                      >
                        {flow.badge}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        {flow.label}
                      </span>
                      <span className="text-xs leading-relaxed text-muted">
                        {flow.description}
                      </span>
                    </div>

                    {/* Journey pitch line */}
                    <div
                      className="mt-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold tracking-wide"
                      style={{
                        color: flow.badgeColor,
                        background: `${flow.badgeColor}12`,
                      }}
                    >
                      {flow.pitch}
                    </div>

                    {/* Step indicators */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {flow.steps.map((step, i) => (
                        <span
                          key={i}
                          className="rounded px-1.5 py-0.5 text-[9px] font-medium text-muted/70"
                          style={{ background: "rgba(255,255,255,0.05)" }}
                        >
                          {step}
                        </span>
                      ))}
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.p variants={itemVariants} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted/60">
            <span className="mt-px shrink-0 text-[10px]">ⓘ</span>
            {mode === "demo"
              ? "These scenarios are not hardcoded — each run is mathematically generated using parameters tuned to that profile, with a degree of randomness built in so the numbers vary naturally, just like real traffic would."
              : "Live Flows chain real API endpoints in sequence — replicating how users actually move through the app and producing latency and error data across entire journeys, not just isolated calls."}
          </motion.p>
        </motion.section>

        {/* ── LOAD CONFIG + RUN ── */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex flex-col gap-5"
          aria-labelledby="load-label"
        >
          <motion.div variants={itemVariants} className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <h2
              id="load-label"
              className="text-xs font-semibold uppercase tracking-widest text-muted"
            >
              Step 2 — Configure Load
            </h2>
            <div className="h-px flex-1 bg-white/10" />
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="request-count" className="text-sm font-semibold text-foreground">
                Simulated requests
              </label>
              <p className="text-xs text-muted">
                How many requests the demo run simulates (80–250). Larger runs take longer to
                finish.
              </p>
            </div>

            {/* Slider + input row */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  id="request-count"
                  min={80}
                  max={250}
                  step={1}
                  value={requestCount}
                  onChange={(e) => setRequestCount(Number(e.target.value))}
                  disabled={loading}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-accent disabled:cursor-not-allowed"
                  style={
                    {
                      "--range-progress": `${((requestCount - 80) / (250 - 80)) * 100}%`,
                    } as React.CSSProperties
                  }
                />
                <div className="flex h-10 w-20 items-center justify-center rounded-lg border border-white/10 bg-surface font-mono text-sm font-semibold tabular-nums text-accent">
                  {requestCount}
                </div>
              </div>

              {/* Preset chips */}
              <div className="flex flex-wrap gap-2">
                {[80, 100, 120, 200, 250].map((v) => (
                  <motion.button
                    key={v}
                    type="button"
                    onClick={() => setRequestCount(v)}
                    disabled={loading}
                    className="rounded-lg border px-3 py-1 text-xs font-semibold tabular-nums transition disabled:cursor-not-allowed"
                    style={{
                      borderColor: requestCount === v ? "rgba(237,155,64,0.5)" : "rgba(255,255,255,0.08)",
                      color: requestCount === v ? "#ED9B40" : "#9CA3AF",
                      background: requestCount === v ? "rgba(237,155,64,0.1)" : "transparent",
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                  >
                    {v}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Run button */}
          <motion.div variants={itemVariants}>
            <motion.button
              type="button"
              onClick={handleRun}
              disabled={loading || selected === null}
              className="relative inline-flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-accent/40 bg-accent text-base font-bold tracking-wide text-background shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[220px]"
              whileHover={
                !loading && selected !== null
                  ? { scale: 1.02, boxShadow: "0 0 40px rgba(237,155,64,0.4)" }
                  : {}
              }
              whileTap={!loading && selected !== null ? { scale: 0.98 } : {}}
              transition={{ duration: 0.15 }}
            >
              {/* Shimmer effect */}
              {!loading && selected !== null && (
                <motion.div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.2) 50%, transparent 60%)",
                    backgroundSize: "200% 100%",
                  }}
                  animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                />
              )}
              {loading ? (
                <>
                  <motion.div
                    className="h-4 w-4 rounded-full border-2 border-background/30 border-t-background"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                  Running Test…
                </>
              ) : mode === "live" ? (
                <>
                  <span>🌐</span>
                  Run Flow
                  {selected !== null && (
                    <span className="rounded-md bg-background/20 px-1.5 py-0.5 text-xs font-semibold">
                      {LIVE_FLOWS[selected].label}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>⚡</span>
                  Run Test
                  {selected !== null && (
                    <span className="rounded-md bg-background/20 px-1.5 py-0.5 text-xs font-semibold">
                      {SCENARIOS[selected].label}
                    </span>
                  )}
                </>
              )}
            </motion.button>

            {selected === null && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-xs text-muted"
              >
                {mode === "demo" ? "Select a scenario above to run a test" : "Select a flow above to run it"}
              </motion.p>
            )}
          </motion.div>
        </motion.section>

        {/* ── RESULTS ── */}
        <motion.section
          ref={resultsSectionRef}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex flex-col gap-5"
        >
          <motion.div variants={itemVariants} className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
              Results
            </h2>
            <div className="h-px flex-1 bg-white/10" />
          </motion.div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 whitespace-pre-wrap"
            >
              {error}
            </div>
          )}

          {result && !error && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className="inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide text-foreground"
                  style={{
                    borderColor: "rgba(237,155,64,0.45)",
                    background: "rgba(237,155,64,0.12)",
                  }}
                >
                  {result.issue}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted">
                  {result.meta.timestamp}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Avg", value: result.metrics.avg_latency, suffix: " ms" },
                  { label: "P95", value: result.metrics.p95_latency, suffix: " ms" },
                  { label: "P99", value: result.metrics.p99_latency, suffix: " ms" },
                  { label: "Min / Max", value: null as number | null, pair: [result.metrics.min_latency, result.metrics.max_latency] },
                ].map((cell) =>
                  cell.pair ? (
                    <div
                      key={cell.label}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        {cell.label}
                      </p>
                      <p className="font-mono text-sm tabular-nums text-foreground">
                        {cell.pair[0].toFixed(1)} / {cell.pair[1].toFixed(1)} ms
                      </p>
                    </div>
                  ) : (
                    <div
                      key={cell.label}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        {cell.label}
                      </p>
                      <p className="font-mono text-sm tabular-nums text-accent">
                        {cell.value!.toFixed(1)}
                        {cell.suffix}
                      </p>
                    </div>
                  )
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Success rate
                  </p>
                  <p className="font-mono text-sm tabular-nums text-foreground">
                    {(result.metrics.success_rate * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Error rate
                  </p>
                  <p className="font-mono text-sm tabular-nums text-foreground">
                    {(result.metrics.error_rate * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <DualLineChart
                latencies={result.latencies}
                scenario={result.scenario}
                p95={result.metrics.p95_latency}
                p99={result.metrics.p99_latency}
              />

              <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Analysis
                </p>
                <p className="text-sm leading-relaxed text-foreground/95">
                  {result.explanation}
                </p>
              </div>

              {result.fixes.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Suggested fixes
                  </p>
                  <ul className="flex list-none flex-col gap-2">
                    {result.fixes.map((fix, i) => (
                      <li
                        key={i}
                        className="flex gap-2 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm text-foreground/95"
                      >
                        <span className="font-mono text-xs text-accent">{i + 1}.</span>
                        <span>{fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] text-muted/80">
                Run: {result.meta.request_count} simulated requests · server duration{" "}
                {result.meta.duration_ms.toFixed(0)} ms
              </p>
            </motion.div>
          )}

          {!result && !error && (
            <motion.div
              variants={itemVariants}
              className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center"
            >
              <motion.div
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                📡
              </motion.div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">
                  Awaiting your first test run
                </p>
                <p className="max-w-xs text-xs leading-relaxed text-muted">
                  Metrics, latency distribution, detected issue, analysis, and suggested fixes
                  will appear here.
                </p>
              </div>
            </motion.div>
          )}
        </motion.section>

        {/* ── FOOTER ── */}
        <motion.footer
          variants={itemVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex items-center justify-between border-t border-white/10 pt-6 text-xs text-muted"
        >
          <span>
            Built for{" "}
            <span className="font-semibold text-accent">Hackathon 2025</span>
          </span>
          <span className="flex items-center gap-1.5">
            <motion.span
              className="inline-block h-1.5 w-1.5 rounded-full bg-green-500"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            All systems online
          </span>
        </motion.footer>
      </div>
    </div>
  );
}
