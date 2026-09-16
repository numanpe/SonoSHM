import { useState } from 'react';
import { AppStateProvider } from './state/store';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import type { SectionId } from './components/layout/navConfig';

import Overview from './pages/Overview';
import ExperimentSetup from './pages/ExperimentSetup';
import ImportStructure from './pages/ImportStructure';
import UltrasonicSignals from './pages/UltrasonicSignals';
import SignalProcessingPage from './pages/SignalProcessingPage';
import NonlinearFeatures from './pages/NonlinearFeatures';
import AIDiagnosis from './pages/AIDiagnosis';
import ReferenceFree from './pages/ReferenceFree';
import LongitudinalMonitoring from './pages/LongitudinalMonitoring';
import DamagePrognosis from './pages/DamagePrognosis';
import DigitalTwin from './pages/DigitalTwin';
import LiveMonitoring from './pages/LiveMonitoring';
import ResearchQuestions from './pages/ResearchQuestions';
import NextInspection from './pages/NextInspection';
import ResearchReport from './pages/ResearchReport';

function PageSwitch({ section, onNavigate }: { section: SectionId; onNavigate: (s: SectionId) => void }) {
  switch (section) {
    case 'overview':
      return <Overview onNavigate={onNavigate} />;
    case 'setup':
      return <ExperimentSetup />;
    case 'import':
      return <ImportStructure onNavigate={onNavigate} />;
    case 'signals':
      return <UltrasonicSignals />;
    case 'processing':
      return <SignalProcessingPage />;
    case 'features':
      return <NonlinearFeatures />;
    case 'diagnosis':
      return <AIDiagnosis />;
    case 'reference-free':
      return <ReferenceFree />;
    case 'longitudinal':
      return <LongitudinalMonitoring />;
    case 'prognosis':
      return <DamagePrognosis />;
    case 'twin':
      return <DigitalTwin />;
    case 'live':
      return <LiveMonitoring />;
    case 'questions':
      return <ResearchQuestions />;
    case 'next-inspection':
      return <NextInspection />;
    case 'report':
      return <ResearchReport onNavigate={onNavigate} />;
    default:
      return null;
  }
}

function AppShell() {
  const [section, setSection] = useState<SectionId>('overview');
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f5f7]">
      <Sidebar active={section} onSelect={setSection} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto lab-scroll">
          <div className="max-w-[1400px] mx-auto px-6 py-6">
            <PageSwitch section={section} onNavigate={setSection} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}
