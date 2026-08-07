import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { useAuthStore } from './store/useAuthStore';
import { Layout } from './components/Layout';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { AreaDetail } from './pages/AreaDetail';
import { Library } from './pages/Library';
import { Achievements } from './pages/Achievements';
import { Groups } from './pages/Groups';
import { Journal } from './pages/Journal';

export default function App() {
  const appStatus = useAppStore((s) => s.status);
  const authStatus = useAuthStore((s) => s.status);
  const initAuth = useAuthStore((s) => s.init);

  // Auth decides which backend the app data is loaded from, so it goes first
  // and triggers the app store's own init once the backend is settled.
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  if (authStatus === 'loading' || appStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg text-slate-400">Lade dein Abenteuer …</p>
      </div>
    );
  }

  if (appStatus === 'setup') {
    return <Onboarding />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/area/:areaId" element={<AreaDetail />} />
        <Route path="/library" element={<Library />} />
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/journal" element={<Journal />} />
      </Route>
    </Routes>
  );
}
