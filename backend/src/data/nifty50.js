/**
 * NIFTY 50 constituent reference dataset.
 *
 * Source of truth for the tracked universe. `instrumentKey` is the provider's
 * NSE_EQ instrument key (`NSE_EQ|<ISIN>`), taken from the Upstox instrument master
 * (https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz) and
 * matched by ISIN against the NSE Indices NIFTY 50 constituent list
 * (https://archives.nseindia.com/content/indices/ind_nifty50list.csv).
 * `npm run sync-instruments` re-resolves the keys from the provider master and
 * reports anything it cannot verify.
 *
 * `marketCap` is *reference* data for tile area only, not a current market
 * capitalisation. Values are approximate, expressed in INR, and carry
 * `marketCapAsOf`. Refresh them from a documented source and update the date.
 *
 * `database/seed.sql` applies this list; the universe test fails if the two drift.
 */
export const NIFTY50_SOURCE =
  'NSE Indices NIFTY 50 constituent list + Upstox NSE instrument master';

export const NIFTY50_CONSTITUENT_DATE = '2026-11-03';
export const MARKET_CAP_REFERENCE_DATE = '2026-03-31';

export const NIFTY50_CONSTITUENTS = [
  { symbol: 'ADANIENT', companyName: 'Adani Enterprises Ltd.', sector: 'Metals', instrumentKey: 'NSE_EQ|INE423A01024', marketCap: 3000000000000, isin: 'INE423A01024', exchange: 'NSE' },
  { symbol: 'ADANIPORTS', companyName: 'Adani Ports and Special Economic Zone Ltd.', sector: 'Services', instrumentKey: 'NSE_EQ|INE742F01042', marketCap: 2800000000000, isin: 'INE742F01042', exchange: 'NSE' },
  { symbol: 'APOLLOHOSP', companyName: 'Apollo Hospitals Enterprise Ltd.', sector: 'Healthcare', instrumentKey: 'NSE_EQ|INE437A01024', marketCap: 1100000000000, isin: 'INE437A01024', exchange: 'NSE' },
  { symbol: 'ASIANPAINT', companyName: 'Asian Paints Ltd.', sector: 'Consumer Durables', instrumentKey: 'NSE_EQ|INE021A01026', marketCap: 2600000000000, isin: 'INE021A01026', exchange: 'NSE' },
  { symbol: 'AXISBANK', companyName: 'Axis Bank Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE238A01034', marketCap: 3600000000000, isin: 'INE238A01034', exchange: 'NSE' },
  { symbol: 'BAJAJ-AUTO', companyName: 'Bajaj Auto Ltd.', sector: 'Automobile', instrumentKey: 'NSE_EQ|INE917I01010', marketCap: 2400000000000, isin: 'INE917I01010', exchange: 'NSE' },
  { symbol: 'BAJAJFINSV', companyName: 'Bajaj Finserv Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE918I01026', marketCap: 3200000000000, isin: 'INE918I01026', exchange: 'NSE' },
  { symbol: 'BAJFINANCE', companyName: 'Bajaj Finance Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE296A01032', marketCap: 5500000000000, isin: 'INE296A01032', exchange: 'NSE' },
  { symbol: 'BEL', companyName: 'Bharat Electronics Ltd.', sector: 'Capital Goods', instrumentKey: 'NSE_EQ|INE263A01024', marketCap: 2500000000000, isin: 'INE263A01024', exchange: 'NSE' },
  { symbol: 'BHARTIARTL', companyName: 'Bharti Airtel Ltd.', sector: 'Telecommunications', instrumentKey: 'NSE_EQ|INE397D01024', marketCap: 10500000000000, isin: 'INE397D01024', exchange: 'NSE' },
  { symbol: 'BSE', companyName: 'BSE Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE118H01025', marketCap: 700000000000, isin: 'INE118H01025', exchange: 'NSE' },
  { symbol: 'CIPLA', companyName: 'Cipla Ltd.', sector: 'Healthcare', instrumentKey: 'NSE_EQ|INE059A01026', marketCap: 1300000000000, isin: 'INE059A01026', exchange: 'NSE' },
  { symbol: 'COALINDIA', companyName: 'Coal India Ltd.', sector: 'Energy', instrumentKey: 'NSE_EQ|INE522F01014', marketCap: 2500000000000, isin: 'INE522F01014', exchange: 'NSE' },
  { symbol: 'DRREDDY', companyName: "Dr. Reddy's Laboratories Ltd.", sector: 'Healthcare', instrumentKey: 'NSE_EQ|INE089A01031', marketCap: 1100000000000, isin: 'INE089A01031', exchange: 'NSE' },
  { symbol: 'EICHERMOT', companyName: 'Eicher Motors Ltd.', sector: 'Automobile', instrumentKey: 'NSE_EQ|INE066A01021', marketCap: 1500000000000, isin: 'INE066A01021', exchange: 'NSE' },
  { symbol: 'ETERNAL', companyName: 'Eternal Ltd.', sector: 'Consumer Services', instrumentKey: 'NSE_EQ|INE758T01015', marketCap: 2500000000000, isin: 'INE758T01015', exchange: 'NSE' },
  { symbol: 'GRASIM', companyName: 'Grasim Industries Ltd.', sector: 'Cement', instrumentKey: 'NSE_EQ|INE047A01021', marketCap: 1800000000000, isin: 'INE047A01021', exchange: 'NSE' },
  { symbol: 'HCLTECH', companyName: 'HCL Technologies Ltd.', sector: 'Information Technology', instrumentKey: 'NSE_EQ|INE860A01027', marketCap: 4200000000000, isin: 'INE860A01027', exchange: 'NSE' },
  { symbol: 'HDFCBANK', companyName: 'HDFC Bank Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE040A01034', marketCap: 14500000000000, isin: 'INE040A01034', exchange: 'NSE' },
  { symbol: 'HDFCLIFE', companyName: 'HDFC Life Insurance Company Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE795G01014', marketCap: 1400000000000, isin: 'INE795G01014', exchange: 'NSE' },
  { symbol: 'HINDALCO', companyName: 'Hindalco Industries Ltd.', sector: 'Metals', instrumentKey: 'NSE_EQ|INE038A01020', marketCap: 1800000000000, isin: 'INE038A01020', exchange: 'NSE' },
  { symbol: 'HINDUNILVR', companyName: 'Hindustan Unilever Ltd.', sector: 'FMCG', instrumentKey: 'NSE_EQ|INE030A01027', marketCap: 5600000000000, isin: 'INE030A01027', exchange: 'NSE' },
  { symbol: 'ICICIBANK', companyName: 'ICICI Bank Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE090A01021', marketCap: 10000000000000, isin: 'INE090A01021', exchange: 'NSE' },
  { symbol: 'INDIGO', companyName: 'InterGlobe Aviation Ltd.', sector: 'Services', instrumentKey: 'NSE_EQ|INE646L01027', marketCap: 2400000000000, isin: 'INE646L01027', exchange: 'NSE' },
  { symbol: 'INFY', companyName: 'Infosys Ltd.', sector: 'Information Technology', instrumentKey: 'NSE_EQ|INE009A01021', marketCap: 6200000000000, isin: 'INE009A01021', exchange: 'NSE' },
  { symbol: 'ITC', companyName: 'ITC Ltd.', sector: 'FMCG', instrumentKey: 'NSE_EQ|INE154A01025', marketCap: 5400000000000, isin: 'INE154A01025', exchange: 'NSE' },
  { symbol: 'JIOFIN', companyName: 'Jio Financial Services Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE758E01017', marketCap: 1800000000000, isin: 'INE758E01017', exchange: 'NSE' },
  { symbol: 'JSWSTEEL', companyName: 'JSW Steel Ltd.', sector: 'Metals', instrumentKey: 'NSE_EQ|INE019A01038', marketCap: 2300000000000, isin: 'INE019A01038', exchange: 'NSE' },
  { symbol: 'KOTAKBANK', companyName: 'Kotak Mahindra Bank Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE237A01036', marketCap: 4200000000000, isin: 'INE237A01036', exchange: 'NSE' },
  { symbol: 'LT', companyName: 'Larsen & Toubro Ltd.', sector: 'Infrastructure', instrumentKey: 'NSE_EQ|INE018A01030', marketCap: 5000000000000, isin: 'INE018A01030', exchange: 'NSE' },
  { symbol: 'M&M', companyName: 'Mahindra & Mahindra Ltd.', sector: 'Automobile', instrumentKey: 'NSE_EQ|INE101A01026', marketCap: 3800000000000, isin: 'INE101A01026', exchange: 'NSE' },
  { symbol: 'MARUTI', companyName: 'Maruti Suzuki India Ltd.', sector: 'Automobile', instrumentKey: 'NSE_EQ|INE585B01010', marketCap: 4000000000000, isin: 'INE585B01010', exchange: 'NSE' },
  { symbol: 'MAXHEALTH', companyName: 'Max Healthcare Institute Ltd.', sector: 'Healthcare', instrumentKey: 'NSE_EQ|INE027H01010', marketCap: 1000000000000, isin: 'INE027H01010', exchange: 'NSE' },
  { symbol: 'NESTLEIND', companyName: 'Nestle India Ltd.', sector: 'FMCG', instrumentKey: 'NSE_EQ|INE239A01024', marketCap: 2300000000000, isin: 'INE239A01024', exchange: 'NSE' },
  { symbol: 'NTPC', companyName: 'NTPC Ltd.', sector: 'Power', instrumentKey: 'NSE_EQ|INE733E01010', marketCap: 3300000000000, isin: 'INE733E01010', exchange: 'NSE' },
  { symbol: 'ONGC', companyName: 'Oil & Natural Gas Corporation Ltd.', sector: 'Energy', instrumentKey: 'NSE_EQ|INE213A01029', marketCap: 3200000000000, isin: 'INE213A01029', exchange: 'NSE' },
  { symbol: 'POWERGRID', companyName: 'Power Grid Corporation of India Ltd.', sector: 'Power', instrumentKey: 'NSE_EQ|INE752E01010', marketCap: 2700000000000, isin: 'INE752E01010', exchange: 'NSE' },
  { symbol: 'RELIANCE', companyName: 'Reliance Industries Ltd.', sector: 'Energy', instrumentKey: 'NSE_EQ|INE002A01018', marketCap: 17000000000000, isin: 'INE002A01018', exchange: 'NSE' },
  { symbol: 'SBILIFE', companyName: 'SBI Life Insurance Company Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE123W01016', marketCap: 1600000000000, isin: 'INE123W01016', exchange: 'NSE' },
  { symbol: 'SBIN', companyName: 'State Bank of India', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE062A01020', marketCap: 7000000000000, isin: 'INE062A01020', exchange: 'NSE' },
  { symbol: 'SHRIRAMFIN', companyName: 'Shriram Finance Ltd.', sector: 'Financial Services', instrumentKey: 'NSE_EQ|INE721A01047', marketCap: 1200000000000, isin: 'INE721A01047', exchange: 'NSE' },
  { symbol: 'SUNPHARMA', companyName: 'Sun Pharmaceutical Industries Ltd.', sector: 'Healthcare', instrumentKey: 'NSE_EQ|INE044A01036', marketCap: 3800000000000, isin: 'INE044A01036', exchange: 'NSE' },
  { symbol: 'TATACONSUM', companyName: 'Tata Consumer Products Ltd.', sector: 'FMCG', instrumentKey: 'NSE_EQ|INE192A01025', marketCap: 1100000000000, isin: 'INE192A01025', exchange: 'NSE' },
  { symbol: 'TATASTEEL', companyName: 'Tata Steel Ltd.', sector: 'Metals', instrumentKey: 'NSE_EQ|INE081A01020', marketCap: 2200000000000, isin: 'INE081A01020', exchange: 'NSE' },
  { symbol: 'TCS', companyName: 'Tata Consultancy Services Ltd.', sector: 'Information Technology', instrumentKey: 'NSE_EQ|INE467B01029', marketCap: 12000000000000, isin: 'INE467B01029', exchange: 'NSE' },
  { symbol: 'TECHM', companyName: 'Tech Mahindra Ltd.', sector: 'Information Technology', instrumentKey: 'NSE_EQ|INE669C01036', marketCap: 1600000000000, isin: 'INE669C01036', exchange: 'NSE' },
  { symbol: 'TITAN', companyName: 'Titan Company Ltd.', sector: 'Consumer Durables', instrumentKey: 'NSE_EQ|INE280A01028', marketCap: 3300000000000, isin: 'INE280A01028', exchange: 'NSE' },
  { symbol: 'TMPV', companyName: 'Tata Motors Passenger Vehicles Ltd.', sector: 'Automobile', instrumentKey: 'NSE_EQ|INE155A01022', marketCap: 1400000000000, isin: 'INE155A01022', exchange: 'NSE' },
  { symbol: 'TRENT', companyName: 'Trent Ltd.', sector: 'Consumer Services', instrumentKey: 'NSE_EQ|INE849A01020', marketCap: 2200000000000, isin: 'INE849A01020', exchange: 'NSE' },
  { symbol: 'ULTRACEMCO', companyName: 'UltraTech Cement Ltd.', sector: 'Cement', instrumentKey: 'NSE_EQ|INE481G01011', marketCap: 3000000000000, isin: 'INE481G01011', exchange: 'NSE' }
];

export const NIFTY50_SYMBOLS = NIFTY50_CONSTITUENTS.map((row) => row.symbol);

export const NIFTY50_SECTORS = [...new Set(NIFTY50_CONSTITUENTS.map((row) => row.sector))].sort();

export const NIFTY50_INSTRUMENT_KEYS = NIFTY50_CONSTITUENTS.map((row) => row.instrumentKey);
