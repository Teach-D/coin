import { useEffect, useRef } from 'react';
import { connectSocket, getSocket } from '../lib/socket';
import { useTickerStore, type Ticker } from '../store/tickerStore';

export function useTickerSubscription(markets: string[]) {
  const setTicker = useTickerStore((s) => s.setTicker);
  const marketsKey = markets.join(',');
  const handlerRef = useRef<((ticker: Ticker) => void) | null>(null);

  useEffect(() => {
    if (markets.length === 0) return;
    let mounted = true;

    const handler = (ticker: Ticker) => {
      setTicker(ticker);
    };
    handlerRef.current = handler;

    connectSocket().then(() => {
      if (!mounted) return;
      const s = getSocket();
      s.emit('subscribeToTickers', { markets });
      s.on('ticker', handler);
    });

    return () => {
      mounted = false;
      const s = getSocket();
      markets.forEach((market) => s.emit('unsubscribeFromTicker', { market }));
      if (handlerRef.current) {
        s.off('ticker', handlerRef.current);
        handlerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketsKey]);
}
