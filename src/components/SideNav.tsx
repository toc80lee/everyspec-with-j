import React, { useState } from 'react';
import {
  LayoutDashboard,
  List,
  MessageSquareText,
  FolderKanban,
  SplitSquareVertical,
  Search,
  Keyboard,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { MainWorkspaceMode } from './TopNav';
import { ProgramSpec } from '../types/sap';

const SIDENAV_EXPANDED_KEY = 'everyspec_sidenav_expanded_v1';

interface SideNavProps {
  currentMode: MainWorkspaceMode;
  onSelectMode: (mode: MainWorkspaceMode) => void;
  onOpenProjectSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenCommandPalette: () => void;
  currentSpec: ProgramSpec;
}

interface NavItemConfig {
  id: string;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
  isActive: boolean;
  onClick: () => void;
  shortcut?: string;
}

export const SideNav: React.FC<SideNavProps> = ({
  currentMode,
  onSelectMode,
  onOpenProjectSettings,
  onOpenShortcuts,
  onOpenCommandPalette,
  currentSpec,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDENAV_EXPANDED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDENAV_EXPANDED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const isInSpecWorkspace =
    currentMode === 'split' ||
    currentMode === 'mockup_only' ||
    currentMode === 'editor_only' ||
    currentMode === 'abap_code' ||
    currentMode === 'document';

  const primaryItems: NavItemConfig[] = [
    {
      id: 'overview',
      label: 'Dashboard',
      shortDesc: 'Project overview & metrics',
      icon: LayoutDashboard,
      isActive: currentMode === 'overview',
      onClick: () => onSelectMode('overview'),
    },
    {
      id: 'program_list',
      label: 'Programs',
      shortDesc: 'Program specification catalog',
      icon: List,
      isActive: currentMode === 'program_list',
      onClick: () => onSelectMode('program_list'),
    },
    {
      id: 'meeting_minutes',
      label: 'Meetings',
      shortDesc: 'Meeting minutes & AI spec wizard',
      icon: MessageSquareText,
      isActive: currentMode === 'meeting_minutes' || currentMode === 'meeting_wizard',
      onClick: () => onSelectMode('meeting_minutes'),
    },
    {
      id: 'project_settings',
      label: 'Project Settings',
      shortDesc: 'Project & ABAP standards',
      icon: FolderKanban,
      isActive: currentMode === 'project_settings',
      onClick: onOpenProjectSettings,
    },
  ];

  const workspaceItem: NavItemConfig = {
    id: 'spec_workspace',
    label: `Workspace · ${currentSpec.program_id}`,
    shortDesc: currentSpec.title || 'Active specification workspace',
    icon: SplitSquareVertical,
    isActive: isInSpecWorkspace,
    onClick: () => {
      if (!isInSpecWorkspace) {
        onSelectMode('split');
      }
    },
    shortcut: 'Alt+1',
  };

  const renderTooltip = (label: string, shortcut?: string) => {
    if (isExpanded) return null;
    return (
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 px-2.5 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-white text-xs font-medium whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 flex items-center gap-2"
      >
        <span>{label}</span>
        {shortcut && (
          <kbd className="font-mono text-[10px] text-slate-300 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700">
            {shortcut}
          </kbd>
        )}
      </span>
    );
  };

  return (
    <aside
      aria-label="Primary Sidebar Navigation"
      className={`no-print shrink-0 h-full bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col select-none z-30 ${
        isExpanded ? 'w-52' : 'w-[60px]'
      }`}
    >
      {/* Brand Header */}
      <div
        className={`h-12 shrink-0 border-b border-slate-800 flex items-center ${
          isExpanded ? 'px-3 justify-start' : 'px-2 justify-center'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectMode('overview')}
          aria-label="EverySpec Dashboard"
          className={`group relative flex items-center gap-2.5 rounded-lg transition-colors duration-150 cursor-pointer focus-visible:outline-none ${
            isExpanded ? 'w-full px-1.5 py-1.5 hover:bg-slate-800/80' : 'p-1 hover:bg-slate-800/80'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-white p-0.5 flex items-center justify-center border border-slate-700 overflow-hidden shrink-0">
            <img
              src="/assets/aistudio/Logo_436f33a7.png"
              alt="EverySpec Logo"
              className="w-full h-full object-contain"
            />
          </div>
          {isExpanded && (
            <span className="font-bold text-sm tracking-tight text-white whitespace-nowrap truncate">
              EverySpec
            </span>
          )}
          {renderTooltip('EverySpec Dashboard')}
        </button>
      </div>

      {/* Primary Functional Navigation */}
      <nav className="flex-1 flex flex-col py-3 px-2 gap-1 overflow-visible">
        <div className="flex flex-col gap-1">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                aria-label={item.label}
                aria-current={item.isActive ? 'page' : undefined}
                className={`group relative h-10 flex items-center rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                  isExpanded ? 'px-3 gap-3 justify-start' : 'w-10 mx-auto justify-center'
                } ${
                  item.isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {isExpanded && <span className="truncate">{item.label}</span>}
                {renderTooltip(item.label, item.shortcut)}
              </button>
            );
          })}
        </div>

        {/* Hairline Separator */}
        <div className={`h-px bg-slate-800 my-2 ${isExpanded ? 'mx-1' : 'mx-2'}`} />

        {/* Active Spec Workspace Shortcut */}
        <button
          type="button"
          onClick={workspaceItem.onClick}
          aria-label={workspaceItem.label}
          aria-current={workspaceItem.isActive ? 'page' : undefined}
          className={`group relative h-10 flex items-center rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
            isExpanded ? 'px-3 gap-3 justify-start' : 'w-10 mx-auto justify-center'
          } ${
            workspaceItem.isActive
              ? 'bg-blue-600 text-white font-semibold shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <SplitSquareVertical className="w-[18px] h-[18px] shrink-0" />
          {isExpanded && (
            <span className="truncate font-mono text-[11px]">
              {currentSpec.program_id}
            </span>
          )}
          {renderTooltip(workspaceItem.label, workspaceItem.shortcut)}
        </button>
      </nav>

      {/* Bottom Utility Actions */}
      <div className="py-3 px-2 border-t border-slate-800 flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Search (Ctrl+K)"
          className={`group relative h-10 flex items-center rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
            isExpanded ? 'px-3 gap-3 justify-between' : 'w-10 mx-auto justify-center'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <Search className="w-[18px] h-[18px] shrink-0" />
            {isExpanded && <span className="truncate">Search</span>}
          </span>
          {isExpanded && (
            <kbd className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
              Ctrl+K
            </kbd>
          )}
          {renderTooltip('Search', 'Ctrl+K')}
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="Shortcuts (?)"
          aria-current={currentMode === 'shortcuts' ? 'page' : undefined}
          className={`group relative h-10 flex items-center rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
            isExpanded ? 'px-3 gap-3 justify-between' : 'w-10 mx-auto justify-center'
          } ${
            currentMode === 'shortcuts'
              ? 'bg-blue-600 text-white font-semibold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <Keyboard className="w-[18px] h-[18px] shrink-0" />
            {isExpanded && <span className="truncate">Shortcuts</span>}
          </span>
          {isExpanded && (
            <kbd className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
              ?
            </kbd>
          )}
          {renderTooltip('Shortcuts', '?')}
        </button>

        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={isExpanded}
          className={`group relative h-10 flex items-center rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
            isExpanded ? 'px-3 gap-3 justify-start' : 'w-10 mx-auto justify-center'
          }`}
        >
          {isExpanded ? (
            <>
              <PanelLeftClose className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate">Collapse</span>
            </>
          ) : (
            <PanelLeftOpen className="w-[18px] h-[18px] shrink-0" />
          )}
          {renderTooltip(isExpanded ? 'Collapse Sidebar' : 'Expand Sidebar')}
        </button>
      </div>
    </aside>
  );
};
