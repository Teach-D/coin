import { useEffect, useRef } from 'react';
import { connectSocket, getSocket } from '../lib/socket';
import type { CandleData, CandleUnit } from '../types';

interface CandleUpdatePayload {
  market: string;
  unit: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  candleStartMs: number;
}

export function useCandleSubscription(
  market: string,
  unit: CandleUnit,
  onUpdate: (candle: CandleData) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!market) return;
    let mounted = true;

    const handler = (payload: CandleUpdatePayload) => {
      if (payload.market !== market || payload.unit !== unit) return;
      onUpdateRef.current({
        time: payload.candleStartMs / 1000,
        open: payload.open,
        high: payload.high,
        low: payload.low,
        close: payload.close,
      });
    };

    connectSocket()
      .then(() => {
        if (!mounted) return;
        const s = getSocket();
        s.on('candleUpdate', handler);
      })
      .catch(() => {});

    return () => {
      mounted = false;
      const s = getSocket();
      s.off('candleUpdate', handler);
    };
  }, [market, unit]);
}
