/**
 * Liquidation detection latency benchmark — Before vs After
 *
 * BEFORE (polling):
 *   setInterval 1000ms → SELECT * FROM positions WHERE status='OPEN'
 *   + N individual Redis GET coin:price:{ticker} calls
 *
 * AFTER (event-driven):
 *   Redis Pub/Sub trigger → ZRANGEBYSCORE O(log N)
 */

import Redis from 'ioredis';
import { Client } from 'pg';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const PG_CONFIG = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'coinbattle',
  password: process.env.DB_PASSWORD ?? 'coinbattle',
  database: process.env.DB_NAME ?? 'coinbattle',
};
const CHANNEL = 'coin:ticker:broadcast';
const TEST_TICKER = 'BENCH-TEST';
const ITERATIONS = 100;

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
    avg: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length),
  };
}

function printStats(label: string, s: ReturnType<typeof stats>) {
  console.log(`  ${label}`);
  console.log(`    min=${s.min}ms  p50=${s.p50}ms  p95=${s.p95}ms  p99=${s.p99}ms  max=${s.max}ms  avg=${s.avg}ms`);
}

// ── BEFORE: DB full scan ──────────────────────────────────────────────────────

async function seedPositions(pg: Client, count: number): Promise<void> {
  await pg.query(`DELETE FROM positions WHERE ticker = '${TEST_TICKER}'`);
  if (count === 0) return;

  const values: string[] = [];
  for (let i = 1; i <= count; i++) {
    values.push(
      `(1, '${TEST_TICKER}', 'LONG', '0.01', 50000000, 1000000, 1, 'OPEN', 0, NOW())`,
    );
  }
  await pg.query(
    `INSERT INTO positions (user_id, ticker, direction, quantity, average_price, margin, leverage, status, version, opened_at)
     VALUES ${values.join(',')}`,
  );
}

async function measureDbScan(pg: Client, rowCount: number): Promise<number[]> {
  await seedPositions(pg, rowCount);
  const latencies: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = Date.now();
    await pg.query(`SELECT * FROM positions WHERE status = 'OPEN'`);
    latencies.push(Date.now() - start);
  }

  await pg.query(`DELETE FROM positions WHERE ticker = '${TEST_TICKER}'`);
  return latencies;
}

async function measureNRedisGets(redis: Redis, n: number): Promise<number[]> {
  // Simulate old approach: N individual GET coin:price:{ticker} calls per scan cycle
  // Cap at 200 iterations for large N to keep benchmark time reasonable
  const iters = n >= 1_000 ? 20 : ITERATIONS;
  const seedCount = Math.min(n, 100);
  for (let i = 0; i < seedCount; i++) {
    await redis.set(`coin:price:BENCH-${i}`, '{"tradePrice":50000000}', 'EX', 60);
  }

  const latencies: number[] = [];
  for (let i = 0; i < iters; i++) {
    const start = Date.now();
    for (let j = 0; j < n; j++) {
      await redis.get(`coin:price:BENCH-${j % seedCount}`);
    }
    latencies.push(Date.now() - start);
  }

  for (let i = 0; i < seedCount; i++) await redis.del(`coin:price:BENCH-${i}`);
  return latencies;
}

// ── AFTER: Pub/Sub + ZRANGEBYSCORE ───────────────────────────────────────────

async function measurePubSubLatency(pub: Redis, sub: Redis): Promise<number[]> {
  const latencies: number[] = [];
  await sub.subscribe(CHANNEL);

  for (let i = 0; i < ITERATIONS; i++) {
    const payload = JSON.stringify({ market: TEST_TICKER, tradePrice: 50_000_000 + i });
    await new Promise<void>((resolve) => {
      const start = Date.now();
      sub.once('message', () => { latencies.push(Date.now() - start); resolve(); });
      pub.publish(CHANNEL, payload);
    });
  }

  sub.unsubscribe(CHANNEL);
  return latencies;
}

