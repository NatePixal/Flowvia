
'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, MoreHorizontal, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  where,
  collection,
  deleteField,
  orderBy,
} from 'firebase/firestore';
import { format } from 'date-fns';

import type {
  Company,
  Currency,
  FxSnapshot,
  IncomingProductLog,
  Product,
  Supplier,
  SupplierLedgerEntry,
} from '@/lib/types';

import AddIncomingProductDialog from '@/components/incoming/add-incoming-product-dialog';
import EditIncomingLogDialog from '@/components/incoming/edit-incoming-log-dialog';
import DeleteIncomingLogDialog from '@/components/incoming/delete-incoming-log-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { importIncomingProducts } from '@/lib/csv-import';
import { Input } from '@/components/ui/input';
import { companyCollection, companyDoc, withCompanyId } from '@/lib/firestore-path';
import { recomputeSupplierBalance } from '@/lib/ledger-recompute';
import {
  addMinor,
  convertMinorToBase,
  formatMoneyMinor,
  multiplyMinor,
  subtractMinor,
  toMinor,
  fromMinor,
} from '@/lib/money';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { hasPermission } from '@/lib/permissions';
import { useDoc } from '@/firebase/firestore/use-doc';
import { FancyCard } from '@/components/ui/fancy-card';
import { normalizeProductCode } from '@/lib/normalize';

