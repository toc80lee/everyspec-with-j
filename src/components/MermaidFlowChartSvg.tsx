import React, { useMemo } from 'react';
import { ProgramSpec } from '../types/sap';
import { useLanguage } from '../contexts/LanguageContext';

export interface ParsedMermaidNode {
  id: string;
  label: string;
  shape: 'rect' | 'diamond' | 'stadium' | 'cylinder' | 'circle' | 'round' | 'trapezoid';
  rawText: string;
}

export interface ParsedMermaidEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  style?: 'normal' | 'dotted' | 'thick';
}

export interface LayoutedNode extends ParsedMermaidNode {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

export const MERMAID_TEMPLATES = {
  basic_condition: {
    name: 'Basic Branching',
    code: `graph TD;
  A[Start] --> B{Condition};
  B -->|Yes| C[Process Task];
  B -->|No| D[Alternative Task];
  C --> E[End];
  D --> E;`,
    node_details: {
      A: {
        label: 'Start',
        markdown: `### Start (Program Start)
- Program entry point
- Initialize parameters and system variables (\`SY-REPID\`, \`SY-UNAME\`)
- Prepare screen titlebar and GUI status`,
      },
      B: {
        label: 'Condition',
        markdown: `### Condition (Input Check & Validation)
- Validate Selection Screen parameters
- Check mandatory inputs (Company Code, Document Date, etc.)
- Raise error message (\`TYPE 'E'\`) and focus field on failure`,
      },
      C: {
        label: 'Process Task',
        markdown: `### Process Task (Main Processing)
- Query source DB tables (\`VBAK\`, \`VBAP\`)
- Build internal table (\`GT_DATA\`) and run business calculations
- Compute traffic lights (\`LIGHTS\`) and currency totals`,
      },
      D: {
        label: 'Alternative Task',
        markdown: `### Alternative Task (Error Handling)
- Handle fallback or exception cases
- Log errors (\`GT_ERROR\`) and trigger warning messages`,
      },
      E: {
        label: 'End',
        markdown: `### End (Display & Screen End)
- Instantiate ALV Grid on Screen \`0100 PBO\` and bind data
- Handle user commands (\`PAI\`) and exit cleanly`,
      },
    },
  },

  sample_01_standard: {
    name: 'Sample Type 01: SAP Standard 10-Step Flow',
    code: `graph TD;
  A([1. Start / INITIALIZATION]) --> B[/2. Selection / SELECTION-SCREEN/];
  B --> C{3. Input Validation};
  C -->|Error| B;
  C -->|Valid| D[4. START-OF-SELECTION];
  D --> E[(5. Extract Data / SELECT)];
  E --> F[6. Business Logic / CALCULATE];
  F --> G[7. ALV Grid Output / 0100 PBO];
  G --> H{8. User Command / PAI};
  H -->|Double Click / Hotspot| I[9. Document Drilldown / VA03];
  H -->|Excel / Print| J[9-1. Export Data];
  H -->|Exit / F3| K([10. Exit / LEAVE TO SCREEN 0]);
  I --> G;
  J --> G;`,
    node_details: {
      A: {
        label: '1. Start / INITIALIZATION',
        markdown: `### 1. INITIALIZATION
- Executed once on program launch
- Set default Selection Screen date range (1st of month to today)
- Prepare \`AUTHORITY-CHECK\` object checks`,
      },
      B: {
        label: '2. Selection / SELECTION-SCREEN',
        markdown: `### 2. AT SELECTION-SCREEN OUTPUT
- Selection Screen PBO event
- Dynamically toggle field attributes (\`SCREEN-ACTIVE\`, \`SCREEN-INPUT\`)
- Control field enablement based on radio buttons and checkboxes`,
      },
      C: {
        label: '3. Input Validation',
        markdown: `### 3. AT SELECTION-SCREEN (PAI)
- Validate mandatory input parameters
- Verify master existence for document and company code (\`T001\`, \`VBAK\`)
- Display \`MESSAGE E001\` and move cursor to invalid field`,
      },
      D: {
        label: '4. START-OF-SELECTION',
        markdown: `### 4. START-OF-SELECTION
- Enter main data processing upon Execute (F8)
- Display progress indicator (\`SAPGUI_PROGRESS_INDICATOR\`)`,
      },
      E: {
        label: '5. Extract Data / SELECT',
        markdown: `### 5. Data Extraction
- Join \`VBAK\` (Sales Header) and \`VBAP\` (Sales Item)
- Fetch customer name from \`KNA1\`
- Load into \`INTO CORRESPONDING FIELDS OF TABLE gt_data\``,
      },
      F: {
        label: '6. Business Logic / CALCULATE',
        markdown: `### 6. Business Calculation
- Convert currency amounts and compute subtotals
- Derive status lights (\`LIGHTS\`: 1 Green, 2 Yellow, 3 Red)
- Populate ALV style (\`LVC_T_STYL\`) and color (\`LVC_T_SCOL\`) tables`,
      },
      G: {
        label: '7. ALV Grid Output / 0100 PBO',
        markdown: `### 7. Display Main Screen (Screen 0100 PBO)
- Create \`CL_GUI_CUSTOM_CONTAINER\` instance
- Instantiate \`CL_GUI_ALV_GRID\` control
- Bind Field Catalog (\`LVC_T_FCAT\`) and Layout (\`LVC_S_LAYO\`)
- Call \`SET_TABLE_FOR_FIRST_DISPLAY\``,
      },
      H: {
        label: '8. User Command / PAI',
        markdown: `### 8. USER COMMAND Handling (Screen 0100 PAI)
- Dispatch actions by OK code (\`GV_OK_CODE\`)
- Handle toolbar buttons, double-click, and hotspot events`,
      },
      I: {
        label: '9. Document Drilldown / VA03',
        markdown: `### 9. Drilldown to Transaction
- Store clicked \`VBELN\` in memory (\`SET PARAMETER ID 'AUN'\`)
- Call \`CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN\`
- Refresh ALV grid safely on return (\`REFRESH_TABLE_DISPLAY\`)`,
      },
      J: {
        label: '9-1. Export Data',
        markdown: `### 9-1. Excel / Print Export
- Trigger standard ALV Excel export (\`&XXL\`)
- Connect print form output`,
      },
      K: {
        label: '10. Exit / LEAVE TO SCREEN 0',
        markdown: `### 10. Program Exit
- Release screen & container resources on F3 / Shift+F3 / F12
- Exit screen (\`LEAVE TO SCREEN 0\`)`,
      },
    },
  },

  sample_02_master_detail: {
    name: 'Sample Type 02: Master-Detail 2-Grid Flow',
    code: `graph TD;
  A([1. Start / INITIALIZATION]) --> B[/2. Input Filters / SELECTION-SCREEN/];
  B --> C{3. Validate Inputs};
  C -->|Error| B;
  C -->|Valid| D[(4. Query Header / VBAK)];
  D --> E[5. Bind Top Header ALV / 0100];
  E --> F{6. Header Row Selection};
  F -->|Row Click| G[(7. Query Items / VBAP)];
  G --> H[8. Refresh Bottom Item ALV / 0110];
  H --> I{9. User Command};
  I -->|Save / Update| J[10. BAPI Document Update];
  I -->|Exit| K([11. Exit Program]);
  J --> E;`,
    node_details: {
      A: {
        label: '1. Start / INITIALIZATION',
        markdown: `### Master-Detail Initialization
- Initialize startup variables and \`CL_GUI_SPLITTER_CONTAINER\` layout`,
      },
      B: {
        label: '2. Input Filters / SELECTION-SCREEN',
        markdown: `### 2. Selection Screen
- Enter header query criteria (Company Code, Sales Org, Date Range)`,
      },
      C: {
        label: '3. Validate Inputs',
        markdown: `### 3. Input Validation
- Check mandatory fields and raise validation errors if missing`,
      },
      D: {
        label: '4. Query Header / VBAK',
        markdown: `### Header Data Extraction
- Select matching records from \`VBAK\`
- Store results in internal table \`GT_0100\``,
      },
      E: {
        label: '5. Bind Top Header ALV / 0100',
        markdown: `### Header ALV Binding
- Bind Header ALV Grid to splitter container top pane (Row 1)`,
      },
      F: {
        label: '6. Header Row Selection',
        markdown: `### Row Selection Event
- Capture \`HANDLE_DOUBLE_CLICK\` or \`HOTSPOT_CLICK\` on header row
- Extract selected \`VBELN\``,
      },
      G: {
        label: '7. Query Items / VBAP',
        markdown: `### Item Data Extraction
- Select line items from \`VBAP\` for the selected \`VBELN\`
- Calculate item pricing, quantity, and net value into \`GT_0110\``,
      },
      H: {
        label: '8. Refresh Bottom Item ALV / 0110',
        markdown: `### Item ALV Refresh
- Bind item rows to splitter container bottom pane (Row 2) and refresh`,
      },
      I: {
        label: '9. User Command',
        markdown: `### 9. User Command
- Dispatch save, change, and print actions`,
      },
      J: {
        label: '10. BAPI Document Update',
        markdown: `### 10. BAPI Transaction
- Post modified items via \`BAPI_SALESORDER_CHANGE\``,
      },
      K: {
        label: '11. Exit Program',
        markdown: `### 11. Exit
- Free UI controls and memory before exit`,
      },
    },
  },

  sample_04_cds_pivot: {
    name: 'Sample Type 04: CDS View / Pivot Flow',
    code: `graph TD;
  A([1. Start / INITIALIZATION]) --> B[/2. Analysis Filters / SELECTION-SCREEN/];
  B --> C[(3. Query CDS View / ACDOCA)];
  C --> D[4. Pivot Aggregation & Subtotals];
  D --> E[5. Display Pivot ALV / 0100];
  E --> F{6. User Interaction};
  F -->|Slice / Filter| D;
  F -->|Export Excel| G[7. Generate Report File];
  F -->|Exit| H([8. Exit]);`,
    node_details: {
      A: {
        label: '1. Start / INITIALIZATION',
        markdown: `### Pivot Initialization
- Initialize default analysis period and dimension fields`,
      },
      B: {
        label: '2. Analysis Filters / SELECTION-SCREEN',
        markdown: `### Analysis Criteria Input
- Enter Fiscal Year, Period, Company Code, and Cost Center range`,
      },
      C: {
        label: '3. Query CDS View / ACDOCA',
        markdown: `### CDS View / Table Query
- High-speed in-memory query via \`ACDOCA\` or CDS View`,
      },
      D: {
        label: '4. Pivot Aggregation & Subtotals',
        markdown: `### Multi-Dimensional Aggregation
- Aggregate measures by Period, G/L Account, and Cost Center`,
      },
      E: {
        label: '5. Display Pivot ALV / 0100',
        markdown: `### Pivot Grid Display
- Render hierarchical subtotals and sorting in ALV Grid`,
      },
      F: {
        label: '6. User Interaction',
        markdown: `### Dynamic Slicer Update
- Recompute subtotals on dimension or filter change`,
      },
      G: {
        label: '7. Generate Report File',
        markdown: `### Excel Report Download
- Export pivot summary to Excel format`,
      },
      H: {
        label: '8. Exit',
        markdown: `### Exit
- Release memory and exit program`,
      },
    },
  },
};

/**
 * Returns effective Mermaid Code and Node Details for any ProgramSpec
 */
export function getEffectiveDataFlow(spec: ProgramSpec): {
  mermaidCode: string;
  nodeDetails: Record<string, { label?: string; markdown: string }>;
} {
  const config = spec.data_flow;
  let code = config?.mermaid_code?.trim();
  let details = config?.node_details;

  if (!code) {
    if (spec.sample_type === '02') {
      code = MERMAID_TEMPLATES.sample_02_master_detail.code;
      if (!details) details = MERMAID_TEMPLATES.sample_02_master_detail.node_details;
    } else if (spec.sample_type === '04') {
      code = MERMAID_TEMPLATES.sample_04_cds_pivot.code;
      if (!details) details = MERMAID_TEMPLATES.sample_04_cds_pivot.node_details;
    } else {
      code = MERMAID_TEMPLATES.sample_01_standard.code;
      if (!details) details = MERMAID_TEMPLATES.sample_01_standard.node_details;
    }
  }

  if (!details) {
    if (spec.sample_type === '02') {
      details = MERMAID_TEMPLATES.sample_02_master_detail.node_details;
    } else if (spec.sample_type === '04') {
      details = MERMAID_TEMPLATES.sample_04_cds_pivot.node_details;
    } else {
      details = MERMAID_TEMPLATES.basic_condition.node_details;
    }
  }

  return {
    mermaidCode: code,
    nodeDetails: details as Record<string, { label?: string; markdown: string }>,
  };
}

/**
 * Robust Mermaid Flowchart parser supporting:
 * - Direction (TD, TB, LR, RL)
 * - Standard nodes: A[Rect], A(Round), A([Stadium]), A{Diamond}, A[(Cylinder)], A[/Trapezoid/]
 * - Arrow connections: -->, -.->, ==>, -->|Label|, -- Label -->
 */
export function parseMermaidCode(code: string): {
  nodes: ParsedMermaidNode[];
  edges: ParsedMermaidEdge[];
  direction: 'TD' | 'LR';
} {
  const nodesMap = new Map<string, ParsedMermaidNode>();
  const edges: ParsedMermaidEdge[] = [];
  let direction: 'TD' | 'LR' = 'TD';

  const clean = code.trim();
  const firstLine = clean.split('\n')[0] || '';
  if (firstLine.includes('LR') || firstLine.includes('RL')) {
    direction = 'LR';
  }

  const extractNodeInfo = (
    token: string
  ): { id: string; label: string; shape: ParsedMermaidNode['shape'] } | null => {
    const s = token.trim();
    if (!s) return null;

    // Cylinder: A[(label)]
    const cylMatch = s.match(/^([A-Za-z0-9_\-]+)\[\((.*?)\)\]$/);
    if (cylMatch) {
      return { id: cylMatch[1], label: cylMatch[2].trim(), shape: 'cylinder' };
    }

    // Stadium: A([label])
    const stadiumMatch = s.match(/^([A-Za-z0-9_\-]+)\(\[(.*?)\]\)$/);
    if (stadiumMatch) {
      return { id: stadiumMatch[1], label: stadiumMatch[2].trim(), shape: 'stadium' };
    }

    // Circle: A((label))
    const circleMatch = s.match(/^([A-Za-z0-9_\-]+)\(\((.*?)\)\)$/);
    if (circleMatch) {
      return { id: circleMatch[1], label: circleMatch[2].trim(), shape: 'circle' };
    }

    // Diamond: A{label}
    const diamondMatch = s.match(/^([A-Za-z0-9_\-]+)\{(.*?)\}$/);
    if (diamondMatch) {
      return { id: diamondMatch[1], label: diamondMatch[2].trim(), shape: 'diamond' };
    }

    // Trapezoid / Parallelogram: A[/label/]
    const trapMatch = s.match(/^([A-Za-z0-9_\-]+)\[\/(.*?)\/\]$/);
    if (trapMatch) {
      return { id: trapMatch[1], label: trapMatch[2].trim(), shape: 'trapezoid' };
    }

    // Rounded: A(label)
    const roundMatch = s.match(/^([A-Za-z0-9_\-]+)\((.*?)\)$/);
    if (roundMatch) {
      return { id: roundMatch[1], label: roundMatch[2].trim(), shape: 'round' };
    }

    // Rect: A[label]
    const rectMatch = s.match(/^([A-Za-z0-9_\-]+)\[(.*?)\]$/);
    if (rectMatch) {
      return { id: rectMatch[1], label: rectMatch[2].trim(), shape: 'rect' };
    }

    // Simple ID without bracket: A
    const simpleMatch = s.match(/^([A-Za-z0-9_\-]+)$/);
    if (simpleMatch) {
      return { id: simpleMatch[1], label: simpleMatch[1], shape: 'rect' };
    }

    return null;
  };

  const registerNode = (nodeInfo: {
    id: string;
    label: string;
    shape: ParsedMermaidNode['shape'];
  }) => {
    const existing = nodesMap.get(nodeInfo.id);
    if (!existing) {
      nodesMap.set(nodeInfo.id, {
        id: nodeInfo.id,
        label: nodeInfo.label || nodeInfo.id,
        shape: nodeInfo.shape,
        rawText: `${nodeInfo.id}[${nodeInfo.label}]`,
      });
    } else {
      if (nodeInfo.label && nodeInfo.label !== nodeInfo.id) {
        existing.label = nodeInfo.label;
      }
      if (nodeInfo.shape !== 'rect') {
        existing.shape = nodeInfo.shape;
      }
    }
  };

  const statements = clean
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !s.startsWith('graph') &&
        !s.startsWith('flowchart') &&
        !s.startsWith('%%')
    );

