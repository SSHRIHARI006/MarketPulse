import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { useMarket } from '../context/MarketContext';
import { cx, fmtPct, fmtPrice, fmtVolume } from '../lib/format';
import { heatColor } from '../lib/heatColors';
import { ErrorBlock, LoadingBlock } from './StateViews';

const RANGES = [
  { value: 'daily', label: 'Daily' },
  { value: 'session', label: 'Current session' },
  { value: '5m', label: 'Last 5 min' },
  { value: '15m', label: 'Last 15 min' },
  { value: '1h', label: 'Last 1 hour' }
];

const SIZE_METRICS = [
  { value: 'marketCap', label: 'Market cap' },
  { value: 'volume', label: 'Volume' },
  { value: 'equal', label: 'Equal size' }
];

/**
 * Width of the element currently holding the treemap. A callback ref is used because
 * the element only mounts after the first fetch resolves: an effect with an empty
 * dependency list would run while the loading block is shown, find no node, and never
 * observe the chart (which left the treemap stuck at its default width).
 */
function useElementWidth() {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(900);
  const ref = useCallback((element) => setNode(element), []);

  useEffect(() => {
    if (!node) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.max(320, entry.contentRect.width));
    });
    observer.observe(node);
    setWidth(Math.max(320, node.clientWidth));
    return () => observer.disconnect();
  }, [node]);

  return [ref, width];
}

/**
 * Approximate text fitting. SVG has no text-overflow, so labels must be truncated to
 * the space the tile actually has or they bleed into the neighbouring tile.
 * `charWidth` is the measured average advance for the font size used.
 */
