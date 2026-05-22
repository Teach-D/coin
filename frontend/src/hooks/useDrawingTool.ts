import { useState } from 'react';

export type DrawingTool = 'cursor' | 'hline' | 'trendline';

export function useDrawingTool() {
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');

  return { activeTool, setActiveTool };
}
