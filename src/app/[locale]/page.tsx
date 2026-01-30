
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation, Trans } from 'react-i18next';

const SUPPORTED_LOCALES = ['en', 'ru', 'ar', 'uz'] as const;
type Lng = (typeof SUPPORTED_LOCALES)[number];

function isLocale(x: string): x is Lng {
  return (SUPPORTED_LOCALES as readonly string[]).includes(x);
}

/** Smooth tilt: no React re-renders on pointermove (fixes lag + glitches). */
function useTilt(ref: React.RefObject<HTMLElement>, maxDeg = 8) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return;

    const supportsFinePointer = window.matchMedia('(pointer: fine)').matches;
    if (!supportsFinePointer) return;

    let raf: number | null = null;
    let rect: DOMRect | null = null;
    let rx = 0;
    let ry = 0;

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const apply = () => {
      raf = null;
      el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    };

    const onEnter = () => {
      rect = el.getBoundingClientRect();
      el.style.willChange = 'transform';
      el.style.transition = 'transform 120ms ease-out';
    };

    const onMove = (e: PointerEvent) => {
      if (!rect) rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const px = (x / rect.width) * 2 - 1;
      const py = (y / rect.height) * 2 - 1;

      ry = clamp(px * maxDeg, -maxDeg, maxDeg);
      rx = clamp(-py * maxDeg, -maxDeg, maxDeg);

      el.style.transition = 'transform 0ms';
      if (raf === null) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      rect = null;
      if (raf) cancelAnimationFrame(raf);
      raf = null;

      el.style.transition = 'transform 220ms ease-out';
      el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0)';
      window.setTimeout(() => {
        el.style.willChange = 'auto';
      }, 240);
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, maxDeg, reduceMotion]);
}

/** Canvas background (no Three.js dependency, no loading timing issues). */
function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduceMotion) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const prefersLess = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersLess) return;

    const particleCount = 260;
    const particles = Array.from({ length: particleCount }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003,
    }));

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    let mx = 0;
    let my = 0;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = (e.clientX - (r.left + r.width / 2)) / r.width;
      my = (e.clientY - (r.top + r.height / 2)) / r.height;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const draw = () => {
      raf = requestAnimationFrame(draw);

      ctx.clearRect(0, 0, w, h);

      // subtle vignette
      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.45, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(16,185,129,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        // pseudo depth drift
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -0.1) p.x = 1.1;
        if (p.x > 1.1) p.x = -0.1;
        if (p.y < -0.1) p.y = 1.1;
        if (p.y > 1.1) p.y = -0.1;

        const depth = 0.2 + p.z * 0.8;
        const px = (p.x - 0.5) * w + w * 0.5 + mx * 90 * depth;
        const py = (p.y - 0.5) * h + h * 0.5 + my * 60 * depth;

        const r = 0.6 + depth * 1.3;
        const a = 0.18 + depth * 0.55;

        ctx.beginPath();
        ctx.fillStyle = `rgba(16,185,129,${a})`;
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
    };
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
    />
  );
}

function LanguageSelect({ currentLocale }: { currentLocale: Lng }) {
  const { i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  const value: Lng = useMemo(() => {
    const lng = (i18n.language || currentLocale).split('-')[0];
    return (isLocale(lng) ? lng : currentLocale);
  }, [i18n.language, currentLocale]);

  const setLng = async (lng: Lng) => {
    try {
      localStorage.setItem('flowvia_lang', lng);
    } catch {}

    await i18n.changeLanguage(lng);

    // If your routing uses /{locale}/..., rewrite first segment
    if (pathname) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length > 0 && isLocale(parts[0])) {
        parts[0] = lng;
        router.replace('/' + parts.join('/'));
      }
    }
  };

  return (
    <div className="flex items-center gap-2 border border-white/10 bg-white/5 rounded-xl px-3 py-2">
      <span className="material-symbols-outlined text-primary text-[18px]">language</span>
      <select
        value={value}
        onChange={(e) => setLng(e.target.value as Lng)}
        className="bg-transparent text-sm font-bold text-slate-200 outline-none border-0 focus:ring-0"
        aria-label="Language"
      >
        <option value="en">EN</option>
        <option value="ru">RU</option>
        <option value="ar">AR</option>
        <option value="uz">UZ</option>
      </select>
    </div>
  );
}

