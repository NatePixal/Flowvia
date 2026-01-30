
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation, Trans } from 'react-i18next';
import * as THREE from 'three';

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
      el.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02, 1.02, 1.02)`;
    };

    const onEnter = () => {
      rect = el.getBoundingClientRect();
      el.style.willChange = 'transform';
      el.style.transition = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)';
    };

    const onMove = (e: PointerEvent) => {
      if (!rect) rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const px = (x / rect.width) * 2 - 1;
      const py = (y / rect.height) * 2 - 1;

      ry = clamp(px * maxDeg, -maxDeg, maxDeg);
      rx = clamp(-py * maxDeg, -maxDeg, maxDeg);

      el.style.transition = 'transform 70ms linear';
      if (raf === null) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      rect = null;
      if (raf) cancelAnimationFrame(raf);
      raf = null;

      el.style.transition = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)';
      el.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
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

/** Three.js Background Animation (Floating Network) */
function NetworkBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || !containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0B0F1A);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    containerRef.current.appendChild(renderer.domElement);

    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 320;
    const posArray = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 15;
    }
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const material = new THREE.PointsMaterial({
      size: 0.042,
      color: 0x10b981,
      transparent: true,
      opacity: 0.6,
    });

    const particlesMesh = new THREE.Points(particlesGeometry, material);
    scene.add(particlesMesh);

    let raf: number;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      particlesMesh.rotation.y += 0.00055;
      particlesMesh.rotation.x += 0.00022;

      const time = Date.now() * 0.00005;
      scene.rotation.z = Math.sin(time) * 0.08;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (containerRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [reduceMotion]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full -z-10 opacity-60 pointer-events-none"
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
    hidden: (i: number) => ({ opacity: 0, x: 340, scale: 0.65, rotate: 70 }),
    show: (i: number) => ({
      opacity: 1,
      x: 0,
      scale: 1,
      rotate: 0,
      transition: { delay: 0.55 + i * 0.16, duration: 1.25, ease: [0.2, 0.8, 0.2, 1] },
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
            className={`font-mono text-xs absolute right-[-140px] ${p.cls}`}
            variants={particle}
            custom={i}
            animate={{ x: -620, opacity: [0, 1, 1, 0], transition: { delay: 0.18 + i * 0.12, duration: 1.55, ease: 'easeOut' } }}
          >
            {p.text}
          </motion.span>
        ))}
      </div>

      <motion.div
        className="relative w-32 h-32 mb-6 flex items-center justify-center"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { delay: 0.28, duration: 0.7, ease: [0.16, 1, 0.3, 1] } }}
      >
        <motion.div
          className="logo-ribbon bg-gradient-to-br from-primary to-emerald-600 absolute w-[60px] h-[60px] rounded-[14px] flex items-center justify-center shadow-lg"
          style={{ x: -16, y: -12, zIndex: 3 }}
          variants={ribbon}
          custom={0}
        >
          <span className="material-symbols-outlined text-white/60 text-xl">shopping_cart</span>
        </motion.div>

        <motion.div
          className="logo-ribbon bg-gradient-to-br from-brand-blue to-cyan-600 absolute w-[60px] h-[60px] rounded-[14px] flex items-center justify-center shadow-lg"
          style={{ x: 16, y: 0, zIndex: 2 }}
          variants={ribbon}
          custom={1}
        >
          <span className="material-symbols-outlined text-white/60 text-xl">payments</span>
        </motion.div>

        <motion.div
          className="logo-ribbon bg-gradient-to-br from-slate-600 to-slate-800 absolute w-[60px] h-[60px] rounded-[14px] flex items-center justify-center shadow-lg"
          style={{ x: -16, y: 28, zIndex: 1 }}
          variants={ribbon}
          custom={2}
        >
          <span className="material-symbols-outlined text-white/60 text-xl">receipt_long</span>
        </motion.div>

        <motion.div
          className="absolute inset-0 bg-primary/20 blur-xl rounded-full"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1, transition: { delay: 1.35, duration: 1, ease: 'easeOut' } }}
        />
      </motion.div>

      <div className="overflow-hidden h-14 relative">
        <motion.h1
          className="text-5xl font-black text-white"
          initial={{ y: '100%' }}
          animate={{ y: 0, transition: { delay: 1.25, duration: 0.85, ease: [0.2, 0.9, 0.2, 1] } }}
        >
          FlowVia
        </motion.h1>
      </div>

      <motion.p
        className="text-slate-500 text-sm font-bold tracking-widest uppercase mt-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 1.55, duration: 0.9 } }}
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
    const lng = (i18n.language || '').split('-')[0];
    if (lng !== locale) {
      i18n.changeLanguage(locale).catch(() => {});
    }
  }, [i18n, locale]);

  useEffect(() => {
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
      className="nav-link relative text-slate-400 font-bold text-sm px-3 py-2 rounded-xl transition-colors hover:text-white"
      whileHover={{ y: -2 }}
      whileTap={{ y: 0 }}
    >
      <span className="relative z-10">{label}</span>
    </motion.a>
  );

  const LicenseButton = () => (
    <motion.button
      onClick={() => router.push('#pricing')}
      className="bg-primary hover:bg-primary/90 text-navy-deep px-6 py-2.5 rounded-xl text-sm font-extrabold shadow-lg shadow-primary/20"
      whileHover={{ y: -4, boxShadow: '0 16px 40px rgba(16, 185, 129, 0.18)' }}
      whileTap={{ y: 0 }}
    >
      {t('lp.nav.getLicense')}
    </motion.button>
  );

  // Tilt refs
  const heroCardRef = useRef<HTMLDivElement | null>(null);
  useTilt(heroCardRef, 8);

  const featureRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  featureRefs.forEach(ref => useTilt(ref, 8));

  const roleRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  roleRefs.forEach(ref => useTilt(ref, 8));

  const roleCardRef = useRef<HTMLDivElement>(null);
  useTilt(roleCardRef, 8);

  const kpiCardRef = useRef<HTMLDivElement>(null);
  useTilt(kpiCardRef, 8);

  const pricingRef1 = useRef<HTMLDivElement>(null);
  const pricingRef2 = useRef<HTMLDivElement>(null);
  useTilt(pricingRef1, 8);
  useTilt(pricingRef2, 8);

  const reveal = {
    hidden: { opacity: 0, y: 50, rotateX: 10 },
    visible: {
      opacity: 1,
      y: 0,
      rotateX: 0,
      transition: { duration: 1, ease: [0.16, 1, 0.3, 1] }
    }
  };

  return (
    <div className="bg-navy-deep text-white selection:bg-primary selection:text-navy-deep">
      <AnimatePresence>
        {showIntro && <IntroOverlay onDone={finishIntro} key="intro" />}
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
              <Link className="nav-link text-slate-400 font-bold text-sm px-3 py-2 rounded-xl hover:text-white transition-colors" href={`/${locale}/login`}>
                {t('lp.nav.login')}
              </Link>
              <LicenseButton />
            </div>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-20 pb-32">
        <NetworkBackground />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <motion.div
              className="flex-1 text-center lg:text-left"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={reveal}
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
                  className="w-full sm:w-auto px-10 py-5 bg-primary text-navy-deep rounded-2xl font-black text-lg shadow-lg shadow-primary/20"
                  whileHover={{ y: -4, boxShadow: '0 16px 40px rgba(16, 185, 129, 0.18)' }}
                  whileTap={{ y: 0 }}
                >
                  {t('lp.hero.ctaPrimary')}
                </motion.button>

                <motion.button
                  className="w-full sm:w-auto px-10 py-5 bg-charcoal border border-white/10 text-white rounded-2xl font-bold text-lg hover:bg-slate-accent transition-colors inline-flex items-center justify-center gap-3"
                  whileHover={{ y: -4 }}
                  whileTap={{ y: 0 }}
                >
                  <span className="material-symbols-outlined text-primary">calendar_today</span>
                  <span>{t('lp.hero.ctaSecondary')}</span>
                </motion.button>
              </div>

              <div className="mt-8 flex items-center justify-center lg:justify-start gap-6 opacity-70">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="material-symbols-outlined text-sm">language</span>
                  <span className="text-xs font-bold uppercase tracking-wider">{t('lp.hero.supports')}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="material-symbols-outlined text-sm">payments</span>
                  <span className="text-xs font-bold uppercase tracking-wider">{t('lp.hero.currency')}</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="flex-1 w-full max-w-[640px]"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={reveal}
            >
              <div className="relative group dashboard-glow animate-float-slow">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary to-brand-blue rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div
                  ref={heroCardRef}
                  className="relative bg-navy-deep rounded-3xl border border-white/10 shadow-2xl overflow-hidden aspect-[4/3] transform-gpu"
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

      {/* FEATURES SECTION */}
      <section className="py-32 bg-navy-deep relative" id="features">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.03),transparent_70%)]"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div className="text-center mb-20" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}>
            <h2 className="text-primary font-bold tracking-widest text-xs uppercase mb-4">{t('lp.features.kicker')}</h2>
            <h3 className="text-4xl md:text-5xl font-black tracking-tight text-white">{t('lp.features.title')}</h3>
            <p className="mt-6 text-slate-400 max-w-2xl mx-auto text-lg">{t('lp.features.subtitle')}</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: 'inventory_2', title: t('lp.features.inventoryTitle'), desc: t('lp.features.inventoryDesc') },
              { icon: 'point_of_sale', title: t('lp.features.salesTitle'), desc: t('lp.features.salesDesc') },
              { icon: 'payments', title: t('lp.features.loansTitle'), desc: t('lp.features.loansDesc') },
              { icon: 'receipt_long', title: t('lp.features.expensesTitle'), desc: t('lp.features.expensesDesc') },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                ref={featureRefs[i]}
                className="p-10 rounded-3xl bg-charcoal border border-white/5 hover:border-primary/30 transition-all transform-gpu"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={reveal}
              >
                <div className="bg-primary/10 text-primary w-14 h-14 rounded-2xl flex items-center justify-center mb-8 border border-primary/20">
                  <span className="material-symbols-outlined text-3xl">{f.icon}</span>
                </div>
                <h4 className="text-xl font-extrabold mb-4 text-white">{f.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ROLES SECTION */}
      <section className="py-32 bg-charcoal/30 border-y border-white/5" id="roles">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-20">
            <motion.div className="flex-1" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}>
              <h2 className="text-primary font-bold tracking-widest text-xs uppercase mb-4">{t('lp.roles.kicker')}</h2>
              <h3 className="text-4xl md:text-5xl font-black tracking-tight mb-8 leading-tight text-white">
                <Trans i18nKey="lp.roles.title" components={{ br: <br /> }} />
              </h3>
              <p className="text-lg text-slate-400 mb-10 leading-relaxed">{t('lp.roles.subtitle')}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: 'shield_person', title: t('lp.roles.adminTitle'), desc: t('lp.roles.adminDesc'), ref: roleRefs[0] },
                  { icon: 'manage_accounts', title: t('lp.roles.managerTitle'), desc: t('lp.roles.managerDesc'), ref: roleRefs[1] },
                  { icon: 'sell', title: t('lp.roles.salesTitle'), desc: t('lp.roles.salesDesc'), ref: roleRefs[2] },
                  { icon: 'account_balance', title: t('lp.roles.accTitle'), desc: t('lp.roles.accDesc'), ref: roleRefs[3] },
                ].map((r) => (
                  <div key={r.title} ref={r.ref} className="bg-navy-deep p-6 rounded-2xl border border-white/5 transform-gpu">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-symbols-outlined text-primary">{r.icon}</span>
                      <h4 className="font-bold text-white">{r.title}</h4>
                    </div>
                    <p className="text-xs text-slate-500">{r.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div className="flex-1 w-full" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}>
              <div ref={roleCardRef} className="glass-card p-8 rounded-[2rem] space-y-6 max-w-md mx-auto relative z-10 transform-gpu bg-charcoal/70 backdrop-blur-xl border border-white/10">
                <div className="flex items-center gap-5 bg-primary/10 p-5 rounded-2xl border border-primary/20 shadow-lg shadow-primary/10">
                  <div className="size-12 rounded-full bg-primary flex items-center justify-center text-navy-deep font-black text-lg">AD</div>
                  <div>
                    <p className="text-sm font-black text-white">{t('lp.roles.badgeAdmin')}</p>
                    <p className="text-xs text-primary/80 font-semibold">{t('lp.roles.badgeAdminSub')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 bg-navy-deep/60 p-5 rounded-2xl border border-white/5">
                  <div className="size-12 rounded-full bg-slate-700 flex items-center justify-center text-white font-black text-lg">ST</div>
                  <div>
                    <p className="text-sm font-black text-white">{t('lp.roles.badgeSales')}</p>
                    <p className="text-xs text-slate-500 font-semibold">{t('lp.roles.badgeSalesSub')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 bg-navy-deep/40 p-5 rounded-2xl border border-white/5 opacity-50">
                  <div className="size-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-black text-lg">AC</div>
                  <div>
                    <p className="text-sm font-black text-slate-400">{t('lp.roles.badgeAcc')}</p>
                    <p className="text-xs text-slate-600 font-semibold">{t('lp.roles.badgeAccSub')}</p>
                  </div>
                </div>
                <div className="absolute -top-16 -left-16 w-64 h-64 bg-primary/10 blur-[100px] -z-10"></div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* KPI SECTION */}
      <section className="py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-20">
            <motion.div className="flex-1 order-2 lg:order-1" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}>
              <div ref={kpiCardRef} className="rounded-[2.5rem] border border-white/5 bg-charcoal p-10 shadow-2xl relative overflow-hidden transform-gpu">
                <div className="flex items-center justify-between mb-10 relative z-10">
                  <h4 className="font-black text-xl text-white">{t('lp.kpi.cardTitle')}</h4>
                  <div className="flex gap-2 p-1 bg-navy-deep rounded-xl border border-white/5">
                    <span className="px-3 py-1.5 rounded-lg bg-primary text-navy-deep text-[10px] font-black cursor-pointer">{t('lp.kpi.live')}</span>
                  </div>
                </div>
                <div className="space-y-6 relative z-10">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                      <span>{t('lp.kpi.weekly')}</span>
                      <span className="text-primary">+12.5%</span>
                    </div>
                    <div className="h-2 w-full bg-navy-deep rounded-full overflow-hidden">
                      <motion.div className="h-full bg-primary" initial={{ width: 0 }} whileInView={{ width: '65%' }} transition={{ duration: 1.5, ease: 'easeOut' }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                      <span>{t('lp.kpi.margin')}</span>
                      <span className="text-brand-blue">22%</span>
                    </div>
                    <div className="h-2 w-full bg-navy-deep rounded-full overflow-hidden">
                      <motion.div className="h-full bg-brand-blue" initial={{ width: 0 }} whileInView={{ width: '45%' }} transition={{ duration: 1.5, delay: 0.2, ease: 'easeOut' }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                      <span>{t('lp.kpi.health')}</span>
                      <span className="text-emerald-400">{t('lp.kpi.stable')}</span>
                    </div>
                    <div className="h-2 w-full bg-navy-deep rounded-full overflow-hidden">
                      <motion.div className="h-full bg-emerald-400" initial={{ width: 0 }} whileInView={{ width: '82%' }} transition={{ duration: 1.5, delay: 0.4, ease: 'easeOut' }} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div className="flex-1 order-1 lg:order-2" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}>
              <h2 className="text-primary font-bold tracking-widest text-xs uppercase mb-4">{t('lp.kpi.kicker')}</h2>
              <h3 className="text-4xl md:text-5xl font-black tracking-tight mb-8 leading-tight text-white">
                <Trans i18nKey="lp.kpi.title" components={{ br: <br /> }} />
              </h3>
              <p className="text-lg text-slate-400 mb-10 leading-relaxed">{t('lp.kpi.subtitle')}</p>
              <div className="flex flex-wrap gap-4">
                <div className="bg-charcoal px-6 py-4 rounded-2xl border border-white/5 hover:y-[-4] transition-transform">
                  <p className="text-2xl font-black text-white">{t('lp.kpi.liveValue')}</p>
                  <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest">{t('lp.kpi.liveSub')}</p>
                </div>
                <div className="bg-charcoal px-6 py-4 rounded-2xl border border-white/5 hover:y-[-4] transition-transform">
                  <p className="text-2xl font-black text-white">0%</p>
                  <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest">{t('lp.kpi.zeroSub')}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section className="py-32 bg-charcoal/20" id="pricing">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div className="text-center mb-20" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}>
            <h2 className="text-primary font-bold tracking-widest text-xs uppercase mb-4">{t('lp.pricing.kicker')}</h2>
            <h3 className="text-4xl md:text-5xl font-black tracking-tight text-white">{t('lp.pricing.title')}</h3>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <motion.div
              ref={pricingRef1}
              className="p-10 rounded-[2.5rem] bg-navy-deep border-2 border-primary shadow-2xl relative overflow-hidden transform-gpu"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={reveal}
            >
              <div className="absolute top-0 right-0 bg-primary text-navy-deep font-black text-[10px] px-6 py-1 rotate-45 translate-x-6 translate-y-4">
                {t('lp.pricing.popular')}
              </div>
              <h4 className="text-2xl font-black text-white mb-2">{t('lp.pricing.licenseTitle')}</h4>
              <div className="flex items-baseline gap-2 mb-8">
                <span className="text-5xl font-black text-white">$3,490</span>
                <span className="text-slate-500 font-bold">{t('lp.pricing.oneTime')}</span>
              </div>
              <ul className="space-y-4 mb-10">
                {[t('lp.pricing.b1'), t('lp.pricing.b2'), t('lp.pricing.b3'), t('lp.pricing.b4')].map((b) => (
                  <li key={b} className="flex items-center gap-3 text-slate-300 font-semibold">
                    <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <motion.button
                className="w-full py-4 bg-primary text-navy-deep rounded-2xl font-black text-lg shadow-lg shadow-primary/20"
                whileHover={{ y: -4, boxShadow: '0 16px 40px rgba(16, 185, 129, 0.18)' }}
                whileTap={{ y: 0 }}
              >
                {t('lp.pricing.buy')}
              </motion.button>
            </motion.div>

            <motion.div
              ref={pricingRef2}
              className="p-10 rounded-[2.5rem] bg-charcoal border border-white/10 hover:border-white/20 transition-all transform-gpu"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={reveal}
            >
              <h4 className="text-2xl font-black text-white mb-2">{t('lp.pricing.maintTitle')}</h4>
              <p className="text-slate-500 font-bold mb-8">{t('lp.pricing.maintSub')}</p>
              <div className="space-y-6">
                <div className="bg-navy-deep/50 p-6 rounded-2xl border border-white/5">
                  <p className="text-white font-bold mb-2">{t('lp.pricing.m1Title')}</p>
                  <p className="text-sm text-slate-400">{t('lp.pricing.m1Desc')}</p>
                </div>
                <div className="bg-navy-deep/50 p-6 rounded-2xl border border-white/5">
                  <p className="text-white font-bold mb-2">{t('lp.pricing.m2Title')}</p>
                  <p className="text-sm text-slate-400">{t('lp.pricing.m2Desc')}</p>
                </div>
              </div>
              <div className="mt-8">
                <motion.button
                  className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-lg hover:bg-white/10 transition-all"
                  whileHover={{ y: -4 }}
                  whileTap={{ y: 0 }}
                >
                  {t('lp.pricing.estimate')}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary"></div>
        <motion.div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}>
          <h2 className="text-5xl md:text-7xl font-black mb-10 text-navy-deep tracking-tight">
            <Trans i18nKey="lp.cta.title" components={{ br: <br /> }} />
          </h2>
          <p className="text-xl text-navy-deep/80 font-bold mb-14 max-w-2xl mx-auto">{t('lp.cta.subtitle')}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <motion.button className="w-full sm:w-auto px-12 py-6 bg-navy-deep text-white rounded-2xl font-black text-xl" whileHover={{ y: -4 }} whileTap={{ y: 0 }}>
              {t('lp.cta.primary')}
            </motion.button>
            <motion.button className="w-full sm:w-auto px-12 py-6 bg-transparent border-2 border-navy-deep text-navy-deep rounded-2xl font-black text-xl hover:bg-navy-deep hover:text-white transition-all" whileHover={{ y: -4 }} whileTap={{ y: 0 }}>
              {t('lp.cta.secondary')}
            </motion.button>
          </div>
          <p className="mt-12 text-sm text-navy-deep/60 font-black uppercase tracking-widest">{t('lp.cta.tagline')}</p>
        </motion.div>
      </section>

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
            <div className="flex gap-10 text-xs font-bold uppercase tracking-widest text-slate-500">
              <a className="hover:text-primary transition-colors" href="#">{t('lp.footer.privacy')}</a>
              <a className="hover:text-primary transition-colors" href="#">{t('lp.footer.terms')}</a>
              <a className="hover:text-primary transition-colors" href="#">{t('lp.footer.security')}</a>
            </div>
            <p className="text-xs text-slate-600 font-medium">© 2026 FlowVia Business Solutions.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
