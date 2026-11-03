import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { useMarket } from '../context/MarketContext';
import { fmtTime } from '../lib/format';
import OverviewCards from '../components/OverviewCards';
import Heatmap from '../components/Heatmap';
import StockPanel from '../components/StockPanel';
import MoversCards from '../components/MoversCards';
import RankingsPanel from '../components/RankingsPanel';
import ActivityFeed from '../components/ActivityFeed';
import SectorPerformance from '../components/SectorPerformance';
import InsightsPanel from '../components/InsightsPanel';

const FEED_STATE_LABEL = {
  CONNECTING: 'connecting to the provider',
  AUTHORIZING: 'authorising the feed',
  SUBSCRIBING: 'subscribing to instruments',
  CONNECTED: 'connected, waiting for the first price updates',
  RECONNECTING: 'reconnecting after a lost connection',
  DISCONNECTED: 'disconnected',
  AUTH_ERROR: 'authentication error'
};

/**
 * The DEMO banner must survive a LIVE selection until the backend has actually
 * received valid live data, so it is driven by the backend's mode/receiving state.
 */
function FeedBanner({ mode, connection, freshness }) {
  if (mode === 'demo') {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
        <strong className="font-semibold">Demo mode.</strong> The market feed is simulated for demonstration. Values
        must not be read as actual market activity. Set <code className="mono">MARKET_DATA_MODE=live</code> with a
        provider token to stream real data.
      </div>
    );
  }

  if (connection?.state === 'RECEIVING') return null;

  const authError = connection?.state === 'AUTH_ERROR';
  const last = freshness?.lastMessageAt;
  const description = FEED_STATE_LABEL[connection?.state] || 'not receiving data';

  return (
    <div
      className={
        authError
          ? 'rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200'
          : 'rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90'
      }
    >
      <strong className="font-semibold">Live mode:</strong> {description}.
      {authError
        ? ' The provider rejected the access token. Update UPSTOX_ACCESS_TOKEN on the backend and restart; the UI will reconnect automatically.'
        : ' Some displayed values may be stale until updates resume.'}
      {last ? <span className="text-slate-400"> Last valid update {fmtTime(last)} IST.</span> : null}
    </div>
  );
}

export default function Dashboard() {
  const market = useMarket();
  const [selectedStock, setSelectedStock] = useState(null);
  const [sector, setSector] = useState('all');

  const overview = useApi(() => api.overview(), [], { pollMs: 15000 });
  const movers = useApi(() => api.movers(), [], { pollMs: 10000 });
  const intelligence = useApi(() => api.intelligence(), [], { pollMs: 30000 });
  const activity = useApi(() => api.activity(20), [], { pollMs: 20000 });
  const sectors = useApi(() => api.sectors(), [], { pollMs: 30000 });
  const insights = useApi(() => api.insights(), [], { pollMs: 30000 });

  return (
    <div className="space-y-4">
      <FeedBanner mode={market.mode} connection={market.connection} freshness={market.freshness} />

      <OverviewCards overview={overview.data} loading={overview.loading} error={overview.error} />

      <Heatmap onSelect={setSelectedStock} selectedSector={sector} onSectorChange={setSector} />

      <MoversCards movers={movers.data} loading={movers.loading} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RankingsPanel intelligence={intelligence.data} loading={intelligence.loading} />
        </div>
        <ActivityFeed activity={activity.data} loading={activity.loading} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectorPerformance
          data={sectors.data}
          loading={sectors.loading}
          activeSector={sector}
          onSelectSector={(value) => setSector((current) => (current === value ? 'all' : value))}
        />
        <InsightsPanel data={insights.data} loading={insights.loading} />
      </div>

      <StockPanel stock={selectedStock} onClose={() => setSelectedStock(null)} />
    </div>
  );
}
