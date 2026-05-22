// ============================================================================
// CUSTOMIZATION — 버튼 색상·아이콘만 이 구역에서 수정
// ============================================================================

const STYLES = {
  container: 'flex items-center gap-1 bg-[#0C0C0D] border border-zinc-800 rounded-lg p-1',
  buttonActive: 'p-1.5 rounded bg-zinc-700 text-white transition-colors',
  buttonInactive: 'p-1.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors',
} as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { MousePointer, Minus, TrendingUp } from 'lucide-react';
import type { DrawingTool } from '../hooks/useDrawingTool';

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
}

interface ToolButton {
  tool: DrawingTool;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const TOOL_BUTTONS: ToolButton[] = [
  { tool: 'cursor', label: '커서', Icon: MousePointer },
  { tool: 'hline', label: '수평선', Icon: Minus },
  { tool: 'trendline', label: '추세선', Icon: TrendingUp },
];

export function DrawingToolbar({ activeTool, onToolChange }: DrawingToolbarProps) {
  return (
    <div className={STYLES.container}>
      {TOOL_BUTTONS.map(({ tool, label, Icon }) => (
        <button
          key={tool}
          onClick={() => onToolChange(tool)}
          className={activeTool === tool ? STYLES.buttonActive : STYLES.buttonInactive}
          aria-label={label}
          aria-pressed={activeTool === tool}
          title={label}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
