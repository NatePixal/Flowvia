"use client";

export default function IntroScreen() {
  return (
    <div
      id="intro-screen"
      className="fixed inset-0 z-[100] bg-navy-deep flex flex-col items-center justify-center overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none">
        <span className="data-particle text-primary font-mono text-xs absolute top-[22%] right-[-140px] opacity-0">
          Sales + $4,200
        </span>
      </div>
    </div>
  );
}
