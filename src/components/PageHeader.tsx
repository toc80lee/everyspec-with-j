import React from 'react';

interface PageHeaderProps {
  icon: React.FC<{ className?: string }>;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  titleBadge?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Unified top page header shared across all primary workspace views.
 * Pairs the active sidebar icon inside a consistent dark-slate badge with
 * aligned typography, metadata eyebrow, right-aligned actions, and optional sub-toolbar.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  eyebrow,
  titleBadge,
  actions,
  children,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
      <div className={`max-w-7xl mx-auto ${children ? 'space-y-3.5' : ''}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-10 h-10 rounded-xl bg-slate-900 text-blue-400 border border-slate-800/80 shadow-xs flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Icon className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              {eyebrow && (
                <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5 mb-0.5 truncate">
                  {eyebrow}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-tight truncate">
                  {title}
                </h1>
                {titleBadge}
              </div>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {actions && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {actions}
            </div>
          )}
        </div>

        {children}
      </div>
    </header>
  );
};
