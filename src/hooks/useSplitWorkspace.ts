import { useCallback, useEffect, useRef, useState } from 'react';
import type { DualSplitLayout } from '../components/TopNav';

export const DUAL_SPLIT_CYCLE: DualSplitLayout[] = [
  'top-bottom',
  'left-right',
  'bottom-top',
  'right-left',
];

const SPLIT_LAYOUT_LABELS: Record<DualSplitLayout, string> = {
  'top-bottom': 'Top / Bottom',
  'left-right': 'Left / Right',
  'bottom-top': 'Bottom / Top',
  'right-left': 'Right / Left',
};

export function useSplitWorkspace(onNotify?: (message: string) => void) {
  const [splitLayout, setSplitLayout] = useState<DualSplitLayout>(() => {
    try {
      const saved = localStorage.getItem('sap_spec_dual_split_layout') as DualSplitLayout;
      if (DUAL_SPLIT_CYCLE.includes(saved)) return saved;
    } catch {
      // ignore
    }
    return 'left-right';
  });

  const isVerticalSplit = splitLayout === 'top-bottom' || splitLayout === 'bottom-top';
  const isReversedSplit = splitLayout === 'bottom-top' || splitLayout === 'right-left';

  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('sap_spec_dual_split_ratio'));
      if (!isNaN(saved) && saved >= 20 && saved <= 80) return saved;
    } catch {
      // ignore
    }
    return 50;
  });

  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const splitRatioRef = useRef<number>(splitRatio);
  splitRatioRef.current = splitRatio;

  useEffect(() => {
    if (!isResizingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      let nextRatio = 50;
      if (!isVerticalSplit) {
        if (rect.width <= 0) return;
        nextRatio = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        if (rect.height <= 0) return;
        nextRatio = ((e.clientY - rect.top) / rect.height) * 100;
      }
      const clamped = Math.min(80, Math.max(20, Math.round(nextRatio * 10) / 10));
      splitRatioRef.current = clamped;
      setSplitRatio(clamped);
    };

    const handleMouseUp = () => {
      setIsResizingSplit(false);
      document.body.style.cursor = '';
      try {
        localStorage.setItem('sap_spec_dual_split_ratio', String(splitRatioRef.current));
      } catch {
        // ignore
      }
    };

    document.body.style.cursor = !isVerticalSplit ? 'col-resize' : 'row-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSplit, isVerticalSplit]);

  const cycleSplitLayout = useCallback(() => {
    setSplitLayout((prev) => {
      const idx = DUAL_SPLIT_CYCLE.indexOf(prev);
      const next = DUAL_SPLIT_CYCLE[(idx + 1) % DUAL_SPLIT_CYCLE.length];
      try {
        localStorage.setItem('sap_spec_dual_split_layout', next);
      } catch {
        // ignore
      }
      onNotify?.(`Split layout: ${SPLIT_LAYOUT_LABELS[next]}`);
      return next;
    });
  }, [onNotify]);

  const resetSplitRatio = useCallback(() => {
    setSplitRatio(50);
    splitRatioRef.current = 50;
    try {
      localStorage.setItem('sap_spec_dual_split_ratio', '50');
    } catch {
      // ignore
    }
    onNotify?.('Split ratio reset to 50% : 50%.');
  }, [onNotify]);

  return {
    splitLayout,
    setSplitLayout,
    splitRatio,
    setSplitRatio,
    splitRatioRef,
    isResizingSplit,
    setIsResizingSplit,
    splitContainerRef,
    isVerticalSplit,
    isReversedSplit,
    cycleSplitLayout,
    resetSplitRatio,
  };
}
