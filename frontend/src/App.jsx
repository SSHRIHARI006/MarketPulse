import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import StockDetail from './pages/StockDetail';
import Compare from './pages/Compare';
import Watchlist from './pages/Watchlist';
import Diagnostics from './pages/Diagnostics';
import { MarketProvider } from './context/MarketContext';

function NotFound() {
  return (
    <div className="card p-6 text-center">
      <p className="text-sm text-slate-300">Page not found.</p>
      <a href="/" className="mt-2 inline-block text-xs text-sky-400 hover:underline">
        Return to dashboard
      </a>
    </div>
  );
}

export default function App() {
  return (
    <MarketProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stocks/:id" element={<StockDetail />} />
            <Route path="/stock/:id" element={<StockDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MarketProvider>
  );
}
