import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { Layout } from './components/Layout';
import { WelcomeScreen } from './pages/WelcomeScreen';
import { Dashboard } from './pages/Dashboard';
import { AreaDetail } from './pages/AreaDetail';

export default function App() {
  const status = useAppStore((s) => s.status);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg text-slate-400">Lade dein Abenteuer …</p>
      </div>
    );
  }

  if (status === 'setup') {
    return <WelcomeScreen />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/area/:areaId" element={<AreaDetail />} />
      </Route>
    </Routes>
  );
}
