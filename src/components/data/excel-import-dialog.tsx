
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { downloadTemplate, ExcelTemplate } from "@/lib/excel/templates";
import { useTranslation } from "react-i18next";

export function ExcelImportDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  template: ExcelTemplate;
  onImport: (file: File) => Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!file) {
      toast({ variant: "destructive", title: "No file selected" });
      return;
    }
    setBusy(true);
    try {
      await props.onImport(file);
      toast({ title: "Import complete" });
      props.onOpenChange(false);
      setFile(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message || String(e) });
      console.error("[XLSX IMPORT FAILED]", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.description && <DialogDescription>{props.description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <Button variant="outline" onClick={() => downloadTemplate(props.template)} disabled={busy}>
            Download Template
          </Button>

          <div className="space-y-2">
            <div className="text-sm font-medium">Select .xlsx file</div>
            <input
              type="file"
              accept=".xlsx"
              disabled={busy || props.disabled}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          {file && <div className="text-sm text-muted-foreground">Selected: {file.name}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} disabled={busy || props.disabled || !file}>
            {busy ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