function fitText(text, availableWidth, charWidth) {
  if (!text) return '';
  const maxChars = Math.floor(availableWidth / charWidth);
  if (maxChars < 2) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

const SECTOR_CHAR_WIDTH = 8.2; // 10px semibold uppercase + tracking-wider
const SYMBOL_CHAR_WIDTH = 7.2; // 11px bold
const COMPANY_CHAR_WIDTH = 5.1; // 9px regular
const PRICE_CHAR_WIDTH = 6.4; // 10px mono tabular-nums

function legendStops(neutralBand, maxPct) {
  return [-maxPct, -2, -0.5, -neutralBand, neutralBand, 0.5, 2, maxPct].map((value) => ({
    value,
    color: heatColor(value, { neutralBand, maxPct })
  }));
}

export default function Heatmap({ onSelect, selectedSector, onSectorChange }) {
  const [range, setRange] = useState('daily');
  const [sizeBy, setSizeBy] = useState('marketCap');
  const [internalSector, setInternalSector] = useState('all');
  const [hovered, setHovered] = useState(null);
  const [flashes, setFlashes] = useState({});
  const previousPrices = useRef(new Map());
  const market = useMarket();

  const sector = selectedSector ?? internalSector;
  const setSector = onSectorChange ?? setInternalSector;

  // Sector filters come from the tracked universe, not a hardcoded list, so the
  // full NIFTY 50 sector set (15 groups) is always available.
  const universe = useApi(() => api.universe(), [], { pollMs: 120000 });

  const isIntradayRange = range !== 'daily' && range !== 'session';

  const { data, loading, error, reload } = useApi(
    () => api.heatmap({ range, sector, sizeBy }),
    [range, sector, sizeBy],
    // Intraday baselines need a server-side recomputation, so those ranges refetch.
    { pollMs: isIntradayRange ? 10000 : 25000 }
  );

  // Declared after `data`: a memo that reads it earlier would hit the temporal
  // dead zone and crash the render.
  const sectorOptions = useMemo(() => {
    const names = new Set((universe.data?.stocks || []).map((stock) => stock.sector));
    for (const tile of data?.tiles || []) names.add(tile.sector);
    return ['all', ...[...names].filter(Boolean).sort()];
  }, [universe.data, data]);

  const tiles = useMemo(() => {
    if (!data?.tiles) return [];
    return data.tiles.map((tile) => {
      const quote = market.quotes[tile.stockId];
      if (!quote || quote.price === null || quote.price === undefined) return tile;
      return {
        ...tile,
        price: quote.price,
        volume: quote.volume ?? tile.volume,
        dayHigh: quote.high ?? tile.dayHigh,
        dayLow: quote.low ?? tile.dayLow,
        open: quote.open ?? tile.open,
        // Keep the server-computed baseline change for intraday ranges.
        changePct: isIntradayRange ? tile.changePct : quote.changePct ?? tile.changePct,
        updatedAt: quote.updatedAt ?? tile.updatedAt,
        stale: quote.stale ?? tile.stale,
        dataStatus: quote.dataStatus ?? tile.dataStatus
      };
    });
  }, [data, market.quotes, isIntradayRange]);

  // Brief green/red flash on the tiles whose price actually moved.
  useEffect(() => {
    const next = {};
    for (const tile of tiles) {
      const previous = previousPrices.current.get(tile.stockId);
      if (
        previous !== undefined &&
        Number.isFinite(tile.price) &&
        Number.isFinite(previous) &&
        tile.price !== previous
      ) {
        next[tile.stockId] = tile.price > previous ? 'up' : 'down';
      }
      if (Number.isFinite(tile.price)) previousPrices.current.set(tile.stockId, tile.price);
    }
    if (!Object.keys(next).length) return undefined;
    setFlashes(next);
    const timer = setTimeout(() => setFlashes({}), 1000);
    return () => clearTimeout(timer);
  }, [tiles]);

  const neutralBand = data?.neutralBandPct ?? 0.05;
  const maxPct = data?.maxPct ?? 5;

  const [containerRef, width] = useElementWidth();
  const height = width < 640 ? 420 : width < 1100 ? 520 : width < 1500 ? 640 : 720;

  const layout = useMemo(() => {
    if (!tiles.length) return { sectors: [], stockTiles: [] };

    const bySector = new Map();
    for (const tile of tiles) {
      const list = bySector.get(tile.sector) || [];
      list.push(tile);
      bySector.set(tile.sector, list);
    }

    const tree = hierarchy({
      name: 'market',
      children: [...bySector.entries()].map(([name, members]) => ({
        name,
        children: members
      }))
    })
      .sum((node) => (node.children ? 0 : Math.max(1, node.sizeValue || 1)))
      .sort((a, b) => b.value - a.value);

    treemap()
      .size([width, height])
      .tile(treemapSquarify)
      .paddingOuter(3)
      .paddingInner(2)
      .paddingTop(18)
      .round(true)(tree);

    const sectorNodes = tree.children || [];
    const stockTiles = [];
    for (const sectorNode of sectorNodes) {
      for (const leaf of sectorNode.leaves()) {
        stockTiles.push({
          ...leaf.data,
          x0: leaf.x0,
          y0: leaf.y0,
          x1: leaf.x1,
          y1: leaf.y1,
          sectorName: sectorNode.data.name
        });
      }
    }

    return {
      sectors: sectorNodes.map((node) => ({
        name: node.data.name,
        x0: node.x0,
        y0: node.y0,
        x1: node.x1,
        y1: node.y1,
        count: node.leaves().length
      })),
      stockTiles
    };
    // Layout depends only on the tile set and geometry, not on price ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, sizeBy, tiles.map((tile) => `${tile.stockId}:${tile.sizeValue}`).join('|')]);

  const unavailable = tiles.filter((tile) => !tile.available).length;
  const recentCutoff = Date.now() - 5000;

  return (
    <section className="card overflow-hidden" aria-label="Live market heatmap">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/70 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Live Market Heatmap</h2>
          <p className="text-[11px] text-slate-500">
            {data?.rangeLabel || 'Daily (vs previous close)'}
            {data?.sizeBy === 'equal' ? ' · equal-sized tiles' : data?.sizeBy === 'volume' ? ' · area = volume' : ' · area = market cap'}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <select className="select" value={range} onChange={(event) => setRange(event.target.value)} aria-label="Time range">
            {RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="select" value={sector} onChange={(event) => setSector(event.target.value)} aria-label="Sector filter">
            {sectorOptions.map((name) => (
              <option key={name} value={name}>
                {name === 'all' ? 'All sectors' : name}
              </option>
            ))}
          </select>
          <select className="select" value={sizeBy} onChange={(event) => setSizeBy(event.target.value)} aria-label="Tile size metric">
            {SIZE_METRICS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="p-4">
          <ErrorBlock message={error} onRetry={reload} />
        </div>
      ) : null}

      {loading && !data ? (
        <LoadingBlock label="Building heatmap…" rows={4} />
      ) : (
        <div ref={containerRef} className="relative">
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Treemap of ${tiles.length} tracked stocks coloured by percentage change`}
            className="block"
          >
            {/* One clip per tile: even with fitted labels, a stray glyph must never
                paint over the neighbouring tile. */}
            <defs>
              {layout.stockTiles.map((tile) => (
                <clipPath key={tile.stockId} id={`heat-tile-${tile.stockId}`}>
                  <rect
                    width={Math.max(0, tile.x1 - tile.x0)}
                    height={Math.max(0, tile.y1 - tile.y0)}
                    rx={3}
                  />
                </clipPath>
              ))}
              {/* Header band of each sector: a long name can never reach the next
                  sector, which is what produced overlapping labels. */}
              {layout.sectors.map((sectorNode, index) => (
                <clipPath key={sectorNode.name} id={`heat-sector-${index}`}>
                  <rect
                    x={sectorNode.x0}
                    y={sectorNode.y0}
                    width={Math.max(0, sectorNode.x1 - sectorNode.x0)}
                    height={Math.min(18, Math.max(0, sectorNode.y1 - sectorNode.y0))}
                  />
                </clipPath>
              ))}
            </defs>

            {layout.sectors.map((sectorNode, sectorIndex) => (
              <g key={sectorNode.name}>
                <rect
                  x={sectorNode.x0}
                  y={sectorNode.y0}
                  width={Math.max(0, sectorNode.x1 - sectorNode.x0)}
                  height={Math.max(0, sectorNode.y1 - sectorNode.y0)}
                  fill="rgba(148,163,184,0.04)"
                  stroke="rgba(148,163,184,0.12)"
                  strokeWidth={1}
                  rx={4}
                />
                <text
                  x={sectorNode.x0 + 4}
                  y={sectorNode.y0 + 12}
                  className="fill-slate-400 text-[10px] font-semibold uppercase tracking-wider"
                  clipPath={`url(#heat-sector-${sectorIndex})`}
                  style={{ pointerEvents: 'none' }}
                >
                  {fitText(
                    sectorNode.name,
                    Math.max(0, sectorNode.x1 - sectorNode.x0 - 8),
                    SECTOR_CHAR_WIDTH
                  )}
                </text>
              </g>
            ))}

            {layout.stockTiles.map((tile) => {
              const tileWidth = tile.x1 - tile.x0;
              const tileHeight = tile.y1 - tile.y0;
              const color = heatColor(tile.available ? tile.changePct : null, { neutralBand, maxPct });
              const isRecent = tile.updatedAt && new Date(tile.updatedAt).getTime() > recentCutoff;
              const isHovered = hovered === tile.stockId;
              const hasStatusDot = ['STALE', 'UNAVAILABLE', 'CLOSED'].includes(tile.dataStatus);
              const showCompany = tileWidth > 120 && tileHeight > 62;
              const showPrice = tileHeight > 42;

              return (
                <g
                  key={tile.stockId}
                  transform={`translate(${tile.x0},${tile.y0})`}
                  onClick={() => onSelect?.(tile)}
                  onMouseEnter={() => setHovered(tile.stockId)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`${tile.companyName}: ${tile.available ? fmtPct(tile.changePct) : 'change unavailable'}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect?.(tile);
                    }
                  }}
                >
                  <rect
                    width={Math.max(0, tileWidth)}
                    height={Math.max(0, tileHeight)}
                    rx={3}
                    fill={color}
                    stroke={isHovered ? '#e2e8f0' : 'rgba(2,6,23,0.55)'}
                    strokeWidth={isHovered ? 1.6 : 0.6}
                    className={cx('transition-[fill] duration-500 ease-out', isRecent && 'tile-recent')}
                    opacity={tile.available ? 1 : 0.55}
                  >
                    <title>
                      {`${tile.companyName} (${tile.symbol}) · ${tile.sector}\n` +
                        `Price: ₹${fmtPrice(tile.price)}\n` +
                        `Change: ${tile.available ? fmtPct(tile.changePct) : 'unavailable for this range'}\n` +
                        `Volume: ${fmtVolume(tile.volume)}\n` +
                        `Updated: ${tile.updatedAt ? new Date(tile.updatedAt).toLocaleTimeString('en-IN') : 'no live tick'}`}
                    </title>
                  </rect>

                  {flashes[tile.stockId] ? (
                    <rect
                      width={Math.max(0, tileWidth)}
                      height={Math.max(0, tileHeight)}
                      rx={3}
                      style={{ pointerEvents: 'none' }}
                      className={flashes[tile.stockId] === 'up' ? 'tile-flash-up' : 'tile-flash-down'}
                    />
                  ) : null}

                  {hasStatusDot ? (
                    <circle
                      cx={Math.max(6, tileWidth - 6)}
                      cy={7}
                      r={2.5}
                      fill={tile.dataStatus === 'STALE' ? '#f59e0b' : '#64748b'}
                      style={{ pointerEvents: 'none' }}
                    >
                      <title>
                        {tile.dataStatus === 'STALE'
                          ? 'No recent update for this instrument'
                          : tile.dataStatus === 'CLOSED'
                            ? 'Market closed: last valid price shown'
                            : 'No valid price received yet'}
                      </title>
                    </circle>
                  ) : null}

                  {tileWidth > 46 && tileHeight > 26 ? (
                    <g clipPath={`url(#heat-tile-${tile.stockId})`} style={{ pointerEvents: 'none' }}>
                      <text x={6} y={15} className="fill-slate-50 text-[11px] font-bold">
                        {fitText(
                          tile.symbol,
                          tileWidth - (hasStatusDot ? 24 : 12),
                          SYMBOL_CHAR_WIDTH
                        )}
                      </text>
                      <text
                        x={6}
                        y={29}
                        className="fill-slate-200/90 font-mono text-[11px] font-semibold tabular-nums"
                      >
                        {fitText(
                          tile.available ? fmtPct(tile.changePct) : 'n/a',
                          tileWidth - 12,
                          PRICE_CHAR_WIDTH + 0.6
                        )}
                      </text>
                      {showCompany ? (
                        <text x={6} y={43} className="fill-slate-300/70 text-[9px]">
                          {fitText(tile.companyName, tileWidth - 12, COMPANY_CHAR_WIDTH)}
                        </text>
                      ) : null}
                      {showPrice ? (
                        <>
                          <text
                            x={6}
                            y={tileHeight - 7}
                            className="fill-slate-100/80 font-mono text-[10px] tabular-nums"
                          >
                            {fitText(
                              `₹${fmtPrice(tile.price)}`,
                              tileWidth - (flashes[tile.stockId] && tileWidth > 74 ? 24 : 12),
                              PRICE_CHAR_WIDTH
                            )}
                          </text>
                          {flashes[tile.stockId] && tileWidth > 74 ? (
                            <text
                              x={tileWidth - 14}
                              y={tileHeight - 7}
                              className={cx(
                                'text-[10px] font-bold',
                                flashes[tile.stockId] === 'up' ? 'fill-emerald-300' : 'fill-rose-300'
                              )}
                            >
                              {flashes[tile.stockId] === 'up' ? '▲' : '▼'}
                            </text>
                          ) : null}
                        </>
                      ) : null}
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {!tiles.length ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-slate-500">No stocks match the selected sector.</p>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-800/70 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500">{-maxPct}%</span>
          <div className="flex h-2 overflow-hidden rounded-full">
            {legendStops(neutralBand, maxPct).map((stop) => (
              <span key={stop.value} className="h-2 w-6" style={{ backgroundColor: stop.color }} />
            ))}
          </div>
          <span className="text-[10px] text-slate-500">+{maxPct}%</span>
        </div>
        <p className="text-[10px] text-slate-600">
          Neutral band ±{neutralBand}% · {tiles.length} stocks
          {unavailable ? ` · ${unavailable} with insufficient history for this range` : ''}
        </p>
        <p className="ml-auto text-[10px] text-slate-600">
          {market.marketStatus?.isOpen ? 'Market open' : 'Market closed'}
          {unavailable ? ` · ${unavailable} unavailable` : ''} · tiles update without a refresh
        </p>
      </div>
    </section>
  );
}