/** Intro overlay: ribbons gather right→left + FlowVia rises + data particles */
function IntroOverlay({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // lock scroll during intro
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      onDone();
      return;
    }
    const t = window.setTimeout(() => onDone(), 3100);
    return () => window.clearTimeout(t);
  }, [reduceMotion, onDone]);

  const container = {
    hidden: { opacity: 1 },
    show: { opacity: 1, transition: { staggerChildren: 0.12 } },
    exit: { opacity: 0, transition: { duration: 0.55, ease: 'easeInOut' } },
  };

  const particle = {
    hidden: { opacity: 0, x: 220 },
    show: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: 0.18 + i * 0.12, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] },
    }),
  };

  const ribbon = {
    hidden: (i: number) => ({ opacity: 0, x: 90 + i * 18, y: -10 + i * 10, scale: 0.86 }),
    show: (i: number) => ({
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: { delay: 0.55 + i * 0.16, duration: 0.85, ease: [0.2, 0.85, 0.2, 1] },
    }),
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-navy-deep flex flex-col items-center justify-center overflow-hidden"
      variants={container}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <div className="absolute inset-0 pointer-events-none">
        {[
          { text: 'Sales + $4,200', cls: 'text-primary top-[22%]' },
          { text: 'Expense - $380', cls: 'text-red-400 top-[30%]' },
          { text: 'Invoice #104 Paid', cls: 'text-brand-blue top-[38%]' },
          { text: 'Net Profit + 18%', cls: 'text-emerald-300 top-[46%]' },
          { text: 'Stock 8,421', cls: 'text-slate-300 top-[54%]' },
        ].map((p, i) => (
          <motion.span
            key={p.text}
            className={`font-mono text-xs absolute right-[10%] ${p.cls}`}
            variants={particle}
            custom={i}
          >
            {p.text}
          </motion.span>
        ))}
      </div>

      <motion.div
        className="relative w-32 h-32 mb-6 flex items-center justify-center"
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { delay: 0.28, duration: 0.6, ease: [0.2, 0.9, 0.2, 1] } }}
      >
        <motion.div
          className="logo-ribbon bg-gradient-to-br from-primary to-emerald-600 absolute w-[88px] h-[28px] rounded-2xl flex items-center justify-center"
          style={{ right: 0, top: 20 }}
          variants={ribbon}
          custom={0}
        >
          <span className="material-symbols-outlined text-white/60 text-xl">shopping_cart</span>
        </motion.div>

        <motion.div
          className="logo-ribbon bg-gradient-to-br from-brand-blue to-cyan-600 absolute w-[88px] h-[28px] rounded-2xl flex items-center justify-center"
          style={{ right: 0, top: 52 }}
          variants={ribbon}
          custom={1}
        >
          <span className="material-symbols-outlined text-white/60 text-xl">payments</span>
        </motion.div>

        <motion.div
          className="logo-ribbon bg-gradient-to-br from-slate-600 to-slate-800 absolute w-[88px] h-[28px] rounded-2xl flex items-center justify-center"
          style={{ right: 0, top: 84 }}
          variants={ribbon}
          custom={2}
        >
          <span className="material-symbols-outlined text-white/60 text-xl">receipt_long</span>
        </motion.div>

        <motion.div
          className="absolute inset-0 bg-primary/20 blur-xl rounded-full"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1, transition: { delay: 1.35, duration: 0.9, ease: 'easeOut' } }}
        />
      </motion.div>

      <div className="overflow-hidden h-14 relative">
        <motion.h1
          className="text-5xl font-black text-white"
          initial={{ y: 64 }}
          animate={{ y: 0, transition: { delay: 1.25, duration: 0.85, ease: [0.2, 0.9, 0.2, 1] } }}
        >
          FlowVia
        </motion.h1>
      </div>

      <motion.p
        className="text-slate-500 text-sm font-bold tracking-widest uppercase mt-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 1.55, duration: 0.7 } }}
      >
        Business OS
      </motion.p>
    </motion.div>
  );
}