async function measureZrangebyscore(redis: Redis, size: number): Promise<number[]> {
  const key = `liq:${TEST_TICKER}:LONG`;
  await redis.del(key);

  const args: (string | number)[] = [];
  for (let i = 1; i <= size; i++) {
    args.push(60_000_000 + i * 1000, `pos_${i}`);
  }
  await (redis as any).zadd(key, ...args);

  const latencies: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = Date.now();
    await redis.zrangebyscore(key, 50_000_000, '+inf');
    latencies.push(Date.now() - start);
  }

  await redis.del(key);
  return latencies;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pub = new Redis(REDIS_URL);
  const sub = new Redis(REDIS_URL);
  const bench = new Redis(REDIS_URL);
  const pg = new Client(PG_CONFIG);
  await pg.connect();

  try {
    const sizes = [100, 1_000, 10_000];

    console.log('');
    console.log('=== Liquidation Detection Latency Benchmark ===');
    console.log(`Redis: ${REDIS_URL}  PostgreSQL: ${PG_CONFIG.host}:${PG_CONFIG.port}  Iterations: ${ITERATIONS}`);
    console.log('');

    // ── BEFORE ───────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━  BEFORE (Polling, 1s interval)  ━━━━━━━━━━━━━━━━');
    console.log('');

    console.log('  [DB] SELECT * FROM positions WHERE status=\'OPEN\' (full scan)');
    const dbStatsBySize: Record<number, ReturnType<typeof stats>> = {};
    for (const size of sizes) {
      process.stdout.write(`    seeding ${size.toLocaleString()} rows...`);
      const latencies = await measureDbScan(pg, size);
      dbStatsBySize[size] = stats(latencies);
      process.stdout.write(' done\n');
      printStats(`DB scan (${size.toLocaleString()} rows)`, dbStatsBySize[size]);
    }
    console.log('');

    console.log('  [Redis] N individual GET coin:price:{ticker} per scan cycle');
    const redisGetStatsBySize: Record<number, ReturnType<typeof stats>> = {};
    for (const size of sizes) {
      const latencies = await measureNRedisGets(bench, size);
      redisGetStatsBySize[size] = stats(latencies);
      printStats(`${size.toLocaleString()} sequential GETs`, redisGetStatsBySize[size]);
    }
    console.log('');

    console.log('  [Polling delay] Detection lag from setInterval(1000ms):');
    console.log('    Uniform distribution [0ms, 1000ms] → avg=500ms, p99=990ms');
    console.log('');

    // ── AFTER ────────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━  AFTER  (Event-Driven)  ━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    console.log('  [Redis] Pub/Sub round-trip (ticker event → handler invocation)');
    const pubSubLatencies = await measurePubSubLatency(pub, sub);
    const pubSubStats = stats(pubSubLatencies);
    printStats('Pub/Sub', pubSubStats);
    console.log('');

    console.log('  [Redis] ZRANGEBYSCORE liq:{ticker}:{dir} (O(log N) range query)');
    const zrangeStatsBySize: Record<number, ReturnType<typeof stats>> = {};
    for (const size of sizes) {
      const latencies = await measureZrangebyscore(bench, size);
      zrangeStatsBySize[size] = stats(latencies);
      printStats(`ZRANGEBYSCORE (${size.toLocaleString()} entries)`, zrangeStatsBySize[size]);
    }
    console.log('');

    // ── Comparison table ──────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━  Comparison (p50, N = open positions)  ━━━━━━━━━');
    console.log('');
    console.log(`  ${'N'.padEnd(8)} ${'BEFORE total'.padEnd(20)} ${'AFTER total'.padEnd(18)} Speedup`);
    console.log(`  ${'─'.repeat(62)}`);

    for (const size of sizes) {
      const beforeTotal = 500 + dbStatsBySize[size].p50 + redisGetStatsBySize[size].p50;
      const afterTotal  = pubSubStats.p50 + zrangeStatsBySize[size].p50;
      const speedup     = Math.round(beforeTotal / Math.max(afterTotal, 1));
      const beforeStr   = `~${beforeTotal}ms (500ms poll + ${dbStatsBySize[size].p50}ms DB + ${redisGetStatsBySize[size].p50}ms×N GETs)`;
      console.log(
        `  ${String(size.toLocaleString()).padEnd(8)} ${beforeStr.padEnd(20)}\n  ${''.padEnd(8)} → After: ${afterTotal}ms (${pubSubStats.p50}ms pubsub + ${zrangeStatsBySize[size].p50}ms zrange)  ~${speedup}x faster`,
      );
      console.log('');
    }

    const r1k = {
      before: 500 + dbStatsBySize[1_000].p50 + redisGetStatsBySize[1_000].p50,
      after:  pubSubStats.p50 + zrangeStatsBySize[1_000].p50,
    };
    console.log(`  ▶ Representative result (1,000 open positions):`);
    console.log(`    Before: ~${r1k.before}ms  →  After: ~${r1k.after}ms`);
    console.log(`    Detection latency reduced by ~${Math.round(r1k.before / Math.max(r1k.after, 1))}x`);
    console.log(`    DB queries per tick: O(N) rows  →  0 rows`);
    console.log('');
  } finally {
    await pg.end();
    pub.disconnect();
    sub.disconnect();
    bench.disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
