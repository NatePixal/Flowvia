'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Currency, FxSnapshot, IncomingProductLog, Supplier } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeRateToBase } from '@/lib/money';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';

interface EditIncomingLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: IncomingProductLog;
  suppliers: Supplier[];
  baseCurrency: Currency;
  onEditLog: (logId: string, data: { quantity: number; unitCost: number; supplier: string; incomeDate: Date; fx?: FxSnapshot }) => void;
}

export default function EditIncomingLogDialog({
  open,
  onOpenChange,
  log,
  suppliers,
  baseCurrency,
  onEditLog,
}: EditIncomingLogDialogProps) {
  const { t, ready } = useTranslation();

  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [incomeDate, setIncomeDate] = useState<Date | undefined>();

  const currency = (log.currency ?? baseCurrency) as Currency;

  const showFxInput = useMemo(() => currency !== baseCurrency, [currency, baseCurrency]);
  const fxPair = useMemo(() => `${currency}->${baseCurrency}`, [currency, baseCurrency]);
  const [fxRate, setFxRate] = useState('');

  useEffect(() => {
    if (!log) return;
    setQuantity(String(log.quantity ?? 0));
    setUnitCost(String(log.unitCost ?? 0));
    setSupplier(log.supplier ?? '');
    setFxRate(String(log.fx?.enteredRate ?? ''));
    
    const d = log.incomeDate || log.date;
    if (d instanceof Timestamp) {
        setIncomeDate(d.toDate());
    } else if (d instanceof Date) {
        setIncomeDate(d);
    } else if (typeof d === 'string') {
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) {
            setIncomeDate(parsed);
        }
    } else {
        setIncomeDate(undefined);
    }

  }, [log]);

  const handleSubmit = () => {
    const qty = parseInt(quantity, 10) || 0;
    const cost = parseFloat(unitCost) || 0;

    if (qty <= 0) {
      alert('Quantity must be > 0.');
      return;
    }
    if (cost < 0) {
      alert('Unit cost must be >= 0.');
      return;
    }
    if (!incomeDate) {
        alert('Income date is required.');
        return;
    }

    let fx: FxSnapshot | undefined;

    if (showFxInput) {
      const enteredRate = parseFloat(fxRate);
      if (!Number.isFinite(enteredRate) || enteredRate <= 0) {
        alert('FX rate is required and must be > 0.');
        return;
      }

      fx = {
        rateToBase: normalizeRateToBase(enteredRate, fxPair, currency, baseCurrency),
        enteredRate,
        enteredPair: fxPair,
        capturedAt: serverTimestamp(),
      };
    }

    onEditLog(log.id, { quantity: qty, unitCost: cost, supplier, fx, incomeDate });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('incoming.edit')}</DialogTitle>
            <DialogDescription>Edit incoming stock receipt.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label>{t('incoming.productCode')}</Label>
              <Input value={log.productCode} disabled />
            </div>
            
            <div className="col-span-2 space-y-2">
              <Label>{t('incoming.incomeDate')}</Label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !incomeDate && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {incomeDate ? format(incomeDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={incomeDate}
                        onSelect={setIncomeDate}
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
            </div>

            <div className="space-y-2">
              <Label>{t('incoming.quantity')}</Label>
              <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('incoming.unitCost')}</Label>
              <Input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Currency: <span className="font-mono">{currency}</span> (base: <span className="font-mono">{baseCurrency}</span>)
              </p>
            </div>

            {showFxInput && (
              <div className="col-span-2 space-y-2">
                <Label>
                  Manual FX rate for <span className="font-mono">{fxPair}</span>
                </Label>
                <Input
                  type="number"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  placeholder={`Enter rate for ${fxPair}`}
                />
              </div>
            )}

            <div className="col-span-2 space-y-2">
              <Label>{t('incoming.supplier')}</Label>
              <Select onValueChange={setSupplier} value={supplier}>
                <SelectTrigger>
                  <SelectValue placeholder={t('incoming.selectSupplier')} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('incoming.cancel')}
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit}>
              {t('incoming.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
