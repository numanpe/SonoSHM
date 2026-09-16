import {
  LayoutDashboard,
  Settings2,
  AudioWaveform,
  SlidersHorizontal,
  Radical,
  BrainCircuit,
  Fingerprint,
  TrendingUp,
  LineChart,
  Box,
  HelpCircle,
  CalendarClock,
  FileText,
  UploadCloud,
  RadioTower,
} from 'lucide-react';

export const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'setup', label: 'Experiment Setup', icon: Settings2 },
  { id: 'import', label: 'Import Structure', icon: UploadCloud },
  { id: 'signals', label: 'Ultrasonic Signals', icon: AudioWaveform },
  { id: 'processing', label: 'Signal Processing', icon: SlidersHorizontal },
  { id: 'features', label: 'Nonlinear Features', icon: Radical },
  { id: 'diagnosis', label: 'AI Diagnosis', icon: BrainCircuit },
  { id: 'reference-free', label: 'Reference-Free Diagnostics', icon: Fingerprint },
  { id: 'longitudinal', label: 'Longitudinal Monitoring', icon: TrendingUp },
  { id: 'prognosis', label: 'Damage Prognosis', icon: LineChart },
  { id: 'twin', label: 'Digital Twin', icon: Box },
  { id: 'live', label: 'Live Monitoring', icon: RadioTower },
  { id: 'questions', label: 'Research Questions', icon: HelpCircle },
  { id: 'next-inspection', label: 'Next Inspection', icon: CalendarClock },
  { id: 'report', label: 'Research Report', icon: FileText },
] as const;

export type SectionId = (typeof NAV_SECTIONS)[number]['id'];
