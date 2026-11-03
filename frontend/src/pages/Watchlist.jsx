import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { useMarket } from '../context/MarketContext';
import Delta from '../components/Delta';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StateViews';
import { fmtPrice, fmtTime } from '../lib/format';

export default function Watchlist() {
  const market = useMarket();
  const watchlists = useApi(() => api.watchlists(), []);
  const stocks = useApi(() => api.stocks(), []);
  const [newName, setNewName] = useState('');
  const [selectedStock, setSelectedStock] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = async () => {
    await watchlists.reload({ silent: true });
  };

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const createList = (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    run(async () => {
      await api.createWatchlist(name);
      setNewName('');
    });
  };

  const addStock = (watchlistId) => {
    if (!selectedStock) return;
    run(() => api.addToWatchlist(watchlistId, Number(selectedStock)));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Watchlist</h1>
        <p className="text-[11px] text-slate-500">
          Track selected stocks with live prices. Watchlists belong to the shared demo account — authentication is an
          optional later milestone.
        </p>
      </div>

      <section className="card p-3">
        <form onSubmit={createList} className="flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="stat-label">New watchlist</span>
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Banking focus"
              className="select mt-1 w-full"
              maxLength={120}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy || !newName.trim()}>
            Create
          </button>
        </form>
        {error ? <p className="mt-2 text-[11px] text-rose-400">{error}</p> : null}
      </section>

      {watchlists.error ? <ErrorBlock message={watchlists.error} onRetry={watchlists.reload} /> : null}

      {watchlists.loading && !watchlists.data ? (
        <div className="card">
          <LoadingBlock label="Loading watchlists…" rows={3} />
        </div>
      ) : !watchlists.data?.length ? (
        <div className="card">
          <EmptyBlock message="No watchlists yet." hint="Create one above to start tracking stocks." />
        </div>
      ) : (
        watchlists.data.map((list) => (
          <section key={list.id} className="card">
            <div className="card-header flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-white">{list.name}</h2>
                <p className="text-[10px] text-slate-600">{list.stocks.length} stocks</p>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  className="select"
                  value={selectedStock}
                  onChange={(event) => setSelectedStock(event.target.value)}
                  aria-label={`Add stock to ${list.name}`}
                >
                  <option value="">Add stock…</option>
                  {(stocks.data || [])
                    .filter((stock) => !list.stocks.some((entry) => entry.stockId === stock.id))
                    .map((stock) => (
                      <option key={stock.id} value={stock.id}>
                        {stock.symbol}
                      </option>
                    ))}
                </select>
                <button type="button" className="btn-ghost" disabled={busy || !selectedStock} onClick={() => addStock(list.id)}>
                  Add
                </button>
              </div>
            </div>

            {list.stocks.length === 0 ? (
              <EmptyBlock message="This watchlist is empty." />
            ) : (
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-[9px] uppercase tracking-[0.1em] text-slate-600">
                    <th className="px-3 py-2 font-medium">Stock</th>
                    <th className="px-2 py-2 text-right font-medium">Price</th>
                    <th className="px-2 py-2 text-right font-medium">Daily</th>
                    <th className="px-2 py-2 text-right font-medium">Updated</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.stocks.map((entry) => {
                    const live = market.quotes[entry.stockId];
                    return (
                      <tr key={entry.stockId} className="border-t border-slate-800/50">
                        <td className="px-3 py-2">
                          <Link to={`/stock/${entry.stockId}`} className="font-semibold text-slate-200 hover:text-sky-300">
                            {entry.symbol}
                          </Link>
                          <p className="text-[10px] text-slate-600">{entry.companyName}</p>
                        </td>
                        <td className="mono px-2 py-2 text-right text-slate-200">₹{fmtPrice(live?.price ?? entry.price)}</td>
                        <td className="px-2 py-2 text-right">
                          <Delta value={live?.changePct ?? entry.changePct} className="text-[11px]" />
                        </td>
                        <td className="px-2 py-2 text-right text-[10px] text-slate-600">
                          {live?.updatedAt ? fmtTime(live.updatedAt) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-[10px] text-slate-500 hover:text-rose-400"
                            disabled={busy}
                            onClick={() => run(() => api.removeFromWatchlist(list.id, entry.stockId))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        ))
      )}
    </div>
  );
}