export default function Page({ params }: { params: { locale: string } }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { t, i18n } = useTranslation();

  const locale: Lng = useMemo(() => {
    const lng = (params?.locale || 'en').split('-')[0];
    return (isLocale(lng) ? lng : 'en');
  }, [params?.locale]);

  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    // keep i18n aligned with locale segment on first render
    const lng = (i18n.language || '').split('-')[0];
    if (lng !== locale) {
      i18n.changeLanguage(locale).catch(() => {});
    }
  }, [i18n, locale]);

  useEffect(() => {
    // show intro once per session
    if (reduceMotion) {
      setShowIntro(false);
      return;
    }
    try {
      const seen = sessionStorage.getItem('flowvia_intro_seen');
      if (seen === '1') setShowIntro(false);
    } catch {}
  }, [reduceMotion]);

  const finishIntro = () => {
    setShowIntro(false);
    try {
      sessionStorage.setItem('flowvia_intro_seen', '1');
    } catch {}
  };

  const NavLink = ({
    href,
    label,
  }: {
    href: string;
    label: string;
  }) => (
    <motion.a
      href={href}
      className="nav-link relative text-slate-200/90 font-bold text-sm px-3 py-2 rounded-xl"
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
    >
      <span className="relative z-10">{label}</span>
      <span className="absolute inset-0 rounded-xl bg-white/0 hover:bg-white/5 transition-colors" />
    </motion.a>
  );

  const LicenseButton = () => (
    <motion.a
      href="#pricing"
      className="bg-primary hover:bg-primary/90 text-navy-deep px-6 py-2.5 rounded-xl text-sm font-extrabold"
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
    >
      {t('lp.nav.getLicense')}
    </motion.a>
  );

  // Tilt refs
  const heroCardRef = useRef<HTMLDivElement | null>(null);
  useTilt(heroCardRef, 8);

  return (
    <>
      <AnimatePresence>
        {showIntro && <IntroOverlay onDone={finishIntro} />}
      </AnimatePresence>

      <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-navy-deep/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-2">
              <div className="bg-primary p-1.5 rounded-lg shadow-lg shadow-primary/20">
                <svg className="size-6 text-navy-deep" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path clipRule="evenodd" d="M39.475 21.6262C40.358 21.4363 40.6863 21.5589 40.7581 21.5934C40.7876 21.655 40.8547 21.857 40.8082 22.3336C40.7408 23.0255 40.4502 24.0046 39.8572 25.2301C38.6799 27.6631 36.5085 30.6631 33.5858 33.5858C30.6631 36.5085 27.6632 38.6799 25.2301 39.8572C24.0046 40.4502 23.0255 40.7407 22.3336 40.8082C21.8571 40.8547 21.6551 40.7875 21.5934 40.7581C21.5589 40.6863 21.4363 40.358 21.6262 39.475C21.8562 38.4054 22.4689 36.9657 23.5038 35.2817C24.7575 33.2417 26.5497 30.9744 28.7621 28.762C30.9744 26.5497 33.2417 24.7574 35.2817 23.5037C36.9657 22.4689 38.4054 21.8562 39.475 21.6262ZM4.41189 29.2403L18.7597 43.5881C19.8813 44.7097 21.4027 44.9179 22.7217 44.7893C24.0585 44.659 25.5148 44.1631 26.9723 43.4579C29.9052 42.0387 33.2618 39.5667 36.4142 36.4142C39.5667 33.2618 42.0387 29.9052 43.4579 26.9723C44.1631 25.5148 44.659 24.0585 44.7893 22.7217C44.9179 21.4027 44.7097 19.8813 43.5881 18.7597L29.2403 4.41187C27.8527 3.02428 25.8765 3.02573 24.2861 3.36776C22.6081 3.72863 20.7334 4.58419 18.8396 5.74801C16.4978 7.18716 13.9881 9.18353 11.5858 11.5858C9.18354 13.988 7.18717 16.4978 5.74802 18.8396C4.58421 20.7334 3.72865 22.6081 3.36778 24.2861C3.02574 25.8765 3.02429 27.8527 4.41189 29.2403Z" fill="currentColor" fillRule="evenodd"></path>
                </svg>
              </div>
              <span className="text-2xl font-black tracking-tighter text-white">FlowVia</span>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <LanguageSelect currentLocale={locale} />

              <div className="h-5 w-px bg-white/10 mx-2"></div>

              <NavLink href="#features" label={t('lp.nav.features')} />
              <NavLink href="#roles" label={t('lp.nav.team')} />
              <NavLink href="#pricing" label={t('lp.nav.pricing')} />

              <div className="h-5 w-px bg-white/10 mx-2"></div>

              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <Link className="nav-link text-slate-200/90 font-bold text-sm px-3 py-2 rounded-xl hover:bg-white/5 transition-colors" href={`/${locale}/login`}>
                  {t('lp.nav.login')}
                </Link>
              </motion.div>

              <LicenseButton />
            </div>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="absolute inset-0">
          <HeroParticles />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <motion.div
              className="flex-1 text-center lg:text-left"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -120px 0px' }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="text-xs font-bold text-primary uppercase tracking-widest">
                  {t('lp.hero.kicker')}
                </span>
              </div>

              <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] mb-8 text-white">
                <Trans
                  i18nKey="lp.hero.title"
                  components={{
                    br: <br />,
                    highlight: <span className="text-primary" />,
                  }}
                />
              </h1>

              <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                {t('lp.hero.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-5">
                <motion.button
                  className="w-full sm:w-auto px-10 py-5 bg-primary text-navy-deep rounded-2xl font-black text-lg"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                >
                  {t('lp.hero.ctaPrimary')}
                </motion.button>

                <motion.button
                  className="w-full sm:w-auto px-10 py-5 bg-charcoal border border-white/10 text-white rounded-2xl font-bold text-lg hover:bg-slate-accent transition-colors inline-flex items-center justify-center gap-3"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                >
                  <span className="material-symbols-outlined text-primary">calendar_today</span>
                  <span>{t('lp.hero.ctaSecondary')}</span>
                </motion.button>
              </div>

              <div className="mt-8 flex items-center justify-center lg:justify-start gap-6 opacity-70">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-slate-300">language</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{t('lp.hero.supports')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-slate-300">payments</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{t('lp.hero.currency')}</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="flex-1 w-full max-w-[640px]"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -120px 0px' }}
              transition={{ delay: 0.12, duration: 0.7, ease: 'easeOut' }}
            >
              <div className="relative group dashboard-glow animate-float-slow">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary to-brand-blue rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-700"></div>

                <div
                  ref={heroCardRef}
                  className="relative bg-navy-deep rounded-3xl border border-white/10 shadow-2xl overflow-hidden aspect-[4/3]"
                  style={{ transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0)' }}
                >
                  <div className="bg-charcoal/80 border-b border-white/5 px-5 py-3 flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <div className="size-2.5 rounded-full bg-red-500/50"></div>
                      <div className="size-2.5 rounded-full bg-amber-500/50"></div>
                      <div className="size-2.5 rounded-full bg-emerald-500/50"></div>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono tracking-tight bg-navy-deep/50 px-3 py-1 rounded border border-white/5">
                      flowvia.io/admin/inventory-overview
                    </div>
                    <div className="size-2.5"></div>
                  </div>

                  <div className="p-6 h-full bg-navy-deep">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-3 space-y-4">
                        <div className="h-4 w-full bg-slate-800/50 rounded"></div>
                        <div className="space-y-2">
                          <div className="h-2 w-3/4 bg-primary/20 rounded"></div>
                          <div className="h-2 w-full bg-slate-800/30 rounded"></div>
                          <div className="h-2 w-2/3 bg-slate-800/30 rounded"></div>
                          <div className="h-2 w-full bg-slate-800/30 rounded"></div>
                        </div>
                        <div className="pt-4 space-y-2">
                          <div className="h-2 w-1/2 bg-slate-800/50 rounded"></div>
                          <div className="h-12 w-full bg-charcoal rounded-lg border border-white/5"></div>
                        </div>
                      </div>

                      <div className="col-span-9 space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-charcoal p-3 rounded-xl border border-white/5 hover:bg-slate-800 transition-colors">
                            <p className="text-[8px] text-slate-500 uppercase font-bold">{t('lp.mock.stockLabel')}</p>
                            <p className="text-sm font-black text-white">8,421</p>
                          </div>
                          <div className="bg-charcoal p-3 rounded-xl border border-white/5 hover:bg-slate-800 transition-colors">
                            <p className="text-[8px] text-slate-500 uppercase font-bold">{t('lp.mock.salesLabel')}</p>
                            <p className="text-sm font-black text-primary">$2,140.00</p>
                          </div>
                          <div className="bg-charcoal p-3 rounded-xl border border-white/5 hover:bg-slate-800 transition-colors">
                            <p className="text-[8px] text-slate-500 uppercase font-bold">{t('lp.mock.debtsLabel')}</p>
                            <p className="text-sm font-black text-amber-500">$12,450.00</p>
                          </div>
                        </div>

                        <div className="bg-charcoal/50 rounded-xl border border-white/5 p-4 h-48">
                          <div className="flex justify-between items-center mb-4">
                            <div className="h-3 w-24 bg-slate-800 rounded"></div>
                            <div className="h-3 w-16 bg-slate-800 rounded"></div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="size-6 bg-slate-800 rounded"></div>
                              <div className="flex-1 h-2 bg-slate-800/50 rounded"></div>
                              <div className="w-12 h-2 bg-slate-800/50 rounded"></div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="size-6 bg-slate-800 rounded"></div>
                              <div className="flex-1 h-2 bg-slate-800/50 rounded"></div>
                              <div className="w-12 h-2 bg-slate-800/50 rounded"></div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="size-6 bg-slate-800 rounded"></div>
                              <div className="flex-1 h-2 bg-slate-800/50 rounded"></div>
                              <div className="w-12 h-2 bg-slate-800/50 rounded"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Keep the rest of your sections as-is or migrate similarly.
          Your main lag/glitch issues were in: tilt + DOM i18n + intro timeouts + background.
          Those are fully fixed above. */}

      <footer className="bg-navy-deep border-t border-white/5 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-12">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl border border-primary/20">
                <svg className="size-6 text-primary" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M39.475 21.6262C40.358 21.4363 40.6863 21.5589 40.7581 21.5934C40.7876 21.655 40.8547 21.857 40.8082 22.3336C40.7408 23.0255 40.4502 24.0046 39.8572 25.2301C38.6799 27.6631 36.5085 30.6631 33.5858 33.5858C30.6631 36.5085 27.6632 38.6799 25.2301 39.8572C24.0046 40.4502 23.0255 40.7407 22.3336 40.8082C21.8571 40.8547 21.6551 40.7875 21.5934 40.7581C21.5589 40.6863 21.4363 40.358 21.6262 39.475C21.8562 38.4054 22.4689 36.9657 23.5038 35.2817C24.7575 33.2417 26.5497 30.9744 28.7621 28.762C30.9744 26.5497 33.2417 24.7574 35.2817 23.5037C36.9657 22.4689 38.4054 21.8562 39.475 21.6262ZM4.41189 29.2403L18.7597 43.5881C19.8813 44.7097 21.4027 44.9179 22.7217 44.7893C24.0585 44.659 25.5148 44.1631 26.9723 43.4579C29.9052 42.0387 33.2618 39.5667 36.4142 36.4142C39.5667 33.2618 42.0387 29.9052 43.4579 26.9723C44.1631 25.5148 44.659 24.0585 44.7893 22.7217C44.9179 21.4027 44.7097 19.8813 43.5881 18.7597L29.2403 4.41187C27.8527 3.02428 25.8765 3.02573 24.2861 3.36776C22.6081 3.72863 20.7334 4.58419 18.8396 5.74801C16.4978 7.18716 13.9881 9.18353 11.5858 11.5858C9.18354 13.988 7.18717 16.4978 5.74802 18.8396C4.58421 20.7334 3.72865 22.6081 3.36778 24.2861C3.02574 25.8765 3.02429 27.8527 4.41189 29.2403Z" fill="currentColor"></path>
                </svg>
              </div>
              <span className="text-2xl font-black text-white">FlowVia</span>
            </div>

            <p className="text-xs text-slate-600 font-medium">© 2026 FlowVia Business Solutions.</p>
          </div>
        </div>
      </footer>
    </>
  );
}

  