  let edgeCounter = 1;

  for (const stmt of statements) {
    const edgeRegex = /(.*?)(-->\|(.*?)\||\-\-(.*?)\-\->|==>|\-\.\->|-->)(.*)/;
    const match = stmt.match(edgeRegex);

    if (match) {
      const leftPart = match[1].trim();
      const edgeSymbol = match[2];
      const pipeLabel = match[3];
      const midLabel = match[4];
      const rightPart = match[5].trim();

      const edgeLabel = (pipeLabel || midLabel || '').trim();
      const isDotted = edgeSymbol.includes('-.');
      const isThick = edgeSymbol.includes('==');

      const leftNode = extractNodeInfo(leftPart);
      const rightNode = extractNodeInfo(rightPart);

      if (leftNode) registerNode(leftNode);
      if (rightNode) registerNode(rightNode);

      if (leftNode && rightNode) {
        edges.push({
          id: `e-${edgeCounter++}`,
          from: leftNode.id,
          to: rightNode.id,
          label: edgeLabel || undefined,
          style: isDotted ? 'dotted' : isThick ? 'thick' : 'normal',
        });
      }
    } else {
      const singleNode = extractNodeInfo(stmt);
      if (singleNode) {
        registerNode(singleNode);
      }
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    direction,
  };
}

/**
 * Calculates neat layout coordinates for Mermaid nodes
 */
export function layoutMermaidDiagram(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  direction: 'TD' | 'LR' = 'TD'
): LayoutedNode[] {
  if (nodes.length === 0) return [];

  // Map node ID to index of first appearance in the Mermaid statements
  const nodeIndex = new Map<string, number>();
  nodes.forEach((n, idx) => nodeIndex.set(n.id, idx));

  // Identify back-edges: edges that loop backward (or cause cycles)
  // In SAP / Mermaid workflows, nodes are authored in chronological sequence.
  // Any edge pointing backwards in appearance order (or creating a cycle) is a loop-back edge.
  const backEdgeIds = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(u: string) {
    visiting.add(u);
    const outEdges = edges.filter((e) => e.from === u);
    for (const e of outEdges) {
      const v = e.to;
      const uIdx = nodeIndex.get(u) ?? 0;
      const vIdx = nodeIndex.get(v) ?? 0;

      if (vIdx <= uIdx || visiting.has(v)) {
        backEdgeIds.add(e.id);
      } else if (!visited.has(v)) {
        dfs(v);
      }
    }
    visiting.delete(u);
    visited.add(u);
  }

  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      dfs(n.id);
    }
  });

  // Build DAG using strictly forward edges to assign clean, uniform downward layers
  const forwardEdges = edges.filter((e) => !backEdgeIds.has(e.id));
  const incomingForward: Record<string, string[]> = {};
  const outgoingForward: Record<string, string[]> = {};
  nodes.forEach((n) => {
    incomingForward[n.id] = [];
    outgoingForward[n.id] = [];
  });

  forwardEdges.forEach((e) => {
    if (incomingForward[e.to]) incomingForward[e.to].push(e.from);
    if (outgoingForward[e.from]) outgoingForward[e.from].push(e.to);
  });

  // Topological / BFS longest-path on forward DAG
  const inDegree: Record<string, number> = {};
  const nodeLayers: Record<string, number> = {};
  nodes.forEach((n) => {
    inDegree[n.id] = (incomingForward[n.id] || []).length;
    nodeLayers[n.id] = 0;
  });

  const queue: string[] = [];
  nodes.forEach((n) => {
    if (inDegree[n.id] === 0) {
      queue.push(n.id);
      nodeLayers[n.id] = 0;
    }
  });

  while (queue.length > 0) {
    const currId = queue.shift()!;
    const currLayer = nodeLayers[currId] || 0;
    const children = outgoingForward[currId] || [];

    for (const childId of children) {
      nodeLayers[childId] = Math.max(nodeLayers[childId] || 0, currLayer + 1);
      inDegree[childId]--;
      if (inDegree[childId] === 0) {
        queue.push(childId);
      }
    }
  }

  // Handle any nodes not reached by forward roots
  nodes.forEach((n) => {
    if (nodeLayers[n.id] === undefined) {
      nodeLayers[n.id] = 0;
    }
  });

  // Group nodes by layer
  const layersMap: Record<number, ParsedMermaidNode[]> = {};
  nodes.forEach((n) => {
    const l = nodeLayers[n.id];
    if (!layersMap[l]) layersMap[l] = [];
    layersMap[l].push(n);
  });

  const layerIndices = Object.keys(layersMap)
    .map(Number)
    .sort((a, b) => a - b);

  // Compact dimensions per RFQ v1.24 + event-label 1.5x vertical spacing per RFQ v1.25
  const isTD = direction === 'TD';
  const nodeW = 160;
  const standardNodeH = 38; // Compact node height
  const gapX = 32; // Horizontal gap between sibling nodes
  const layerStepY = 70; // Standard uniform vertical pitch between layers
  const labeledLayerStepY = Math.round(layerStepY * 1.5); // 1.5x vertical pitch when arrows carry event text
  const topPadding = 24;
  const sidePadding = 75; // Margin for side-loop curves

  const getNodeDimensions = (node: ParsedMermaidNode): { w: number; h: number } => {
    if (node.shape === 'diamond') {
      return { w: 160, h: 44 };
    }
    if (node.shape === 'cylinder') {
      return { w: 160, h: 42 };
    }
    if (node.shape === 'stadium' || node.shape === 'circle') {
      return { w: 164, h: 36 };
    }
    return { w: nodeW, h: standardNodeH };
  };

  let maxLayerBreadth = 0;
  layerIndices.forEach((l) => {
    const lNodes = layersMap[l];
    const totalW =
      lNodes.reduce((sum, n) => sum + getNodeDimensions(n).w, 0) +
      Math.max(0, lNodes.length - 1) * gapX;
    if (totalW > maxLayerBreadth) maxLayerBreadth = totalW;
  });

  const totalCanvasWidth = Math.max(660, maxLayerBreadth + sidePadding * 2);

  // Compute cumulative Y centers for each layer:
  // If any forward edge spanning between layer[idx] and layer[idx + 1] has label text,
  // increase the vertical step to 1.5x for comfortable breathing room.
  const layerCenterYMap: Record<number, number> = {};
  layerIndices.forEach((layerIndex, i) => {
    if (i === 0) {
      layerCenterYMap[layerIndex] = topPadding;
      return;
    }
    const prevLayerIndex = layerIndices[i - 1];
    const hasLabeledForwardEdge = forwardEdges.some((e) => {
      if (!e.label || !e.label.trim()) return false;
      const fromLayer = nodeLayers[e.from];
      const toLayer = nodeLayers[e.to];
      return fromLayer <= prevLayerIndex && toLayer >= layerIndex;
    });
    const step = hasLabeledForwardEdge ? labeledLayerStepY : layerStepY;
    layerCenterYMap[layerIndex] = layerCenterYMap[prevLayerIndex] + step;
  });

  const layouted: LayoutedNode[] = [];

  layerIndices.forEach((layerIndex) => {
    const layerNodes = layersMap[layerIndex];
    const dims = layerNodes.map((n) => getNodeDimensions(n));
    const layerBreadth =
      dims.reduce((sum, d) => sum + d.w, 0) + Math.max(0, layerNodes.length - 1) * gapX;
    let cursorX = (totalCanvasWidth - layerBreadth) / 2;
    const layerCenterY = layerCenterYMap[layerIndex] ?? topPadding;

    layerNodes.forEach((node, idx) => {
      const { w, h } = dims[idx];

      const x = isTD
        ? Math.round(cursorX)
        : Math.round(sidePadding + layerIndex * (nodeW + gapX));
      const y = isTD
        ? Math.round(layerCenterY - h / 2)
        : Math.round(topPadding + idx * (standardNodeH + 20));

      cursorX += w + gapX;

      layouted.push({
        ...node,
        x,
        y,
        width: w,
        height: h,
        layer: layerIndex,
      });
    });
  });

  return layouted;
}

