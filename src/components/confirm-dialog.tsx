"use client";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

import { useId, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  reason?: {
    label: string;
    placeholder?: string;
    required?: boolean;
  };
  onConfirm: (reason: string) => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  reason,
  onConfirm,
}: ConfirmDialogProps) {
  const [reasonValue, setReasonValue] = useState("");
  const reasonId = useId();

  const reasonRequired = reason?.required ?? false;
  const canConfirm = !reasonRequired || reasonValue.trim().length > 0;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setReasonValue("");
    onOpenChange(nextOpen);
  }

  function handleConfirm() {
    const reasonText = reasonValue.trim();
    setReasonValue("");
    onConfirm(reasonText);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent role="alertdialog" showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {reason ? (
          <div>
            <Label htmlFor={reasonId}>
              {reason.label}
            </Label>
            <Textarea
              id={reasonId}
              value={reasonValue}
              onChange={(event) => setReasonValue(event.target.value)}
              placeholder={reason.placeholder}
              rows={3} className="h-auto resize-y py-2"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="secondary"
            type="button"
            onClick={() => handleOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
