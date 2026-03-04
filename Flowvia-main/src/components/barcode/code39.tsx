'use client';

import React, { useMemo } from 'react';

// Minimal Code39 generator (good enough for typical handheld scanners)
// Supports: 0-9, A-Z, space, - . $ / + %

const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw',
  'B': 'nnwnnwnnw',
  'C': 'wnwnnwnnn',
  'D': 'nnnnwwnnw',
  'E': 'wnnnwwnnn',
  'F': 'nnwnwwnnn',
  'G': 'nnnnnwwnw',
  'H': 'wnnnnwwnn',
  'I': 'nnwnnwwnn',
  'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww',
  'L': 'nnwnnnnww',
  'M': 'wnwnnnnwn',
  'N': 'nnnnwnnww',
  'O': 'wnnnwnnwn',
  'P': 'nnwnwnnwn',
  'Q': 'nnnnnnwww',
  'R': 'wnnnnnwwn',
  'S': 'nnwnnnwwn',
  'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw',
  'V': 'nwwnnnnnw',
  'W': 'wwwnnnnnn',
  'X': 'nwnnwnnnw',
  'Y': 'wwnnwnnnn',
  'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn', // start/stop
};

function normalize(input: string) {
  return String(input ?? '').toUpperCase();
}

export function Code39Barcode({
  value,
  height = 64,
  narrow = 2,
  wide = 5,
  quietZone = 10,
  showText = true,
}: {
  value: string;
  height?: number;
  narrow?: number;
  wide?: number;
  quietZone?: number;
  showText?: boolean;
}) {
  const v = useMemo(() => normalize(value), [value]);

  const { svgWidth, bars } = useMemo(() => {
    const encoded = `*${v}*`;
    const bars: Array<{ x: number; w: number; isBar: boolean }> = [];

    let x = quietZone;

    const addElement = (isBar: boolean, w: number) => {
      bars.push({ x, w, isBar });
      x += w;
    };

    for (let i = 0; i < encoded.length; i++) {
      const ch = encoded[i];
      const pattern = CODE39[ch];
      if (!pattern) continue;

      // 9 elements alternating bar/space, starting with bar
      let isBar = true;
      for (let j = 0; j < pattern.length; j++) {
        const kind = pattern[j];
        const w = kind === 'w' ? wide : narrow;
        addElement(isBar, w);
        isBar = !isBar;
      }

      // Inter-character gap (narrow space)
      addElement(false, narrow);
    }

    const svgWidth = x + quietZone;
    return { svgWidth, bars };
  }, [v, narrow, wide, quietZone]);

  // Show warning if value contains unsupported chars
  const unsupported = useMemo(() => {
    const encoded = v;
    for (const c of encoded) {
      if (!CODE39[c]) return true;
    }
    return false;
  }, [v]);

  return (
    <div className="flex flex-col items-center gap-2">
      {unsupported && (
        <p className="text-xs text-destructive">
          Unsupported characters detected. Code39 supports A-Z, 0-9 and - . $ / + % (space).
        </p>
      )}
      <svg width={svgWidth} height={height} viewBox={`0 0 ${svgWidth} ${height}`} role="img" aria-label={`Barcode ${v}`}>
        <rect x={0} y={0} width={svgWidth} height={height} fill="white" />
        {bars.filter(b => b.isBar).map((b, idx) => (
          <rect key={idx} x={b.x} y={0} width={b.w} height={height} fill="black" />
        ))}
      </svg>
      {showText && <div className="text-xs font-mono tracking-wider">{v}</div>}
    </div>
  );
}
