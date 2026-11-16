import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export interface InspectableOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

interface InspectableSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  isReadOnly?: boolean;
  children?: React.ReactNode;
  readOnlyHint?: string;
}

function extractNodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractNodeText(node.props.children);
  }
  return '';
}

interface SelectChildProps {
  children?: React.ReactNode;
  value?: string | number;
  disabled?: boolean;
  label?: string;
}

function collectOptionsFromChildren(children: React.ReactNode, group?: string): InspectableOption[] {
  const result: InspectableOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<SelectChildProps>(child)) return;
    if (child.type === 'option') {
      const label = extractNodeText(child.props.children).trim();
      const val =
        child.props.value !== undefined && child.props.value !== null
          ? String(child.props.value)
          : label;
      result.push({
        value: val,
        label: label || val,
        disabled: Boolean(child.props.disabled),
        group,
      });
    } else if (child.type === 'optgroup') {
      const grpLabel = String(child.props.label || '');
      result.push(...collectOptionsFromChildren(child.props.children, grpLabel));
    } else if (child.props.children) {
      result.push(...collectOptionsFromChildren(child.props.children, group));
    }
  });
  return result;
}

export const InspectableSelect: React.FC<InspectableSelectProps> = ({
  isReadOnly = false,
  disabled,
  value,
  onChange,
  children,
  className = '',
  title,
  readOnlyHint,
  ...rest
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
    openUpward: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => collectOptionsFromChildren(children), [children]);
  const stringValue = value !== undefined && value !== null ? String(value) : '';
  const selectedOption = options.find((opt) => opt.value === stringValue);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!listboxRef.current || !listboxRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    const handleScroll = (e: Event) => {
      if (listboxRef.current && listboxRef.current.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedHeight = Math.min(260, options.length * 30 + 36);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
      const minWidth = Math.max(rect.width, 160);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(260, minWidth) - 12));
      const top = openUpward ? rect.top - 4 : rect.bottom + 4;
      setMenuPos({ top, left, minWidth, openUpward });
    }
    setIsOpen(true);
  };

  if (!isReadOnly) {
    return (
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={className}
        title={title}
        {...rest}
      >
        {children}
      </select>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleOpen}
        title={title || readOnlyHint || t('Inspect options (read-only)', '옵션 보기 (읽기 전용)')}
        aria-label={rest['aria-label'] || title || t('Inspect options (read-only)', '옵션 보기 (읽기 전용)')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`${className} flex items-center justify-between gap-1.5 text-left cursor-pointer`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : stringValue || '-'}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && menuPos && (
        <div
          ref={listboxRef}
          role="listbox"
          aria-label={rest['aria-label'] || title || t('Options (read-only)', '옵션 목록 (읽기 전용)')}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            minWidth: menuPos.minWidth,
            maxWidth: 280,
            transform: menuPos.openUpward ? 'translateY(-100%)' : undefined,
          }}
          className="z-50 bg-white border border-slate-300 rounded-lg shadow-xl max-h-60 overflow-y-auto py-1 text-xs"
        >
          <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border-b border-slate-200 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
            <span>{t('Read-only · Inspect only', '읽기 전용 · 조회만 가능')}</span>
          </div>
          {options.map((opt, idx) => {
            const isSelected = opt.value === stringValue;
            const prevGroup = idx > 0 ? options[idx - 1].group : undefined;
            const showGroupHeader = opt.group && opt.group !== prevGroup;
            return (
              <React.Fragment key={`${opt.value}-${idx}`}>
                {showGroupHeader && (
                  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                    {opt.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setIsOpen(false)}
                  className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  } ${opt.disabled ? 'opacity-50' : ''}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
