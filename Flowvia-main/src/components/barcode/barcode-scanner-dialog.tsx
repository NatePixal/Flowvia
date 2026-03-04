'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
};

export default function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const supported = useMemo(() => {
    return typeof window !== 'undefined' && 'BarcodeDetector' in window;
  }, []);

  const [error, setError] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);

  async function stop() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function start() {
    setError('');
    setIsStarting(true);

    try {
      if (!supported) {
        setError(t('barcode.notSupported'));
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // @ts-ignore
      const detector = new window.BarcodeDetector({ formats: ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e'] });

      const tick = async () => {
        if (!videoRef.current) return;
        try {
          // @ts-ignore
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const raw = String(barcodes[0].rawValue ?? '').trim();
            if (raw) {
              onDetected(raw);
              onOpenChange(false);
              return;
            }
          }
        } catch (e: any) {
          // ignore detector errors
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      setError(e?.message || t('barcode.cameraError'));
    } finally {
      setIsStarting(false);
    }
  }

  useEffect(() => {
    if (!open) {
      stop();
      setError('');
      return;
    }
    start();
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('barcode.scanTitle')}</DialogTitle>
          <DialogDescription>{t('barcode.scanDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {!supported && (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              {t('barcode.notSupported')}
            </div>
          )}

          <div className="overflow-hidden rounded-md border bg-black">
            <video ref={videoRef} className="h-[260px] w-full object-cover" playsInline muted />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('misc.close')}
          </Button>
          <Button onClick={start} disabled={isStarting}>
            {t('barcode.retry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