interface MermaidFlowChartSvgProps {
  mermaidCode?: string;
  nodeDetails?: Record<string, { label?: string; markdown: string }>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  readOnly?: boolean;
  scale?: number;
  className?: string;
  fitToWidth?: boolean;
}

/**
 * Clean, high-fidelity SVG renderer for Mermaid Flowcharts.
 * Fully compatible with screen display, full-screen modals, and A4 print/PDF exports.
 */
export const MermaidFlowChartSvg: React.FC<MermaidFlowChartSvgProps> = ({
  mermaidCode = '',
  nodeDetails = {},
  selectedNodeId,
  onSelectNode,
  readOnly = false,
  scale = 1,
  className = '',
  fitToWidth = false,
}) => {
  const { t } = useLanguage();
  const parsed = useMemo(() => parseMermaidCode(mermaidCode), [mermaidCode]);
  const layoutedNodes = useMemo(
    () => layoutMermaidDiagram(parsed.nodes, parsed.edges, parsed.direction),
    [parsed]
  );

  const svgBounds = useMemo(() => {
    if (layoutedNodes.length === 0) return { width: 500, height: 300 };
    let maxX = 0;
    let maxY = 0;
    layoutedNodes.forEach((n) => {
      const right = n.x + n.width + 65;
      const bottom = n.y + n.height + 35;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    });
    return {
      width: Math.max(660, maxX),
      height: Math.max(260, maxY),
    };
  }, [layoutedNodes]);

  if (layoutedNodes.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-xs italic">
        {t('Flowchart diagram code is empty.', '흐름도 다이어그램 코드가 비어 있습니다.')}
      </div>
    );
  }

  const markerId = `mermaid-arrow-${readOnly ? 'ro' : 'edit'}`;
  const glowId = `node-glow-${readOnly ? 'ro' : 'edit'}`;

  return (
    <svg
      viewBox={`0 0 ${svgBounds.width} ${svgBounds.height}`}
      width={fitToWidth ? '100%' : svgBounds.width * scale}
      height={fitToWidth ? undefined : svgBounds.height * scale}
      className={`select-none mx-auto block ${className}`}
      style={{
        maxWidth: '100%',
        height: fitToWidth ? 'auto' : undefined,
      }}
    >
      <defs>
        {/* Arrow marker */}
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
        </marker>
        {/* Active node glow filter */}
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Draw Edges */}
      {parsed.edges.map((edge) => {
        const source = layoutedNodes.find((n) => n.id === edge.from);
        const target = layoutedNodes.find((n) => n.id === edge.to);
        if (!source || !target) return null;

        const isSelectedEdge =
          selectedNodeId === edge.from || selectedNodeId === edge.to;

        const isBackEdge = target.layer <= source.layer || target.y <= source.y + 10;

        let pathD = '';
        let labelX = 0;
        let labelY = 0;

        if (isBackEdge) {
          // Backward loop edge: route around the side gracefully without crossing over nodes
          const routeLeft = source.x <= svgBounds.width / 2;

          if (routeLeft) {
            // Route along the left side
            const startX = source.x;
            const startY = source.y + source.height / 2;
            const endX = target.x;
            const endY = target.y + target.height / 2;
            const curveX = Math.min(startX, endX) - 45;

            pathD = `M ${startX} ${startY} C ${curveX} ${startY}, ${curveX} ${endY}, ${endX} ${endY}`;
            labelX = curveX + 4;
            labelY = (startY + endY) / 2;
          } else {
            // Route along the right side
            const startX = source.x + source.width;
            const startY = source.y + source.height / 2;
            const endX = target.x + target.width;
            const endY = target.y + target.height / 2;
            const curveX = Math.max(startX, endX) + 45;

            pathD = `M ${startX} ${startY} C ${curveX} ${startY}, ${curveX} ${endY}, ${endX} ${endY}`;
            labelX = curveX - 4;
            labelY = (startY + endY) / 2;
          }
        } else {
          // Forward edge: flows downward
          const startX = source.x + source.width / 2;
          const startY = source.y + source.height;
          const endX = target.x + target.width / 2;
          const endY = target.y;

          if (Math.abs(startX - endX) < 2) {
            // Perfectly straight vertical line (uniform pitch)
            pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
          } else {
            // Smooth vertical S-curve
            const midY = (startY + endY) / 2;
            pathD = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
          }

          labelX = (startX + endX) / 2;
          labelY = (startY + endY) / 2;
        }

        return (
          <g key={edge.id} className="transition-all">
            <path
              d={pathD}
              fill="none"
              stroke={isSelectedEdge ? '#2563eb' : '#94a3b8'}
              strokeWidth={isSelectedEdge ? 2.2 : 1.5}
              strokeDasharray={edge.style === 'dotted' ? '4 4' : undefined}
              markerEnd={`url(#${markerId})`}
            />

            {/* Edge label badge */}
            {edge.label && (
              <g transform={`translate(${labelX}, ${labelY})`}>
                <rect
                  x={-Math.max(16, edge.label.length * 5)}
                  y="-9"
                  width={Math.max(32, edge.label.length * 10)}
                  height="18"
                  rx="9"
                  fill="#ffffff"
                  stroke={isSelectedEdge ? '#93c5fd' : '#cbd5e1'}
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={isSelectedEdge ? '#1d4ed8' : '#475569'}
                  fontFamily="sans-serif"
                >
                  {edge.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Draw Nodes */}
      {layoutedNodes.map((node) => {
        const isSelected = selectedNodeId === node.id;
        const hasDetail = !!nodeDetails[node.id]?.markdown?.trim();

        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => {
              if (onSelectNode) onSelectNode(node.id);
            }}
            className={onSelectNode ? 'cursor-pointer group' : ''}
            filter={isSelected ? `url(#${glowId})` : undefined}
          >
            {/* Shape rendering */}
            {node.shape === 'diamond' ? (
              // Diamond (Decision)
              <polygon
                points={`${node.width / 2},0 ${node.width},${node.height / 2} ${node.width / 2},${node.height} 0,${node.height / 2}`}
                fill={isSelected ? '#eff6ff' : '#ffffff'}
                stroke={isSelected ? '#2563eb' : '#64748b'}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                className="transition-colors group-hover:stroke-blue-500"
              />
            ) : node.shape === 'cylinder' ? (
              // Cylinder (Database)
              <g>
                <rect
                  x="0"
                  y="7"
                  width={node.width}
                  height={node.height - 7}
                  rx="5"
                  fill={isSelected ? '#eff6ff' : '#ffffff'}
                  stroke={isSelected ? '#2563eb' : '#0284c7'}
                  strokeWidth={isSelected ? '2.5' : '1.5'}
                />
                <ellipse
                  cx={node.width / 2}
                  cy="7"
                  rx={node.width / 2}
                  ry="6"
                  fill={isSelected ? '#dbeafe' : '#f0f9ff'}
                  stroke={isSelected ? '#2563eb' : '#0284c7'}
                  strokeWidth={isSelected ? '2.5' : '1.5'}
                />
              </g>
            ) : node.shape === 'stadium' ? (
              // Stadium / Capsule (Start / End)
              <rect
                x="0"
                y="0"
                width={node.width}
                height={node.height}
                rx={node.height / 2}
                fill={isSelected ? '#eff6ff' : '#ffffff'}
                stroke={isSelected ? '#2563eb' : '#059669'}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                className="transition-colors group-hover:stroke-emerald-600"
              />
            ) : node.shape === 'round' ? (
              // Rounded Rect
              <rect
                x="0"
                y="0"
                width={node.width}
                height={node.height}
                rx="14"
                fill={isSelected ? '#eff6ff' : '#ffffff'}
                stroke={isSelected ? '#2563eb' : '#64748b'}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                className="transition-colors group-hover:stroke-blue-500"
              />
            ) : (
              // Default Rectangle (Process)
              <rect
                x="0"
                y="0"
                width={node.width}
                height={node.height}
                rx="4"
                fill={isSelected ? '#eff6ff' : '#ffffff'}
                stroke={isSelected ? '#2563eb' : '#64748b'}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                className="transition-colors group-hover:stroke-blue-500"
              />
            )}

            {/* Node ID Badge in top-left */}
            <g transform="translate(6, 6)">
              <rect
                x="0"
                y="0"
                width={Math.max(18, node.id.length * 7 + 6)}
                height="14"
                rx="3"
                fill={isSelected ? '#2563eb' : '#e2e8f0'}
              />
              <text
                x={Math.max(9, (node.id.length * 7 + 6) / 2)}
                y="10"
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={isSelected ? '#ffffff' : '#334155'}
                fontFamily="monospace"
              >
                {node.id}
              </text>
            </g>

            {/* Has Detailed Specification indicator dot */}
            {hasDetail && (
              <circle
                cx={node.width - 8}
                cy="8"
                r="3.5"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="1"
              />
            )}

            {/* Node Text Label */}
            <text
              x={node.width / 2}
              y={node.height / 2 + (node.shape === 'cylinder' ? 4 : 3)}
              textAnchor="middle"
              fontSize="11"
              fontWeight={isSelected ? '700' : '600'}
              fill={isSelected ? '#1e3a8a' : '#1e293b'}
              fontFamily="sans-serif"
            >
              {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