const toFinite = (v: any, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function IncomingPage() {
  const { t } = useTranslation();
  const { firestore, companyId, userProfile, user, companyBaseCurrency } = useFirebase();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<IncomingProductLog | null>(null);

  const { data: products } = useCompanyCollection<Product>('products');
  const { data: suppliers } = useCompanyCollection<Supplier>('suppliers');

  const incomingOrder = useMemo(() => orderBy('date', 'desc'), []);
  const { data: incomingLogs, loading: logsLoading } = useCompanyCollection<IncomingProductLog>('incomingProducts', incomingOrder);

  const canImport = hasPermission(userProfile, 'products', 'import');

  const companyDocRef = useMemo(
    () => (firestore && companyId ? doc(firestore, 'companies', companyId) : null),
    [firestore, companyId]
  );
  const { data: company } = useDoc<Company>(companyDocRef);

  const baseCurrency: Currency = (companyBaseCurrency ?? 'USD') as Currency;
  
  const formatDate = (log: IncomingProductLog) => {
    // Priority: user-provided incomeDate, then fallback to legacy date field.
    const d = log.incomeDate ?? log.date;
    if (!d) return 'N/A';
    // Handle both Timestamp and string/Date
    const date = d instanceof Timestamp ? d.toDate() : new Date(d as any);
    return format(date, 'yyyy-MM-dd');
  };

  const formatLogMoneyUnitCost = (log: IncomingProductLog) => {
    const c = (log.currency ?? baseCurrency) as Currency;
    const minor = (log.unitCostMinor ?? toMinor(Number.isFinite(log.unitCost) ? log.unitCost : 0, c));
    return formatMoneyMinor(minor, c);
  };

  const formatLogMoneyTotal = (log: IncomingProductLog) => {
    const c = (log.currency ?? baseCurrency) as Currency;
    const minor = (log.totalCostMinor ?? toMinor(Number.isFinite(log.totalCost) ? log.totalCost : 0, c));
    return formatMoneyMinor(minor, c);
  };
  
  const handleAddIncomingProduct = async (incoming: {
    productCode: string;
    quantity: number;
    supplier?: string;
    unitCost: number; // major
    currency: Currency;
    location?: string;
    minStock?: number;
    fx?: FxSnapshot;
    incomeDate: Date;
  }) => {
    if (!firestore || !companyId) return;
  
    if (!company?.baseCurrency) {
      toast({
        variant: 'destructive',
        title: t('error'),
        description: 'Base currency is not set. Set it in Company Settings first.',
      });
      return;
    }
  
    const baseCurrency = company.baseCurrency as Currency;
  
    try {
      await runTransaction(firestore, async (transaction) => {
        const code = normalizeProductCode(incoming.productCode);
        const productRef = companyDoc(firestore, companyId, `products/${code}`);
        const incomingLogCollectionRef = companyCollection(firestore, companyId, 'incomingProducts');
  
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) {
          throw new Error('Product not found. Create it in Inventory first, then top up stock here.');
        }
  
        const product = productSnap.data() as Product;
  
        // Enforce consistent purchase currency for the product
        const purchaseCurrency = product.purchasePriceCurrency;
        if (incoming.currency !== purchaseCurrency) {
          throw new Error(
            `Incoming currency (${incoming.currency}) must match product purchase currency (${purchaseCurrency}).`
          );
        }
  
        const incomingQty = toFinite(incoming.quantity, 0);
        const unitCostMajor = toFinite(incoming.unitCost, 0);
  
        if (incomingQty <= 0) throw new Error('Quantity must be > 0.');
        if (unitCostMajor < 0) throw new Error('Unit cost must be >= 0.');
  
        // Receipt amounts (purchase currency)
        const unitCostMinor = toMinor(unitCostMajor, purchaseCurrency);
        const totalCostMinor = multiplyMinor(unitCostMinor, incomingQty);
  
        // Base conversion
        let totalCostBaseMinor: number;
        if (purchaseCurrency === baseCurrency) {
          totalCostBaseMinor = totalCostMinor;
        } else {
          if (!incoming.fx) {
            throw new Error(`FX snapshot required for ${purchaseCurrency} -> ${baseCurrency}.`);
          }
          totalCostBaseMinor = convertMinorToBase(
            totalCostMinor,
            incoming.fx.rateToBase,
            purchaseCurrency,
            baseCurrency
          );
        }
  
        const unitCostBaseMinor = incomingQty > 0 ? Math.round(totalCostBaseMinor / incomingQty) : 0;
  
        // Product old state
        const oldQty = toFinite(product.quantity, 0);
  
        // purchase-currency avg
        const oldAvgCostMinor =
          Number.isFinite(product.costMinor as any)
            ? (product.costMinor as number)
            : toMinor(toFinite(product.cost, 0), purchaseCurrency);
  
        const oldValueMinor = multiplyMinor(oldAvgCostMinor, oldQty);
        const newQty = oldQty + incomingQty;
        const newValueMinor = addMinor(oldValueMinor, totalCostMinor);
        const newAvgCostMinor = newQty > 0 ? Math.round(newValueMinor / newQty) : unitCostMinor;
  
        // base-currency avg
        const oldAvgCostBaseMinor =
          Number.isFinite(product.costBaseMinor as any)
            ? (product.costBaseMinor as number)
            : purchaseCurrency === baseCurrency
              ? oldAvgCostMinor
              : null;
  
        if (oldQty > 0 && oldAvgCostBaseMinor === null) {
          throw new Error(
            'This product has existing stock but costBaseMinor is missing. Run a one-time migration or set opening stock correctly.'
          );
        }
  
        const oldValueBaseMinor = multiplyMinor(oldAvgCostBaseMinor ?? 0, oldQty);
        const newValueBaseMinor = addMinor(oldValueBaseMinor, totalCostBaseMinor);
        const newAvgCostBaseMinor = newQty > 0 ? Math.round(newValueBaseMinor / newQty) : unitCostBaseMinor;
  
        // ✅ Update product (NEVER write undefined)
        const productUpdate: any = {
          quantity: newQty,
          lowStock: newQty <= (product.minStock || 0),
          supplier: incoming.supplier ?? product.supplier ?? '',
          warehouseLocation: incoming.location ?? product.warehouseLocation ?? '',
          minStock: incoming.minStock ?? product.minStock ?? 0,
  
          // legacy + new
          costMinor: newAvgCostMinor,
          cost: fromMinor(newAvgCostMinor, purchaseCurrency),
          costBaseMinor: newAvgCostBaseMinor,
  
          updatedAt: serverTimestamp(),
        };
  
        if (purchaseCurrency !== baseCurrency) {
          productUpdate.costFx = incoming.fx; // required above
        } else {
          productUpdate.costFx = deleteField(); // remove any old fx
        }
  
        transaction.update(productRef, productUpdate);
  
        // ✅ Write incoming log (NEVER write undefined)
        const newLogRef = doc(incomingLogCollectionRef);
        const businessDay = format(incoming.incomeDate, 'yyyy-MM-dd');
        const businessDate = Timestamp.fromDate(new Date(`${businessDay}T00:00:00.000Z`));
  
        const logData: any = withCompanyId(companyId, {
          productCode: code,
          quantity: incomingQty,
          supplier: incoming.supplier ?? '',
          currency: purchaseCurrency,
  
          unitCost: unitCostMajor,
          totalCost: incomingQty * unitCostMajor,
  
          unitCostMinor,
          totalCostMinor,
  
          baseCurrency,
          unitCostBaseMinor,
          totalCostBaseMinor,
  
          incomeDate: Timestamp.fromDate(incoming.incomeDate),
          businessDay,
          businessDate,
          date: Timestamp.fromDate(incoming.incomeDate), // FIX: Use user date for legacy field
          recordedAt: serverTimestamp(),
        });
  
        if (purchaseCurrency !== baseCurrency) {
          logData.fx = incoming.fx; // required above
        }
  
        transaction.set(newLogRef, logData);
  
        // Supplier ledger (purchase currency)
        const supplierObj = suppliers.find((s) => s.name === (incoming.supplier ?? ''));
        if (supplierObj) {
          const supplierLedgerRef = companyCollection(
            firestore,
            companyId,
            `suppliers/${supplierObj.id}/ledger`
          );
  
          const ledgerEntry: Omit<SupplierLedgerEntry, 'id'> = {
            companyId,
            supplierId: supplierObj.id,
            type: 'purchase',
            currency: purchaseCurrency,
            purchaseTotalMinor: totalCostMinor,
            purchasePaidMinor: 0,
            purchaseDueMinor: totalCostMinor,
            note: `Purchase of ${incomingQty} x ${product.productCode}`,
            relatedIncomingLogId: newLogRef.id,
            createdAt: serverTimestamp(),
            businessDay,
            businessDate,
          };
  
          transaction.set(doc(supplierLedgerRef), withCompanyId(companyId, ledgerEntry));
        }
      });
  
      // recompute supplier balance
      const supplierObj = suppliers.find((s) => s.name === (incoming.supplier ?? ''));
      if (supplierObj) {
        await recomputeSupplierBalance(firestore, companyId, supplierObj.id);
      }
  
      toast({ title: t('stockUpdated'), description: t('stockUpdatedSuccessMessage') });
      setIsAddDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message });
    }
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canImport) {
      toast({
        variant: 'destructive',
        title: 'Permission denied',
        description: 'You are not allowed to import files.',
      });
      event.target.value = '';
      return;
    }

    if (!event.target.files || event.target.files.length === 0 || !firestore || !companyId) return;

    const file = event.target.files[0];
    try {
      await importIncomingProducts(file, firestore, companyId);
      toast({ title: t('importSuccess'), description: t('productsImportedSuccessfully') });
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('importFailed'), description: e.message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpdateLog = async (
    logId: string,
    newData: { quantity: number; unitCost: number; supplier: string; incomeDate: Date; fx?: FxSnapshot }
  ) => {
    if (!firestore || !companyId || !selectedLog) return;
  
    if (!company?.baseCurrency) {
      toast({
        variant: 'destructive',
        title: t('error'),
        description: 'Base currency is not set. Set it in Company Settings first.',
      });
      return;
    }
  
    const baseCurrency = company.baseCurrency as Currency;
  
    try {
      let supplierToUpdateIds: string[] = [];
  
      // Pre-fetch ledger doc OUTSIDE the transaction
      const oldSupplier = suppliers.find((s) => s.name === (selectedLog.supplier ?? ''));
      const newSupplier = suppliers.find((s) => s.name === (newData.supplier ?? ''));
  
      let oldLedgerDocRef: any = null;
      let oldLedgerPaidMinor: number | null = null;
  
      if (oldSupplier) {
        const qRef = query(
          companyCollection(firestore, companyId, `suppliers/${oldSupplier.id}/ledger`),
          where('relatedIncomingLogId', '==', logId)
        );
        const snap = await getDocs(qRef);
        if (!snap.empty) {
          oldLedgerDocRef = snap.docs[0].ref;
          const d = snap.docs[0].data() as SupplierLedgerEntry;
          oldLedgerPaidMinor = typeof d.purchasePaidMinor === 'number' ? d.purchasePaidMinor : 0;
        }
      }
  
      await runTransaction(firestore, async (transaction) => {
        const logRef = companyDoc(firestore, companyId, `incomingProducts/${logId}`);
        const logSnap = await transaction.get(logRef);
        if (!logSnap.exists()) throw new Error('Log entry not found.');
        const oldLog: any = logSnap.data();
  
        const productRef = companyDoc(firestore, companyId, `products/${oldLog.productCode}`);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error('Product not found.');
        const product = productSnap.data() as Product;
  
        const purchaseCurrency = (oldLog.currency ?? product.purchasePriceCurrency ?? baseCurrency) as Currency;
  
        if (purchaseCurrency !== product.purchasePriceCurrency) {
          throw new Error('Data mismatch: log currency does not match product purchase currency.');
        }
  
        const oldQty = toFinite(oldLog.quantity);
        const newQty = toFinite(newData.quantity);
  
        const oldUnitCostMajor =
          Number.isFinite(oldLog.unitCost as any)
            ? toFinite(oldLog.unitCost)
            : oldLog.totalCost && oldQty > 0
              ? toFinite(oldLog.totalCost) / oldQty
              : 0;
  
        const newUnitCostMajor = toFinite(newData.unitCost);
  
        // old totals (minor)
        const oldUnitCostMinor = Number.isFinite(oldLog.unitCostMinor as any)
          ? toFinite(oldLog.unitCostMinor)
          : toMinor(toFinite(oldUnitCostMajor), purchaseCurrency);
  
        const oldTotalMinor = Number.isFinite(oldLog.totalCostMinor as any)
          ? toFinite(oldLog.totalCostMinor)
          : multiplyMinor(oldUnitCostMinor, oldQty);
  
        // old base total
        let oldTotalBaseMinor: number;
        if (purchaseCurrency === baseCurrency) {
          oldTotalBaseMinor = oldTotalMinor;
        } else {
          const oldFx = oldLog.fx as FxSnapshot | undefined;
          if (!oldFx) {
            throw new Error(`Old log is missing FX snapshot for ${purchaseCurrency} -> ${baseCurrency}`);
          }
          oldTotalBaseMinor = convertMinorToBase(oldTotalMinor, oldFx.rateToBase, purchaseCurrency, baseCurrency);
        }
  
        // new totals (minor)
        const newUnitCostMinor = toMinor(newUnitCostMajor, purchaseCurrency);
        const newTotalMinor = multiplyMinor(newUnitCostMinor, newQty);
  
        // new base total
        let newTotalBaseMinor: number;
        if (purchaseCurrency === baseCurrency) {
          newTotalBaseMinor = newTotalMinor;
        } else {
          if (!newData.fx) {
            throw new Error(`FX snapshot required for ${purchaseCurrency} -> ${baseCurrency}`);
          }
          newTotalBaseMinor = convertMinorToBase(newTotalMinor, newData.fx.rateToBase, purchaseCurrency, baseCurrency);
        }
  
        const deltaQty = newQty - oldQty;
        const deltaMinor = newTotalMinor - oldTotalMinor;
        const deltaBaseMinor = newTotalBaseMinor - oldTotalBaseMinor;
  
        // current product totals
        const currentQty = toFinite(product.quantity);
        const currentAvgCostMinor = Number.isFinite(product.costMinor as any)
          ? (product.costMinor as number)
          : toMinor(toFinite(product.cost), purchaseCurrency);
  
        const currentAvgCostBaseMinor = Number.isFinite(product.costBaseMinor as any)
          ? (product.costBaseMinor as number)
          : purchaseCurrency === baseCurrency
            ? currentAvgCostMinor
            : null;
  
        if (currentQty > 0 && currentAvgCostBaseMinor === null) {
          throw new Error('Product costBaseMinor missing. Run migration or fix opening stock.');
        }
  
        const currentTotalMinor = multiplyMinor(currentAvgCostMinor, currentQty);
        const currentTotalBaseMinor = multiplyMinor(currentAvgCostBaseMinor ?? 0, currentQty);
  
        const newProductQty = currentQty + deltaQty;
        const newProductTotalMinor = addMinor(currentTotalMinor, deltaMinor);
        const newProductTotalBaseMinor = addMinor(currentTotalBaseMinor, deltaBaseMinor);
  
        const newAvgCostMinor = newProductQty > 0 ? Math.round(newProductTotalMinor / newProductQty) : 0;
        const newAvgCostBaseMinor = newProductQty > 0 ? Math.round(newProductTotalBaseMinor / newProductQty) : 0;
  
        // ✅ 1) Update Product (NEVER write undefined)
        const productUpdate: any = {
          quantity: newProductQty,
          lowStock: newProductQty <= (product.minStock || 0),
          supplier: newData.supplier,
  
          costMinor: newAvgCostMinor,
          cost: fromMinor(newAvgCostMinor, purchaseCurrency),
          costBaseMinor: newAvgCostBaseMinor,
  
          updatedAt: serverTimestamp(),
        };
  
        if (purchaseCurrency !== baseCurrency) {
          productUpdate.costFx = newData.fx; // required above
        } else {
          productUpdate.costFx = deleteField();
        }
  
        transaction.update(productRef, productUpdate);
  
        const businessDay = format(newData.incomeDate, 'yyyy-MM-dd');
        const businessDate = Timestamp.fromDate(new Date(`${businessDay}T00:00:00.000Z`));

        // ✅ 2) Update Log (NEVER write undefined)
        const logUpdate: any = {
          quantity: newQty,
          supplier: newData.supplier,
          unitCost: newUnitCostMajor,
          totalCost: newQty * newUnitCostMajor,
  
          unitCostMinor: newUnitCostMinor,
          totalCostMinor: newTotalMinor,
  
          baseCurrency,
          unitCostBaseMinor: newQty > 0 ? Math.round(newTotalBaseMinor / newQty) : 0,
          totalCostBaseMinor: newTotalBaseMinor,

          incomeDate: Timestamp.fromDate(newData.incomeDate),
          businessDay,
          businessDate,
          date: Timestamp.fromDate(newData.incomeDate), // FIX: Update legacy date field as well
          editedAt: serverTimestamp(),
          editedBy: user?.uid,
          ...(oldLog.originalIncomeDate
            ? {}
            : {
                originalIncomeDate:
                  oldLog.incomeDate instanceof Timestamp
                    ? oldLog.incomeDate
                    : oldLog.incomeDate
                      ? Timestamp.fromDate(new Date(oldLog.incomeDate as any))
                      : oldLog.date,
              }),
        };
  
        if (purchaseCurrency !== baseCurrency) {
          logUpdate.fx = newData.fx; // required above
        } else {
          logUpdate.fx = deleteField();
        }
  
        transaction.update(logRef, logUpdate);
  
        // ✅ 3) Supplier ledger update (move if supplier changed)
        const oldSupplierName = oldLog.supplier ?? '';
        const supplierChanged = oldSupplierName !== (newData.supplier ?? '');
  
        if (supplierChanged) {
          if (oldLedgerDocRef) transaction.delete(oldLedgerDocRef);
  
          if (newSupplier) {
            supplierToUpdateIds.push(newSupplier.id);
  
            const newLedgerColl = companyCollection(
              firestore,
              companyId,
              `suppliers/${newSupplier.id}/ledger`
            );
  
            const entry: Omit<SupplierLedgerEntry, 'id'> = {
              companyId,
              supplierId: newSupplier.id,
              type: 'purchase',
              currency: purchaseCurrency,
              purchaseTotalMinor: newTotalMinor,
              purchasePaidMinor: 0,
              purchaseDueMinor: newTotalMinor,
              note: `Purchase of ${newQty} x ${oldLog.productCode}`,
              relatedIncomingLogId: logId,
              createdAt: serverTimestamp(),
              businessDay,
              businessDate: Timestamp.fromDate(newData.incomeDate),
            };
  
            transaction.set(doc(newLedgerColl), withCompanyId(companyId, entry));
          }
  
          if (oldSupplier) supplierToUpdateIds.push(oldSupplier.id);
        } else {
          if (oldSupplier) {
            supplierToUpdateIds.push(oldSupplier.id);
  
            if (oldLedgerDocRef) {
              const paid = oldLedgerPaidMinor ?? 0;
              const due = Math.max(0, newTotalMinor - paid);
  
              transaction.update(oldLedgerDocRef, {
                purchaseTotalMinor: newTotalMinor,
                purchaseDueMinor: due,
                businessDate: Timestamp.fromDate(newData.incomeDate),
              });
            } else {
              const ledgerColl = companyCollection(
                firestore,
                companyId,
                `suppliers/${oldSupplier.id}/ledger`
              );
  
              const entry: Omit<SupplierLedgerEntry, 'id'> = {
                companyId,
                supplierId: oldSupplier.id,
                type: 'purchase',
                currency: purchaseCurrency,
                purchaseTotalMinor: newTotalMinor,
                purchasePaidMinor: 0,
                purchaseDueMinor: newTotalMinor,
                note: `Purchase of ${newQty} x ${oldLog.productCode}`,
                relatedIncomingLogId: logId,
                createdAt: serverTimestamp(),
                businessDay,
                businessDate: Timestamp.fromDate(newData.incomeDate),
              };
  
              transaction.set(doc(ledgerColl), withCompanyId(companyId, entry));
            }
          }
        }
      });
  
      supplierToUpdateIds = Array.from(new Set(supplierToUpdateIds)).filter(Boolean);
      for (const sid of supplierToUpdateIds) {
        await recomputeSupplierBalance(firestore, companyId, sid);
      }
  
      toast({ title: t('logUpdated'), description: t('logAndStockUpdatedSuccessfully') });
      setIsEditDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message });
    }
  };

  const handleDeleteLog = async () => {
    if (!firestore || !companyId || !selectedLog) return;

    if (!company?.baseCurrency) {
      toast({
        variant: 'destructive',
        title: t('error'),
        description: 'Base currency is not set. Set it in Company Settings first.',
      });
      return;
    }

    try {
      let supplierToUpdateId: string | null = null;

      // prefetch supplier ledger doc ref outside transaction
      const supplierObj = suppliers.find((s) => s.name === (selectedLog.supplier ?? ''));
      let ledgerDocRef: any = null;

      if (supplierObj) {
        supplierToUpdateId = supplierObj.id;
        const qRef = query(
          companyCollection(firestore, companyId, `suppliers/${supplierObj.id}/ledger`),
          where('relatedIncomingLogId', '==', selectedLog.id)
        );
        const snap = await getDocs(qRef);
        if (!snap.empty) ledgerDocRef = snap.docs[0].ref;
      }

      await runTransaction(firestore, async (transaction) => {
        const logRef = companyDoc(firestore, companyId, `incomingProducts/${selectedLog.id}`);
        const productRef = companyDoc(firestore, companyId, `products/${selectedLog.productCode}`);

        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) throw new Error(t('productNotFoundCannotRevertStock'));

        const product = productDoc.data() as Product;

        const purchaseCurrency = product.purchasePriceCurrency;
        const currentQty = toFinite(product.quantity);

        // current totals
        const currentAvgCostMinor = Number.isFinite(product.costMinor)
          ? (product.costMinor as number)
          : toMinor(toFinite(product.cost), purchaseCurrency);
        const currentAvgCostBaseMinor = Number.isFinite(product.costBaseMinor)
          ? (product.costBaseMinor as number)
          : purchaseCurrency === baseCurrency
            ? currentAvgCostMinor
            : null;

        if (currentQty > 0 && currentAvgCostBaseMinor === null) {
          throw new Error('Product costBaseMinor missing. Run migration or fix opening stock.');
        }

        const currentTotalMinor = multiplyMinor(currentAvgCostMinor, currentQty);
        const currentTotalBaseMinor = multiplyMinor(currentAvgCostBaseMinor ?? 0, currentQty);

        // log totals
        const logQty = toFinite(selectedLog.quantity);
        const logUnitCostMajor = Number.isFinite(selectedLog.unitCost)
          ? selectedLog.unitCost
          : selectedLog.totalCost && logQty > 0
            ? selectedLog.totalCost / logQty
            : 0;

        const logUnitCostMinor = Number.isFinite(selectedLog.unitCostMinor)
          ? selectedLog.unitCostMinor
          : toMinor(toFinite(logUnitCostMajor), purchaseCurrency);

        const logTotalMinor = Number.isFinite(selectedLog.totalCostMinor)
          ? selectedLog.totalCostMinor
          : multiplyMinor(logUnitCostMinor, logQty);

        let logTotalBaseMinor: number;
        if (purchaseCurrency === baseCurrency) {
          logTotalBaseMinor = logTotalMinor;
        } else {
          const fx = selectedLog.fx;
          if (!fx) throw new Error(`Selected log missing FX snapshot for ${purchaseCurrency} -> ${baseCurrency}`);
          logTotalBaseMinor = convertMinorToBase(logTotalMinor, fx.rateToBase, purchaseCurrency, baseCurrency);
        }

        // new qty and totals
        const newQty = currentQty - logQty;
        const newTotalMinor = subtractMinor(currentTotalMinor, logTotalMinor);
        const newTotalBaseMinor = subtractMinor(currentTotalBaseMinor, logTotalBaseMinor);

        const newAvgCostMinor = newQty > 0 ? Math.round(newTotalMinor / newQty) : 0;
        const newAvgCostBaseMinor = newQty > 0 ? Math.round(newTotalBaseMinor / newQty) : 0;

        transaction.update(productRef, {
          quantity: newQty,
          lowStock: newQty <= (product.minStock || 0),
          costMinor: newAvgCostMinor,
          cost: fromMinor(newAvgCostMinor, purchaseCurrency),
          costBaseMinor: newAvgCostBaseMinor,
          updatedAt: serverTimestamp(),
        });

        transaction.delete(logRef);

        if (ledgerDocRef) {
          transaction.delete(ledgerDocRef);
        }
      });

      if (supplierToUpdateId) {
        await recomputeSupplierBalance(firestore, companyId, supplierToUpdateId);
      }

      toast({ title: t('logDeleted'), description: t('logDeletedSuccessMessage') });
      setIsDeleteDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message });
    }
  };

  const openEditDialog = (log: IncomingProductLog) => {
    setSelectedLog(log);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (log: IncomingProductLog) => {
    setSelectedLog(log);
    setIsDeleteDialogOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('incoming.pageTitle')}</h1>
            <p className="text-muted-foreground">{t('incoming.pageDescription')}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {canImport && (
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {t('incoming.importFile')}
                <Input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileImport}
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                />
              </Button>
            )}

            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('incoming.addEntry')}
            </Button>
          </div>
        </div>

        <FancyCard>
          <CardHeader>
            <CardTitle>{t('incoming.incomingStock')}</CardTitle>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <p>{t('incoming.loadingLogs')}...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('incoming.incomeDate')}</TableHead>
                    <TableHead>{t('incoming.productCode')}</TableHead>
                    <TableHead>{t('incoming.supplier')}</TableHead>
                    <TableHead className="text-center">{t('incoming.quantity')}</TableHead>
                    <TableHead className="text-right">{t('incoming.unitCost')}</TableHead>
                    <TableHead className="text-right">{t('incoming.totalCost')}</TableHead>
                    <TableHead className="text-center">{t('incoming.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomingLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{formatDate(log)}</TableCell>
                      <TableCell className="font-mono">{log.productCode}</TableCell>
                      <TableCell>{log.supplier}</TableCell>
                      <TableCell className="text-center">{log.quantity}</TableCell>
                      <TableCell className="text-right">{formatLogMoneyUnitCost(log)}</TableCell>
                      <TableCell className="text-right">{formatLogMoneyTotal(log)}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(log)}>
                              {t('incoming.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openDeleteDialog(log)}
                              className="text-destructive"
                            >
                              {t('incoming.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </FancyCard>
      </div>

      <AddIncomingProductDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddIncomingProduct={handleAddIncomingProduct}
        products={products}
        suppliers={suppliers}
        baseCurrency={baseCurrency}
      />

      {selectedLog && (
        <EditIncomingLogDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onEditLog={handleUpdateLog}
          log={selectedLog}
          suppliers={suppliers}
          baseCurrency={baseCurrency}
        />
      )}

      {selectedLog && (
        <DeleteIncomingLogDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleDeleteLog}
        />
      )}
    </>
  );
}
