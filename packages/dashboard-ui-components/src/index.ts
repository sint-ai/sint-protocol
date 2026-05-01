// v0.5 — original compliance & governance widgets
export { DRRTimeline, type DRRTimelineProps } from './components/DRRTimeline.js';
export { ApprovalFlow, type ApprovalFlowProps, type ApprovalState } from './components/ApprovalFlow.js';
export { HazardHeatmap, type HazardHeatmapProps } from './components/HazardHeatmap.js';
export { LedgerVisualization, type LedgerVisualizationProps, type LedgerEntry } from './components/LedgerVisualization.js';
export { useDRRData, type DRRData, type Incident } from './hooks/useDRRData.js';

// v0.6 — Applied Intuition–inspired widgets
export { ReliabilityGauge, type ReliabilityGaugeProps, type ReliabilityTier } from './components/ReliabilityGauge.js';
export { MTBFChart, type MTBFChartProps, type MTBFDataPoint } from './components/MTBFChart.js';
export { SimulationPlayback, type SimulationPlaybackProps, type SimDecisionTrace, type SimDivergence } from './components/SimulationPlayback.js';
export { PlanExecutionTimeline, type PlanExecutionTimelineProps, type PlanEvent } from './components/PlanExecutionTimeline.js';
export { AdversarialFaultsWidget, type AdversarialFaultsWidgetProps, type AdversarialFaultReport } from './components/AdversarialFaultsWidget.js';
export { LicenseTierBadge, type LicenseTierBadgeProps, type LicenseTier } from './components/LicenseTierBadge.js';
