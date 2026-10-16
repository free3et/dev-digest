/* useDialogA11y — what the vendored `@devdigest/ui` Modal does not do (it has
   role="dialog" and aria-modal only): accessible name, initial focus, Tab
   trap, Escape, focus return. Shared by EvalCaseModal and EvalCompare. App-side
   and ref-based on purpose — the vendor file is not ours to edit (Spec C D-3,
   NFR-5; Spec D C-3). */
"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogA11yOptions {
  /** Any element that contains the Modal's `role="dialog"` node. */
  containerRef: RefObject<HTMLElement | null>;
  /** `id` of the element that names the dialog (its title). */
  labelId: string;
  /** Focus target once `ready`; the dialog itself holds focus until then. */
  initialFocusRef: RefObject<HTMLElement | null>;
  /** The content the initial focus target lives in has rendered. */
  ready: boolean;
  onClose: () => void;
}

function dialogOf(container: HTMLElement | null): HTMLElement | null {
  return container?.querySelector<HTMLElement>('[role="dialog"]') ?? null;
}

export function useDialogA11y({ containerRef, labelId, initialFocusRef, ready, onClose }: DialogA11yOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Name the dialog, remember the opener, and give the opener its focus back.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogOf(containerRef.current)?.setAttribute("aria-labelledby", labelId);
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [containerRef, labelId]);

  // Initial focus: the dialog while loading, the Name field once rendered.
  useEffect(() => {
    const dialog = dialogOf(containerRef.current);
    if (ready && initialFocusRef.current) {
      initialFocusRef.current.focus();
    } else if (dialog) {
      dialog.tabIndex = -1;
      dialog.focus();
    }
  }, [containerRef, initialFocusRef, ready]);

  // Escape closes; Tab and Shift+Tab wrap inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogOf(containerRef.current);
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const active = document.activeElement;
      if (!dialog.contains(active) || active === dialog) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [containerRef]);
}
