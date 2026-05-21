/**
 * Backpressure Baseline — Promise.all 무제한 병렬 실행
 *
 * Story 2 개선 전 정량 지표 측정:
 *   1. 피크 DB 커넥션 수  (pg_stat_activity)
 *   2. 배치 완료 시간     (wall-clock ms)
 *   3. 이벤트 루프 p99 랙 (ms) — API 응답 시간 격리 proxy
 *
 * 시뮬레이션:
 *   forceClose()는 dataSource.transaction() 안에서 SELECT → UPDATE × 2 → INSERT를 실행.
 *   각 트랜잭션이 커넥션을 점유하는 시간 ≈ 실제 DB I/O ≈ pg_sleep(WORK_MS / 1000)으로 근사.
 *
 * 실행:
 *   npx ts-node -r tsconfig-paths/register scripts/measure-backpressure.ts
 */

import { Pool, PoolClient } from 'pg';

const PG_CONFIG = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'coinbattle',
  password: process.env.DB_PASSWORD ?? 'coinbattle',
  database: process.env.DB_NAME ?? 'coinbattle',
  max: 20,
  idleTimeoutMillis: 5000,
};

/** forceClose 1건의 트랜잭션 소요 시간 근사값 (ms). 실측 후 조정 가능. */
const WORK_MS = 60;

/** 동시 실행 건수 시나리오 */
const BATCH_SIZES = [10, 50, 100, 500];

/** 이벤트 루프 측정 간격 */
const LAG_INTERVAL_MS = 20;

/** pg_stat_activity 샘플링 간격 */
const CONN_SAMPLE_INTERVAL_MS = 10;

// ── 통계 유틸 ──────────────────────────────────────────────────────────────────

function pct(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(samples: number[]) {
  if (samples.length === 0) return { min: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const s = [...samples].sort((a, b) => a - b);
  return { min: s[0], p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s[s.length - 1] };
}

// ── 측정 코어 ─────────────────────────────────────────────────────────────────

/**
 * forceClose 1건을 시뮬레이션.
 * 커넥션을 WORK_MS 동안 점유하는 트랜잭션을 BEGIN / pg_sleep / COMMIT으로 근사.
 */
async function simulateForceClose(pool: Pool): Promise<void> {
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_sleep(${(WORK_MS / 1000).toFixed(3)})`);
    await client.query('COMMIT');
  } catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
  } finally {
    client?.release();
  }
}

async function runBatch(
  pool: Pool,
  monitorPool: Pool,
  batchSize: number,
): Promise<{
  peakConnections: number;
  batchMs: number;
  lagSamples: number[];
}> {
  const connSamples: number[] = [];
  const lagSamples: number[] = [];

  // pg_stat_activity 샘플링
  const connTimer = setInterval(async () => {
    try {
      const res = await monitorPool.query<{ cnt: string }>(
        "SELECT count(*)::int AS cnt FROM pg_stat_activity WHERE datname = current_database() AND state = 'active'",
      );
      connSamples.push(Number(res.rows[0].cnt));
    } catch { /* no-op */ }
  }, CONN_SAMPLE_INTERVAL_MS);

  // 이벤트 루프 랙 측정
  let lastTick = Date.now();
  const lagTimer = setInterval(() => {
    const now = Date.now();
    lagSamples.push(Math.max(0, now - lastTick - LAG_INTERVAL_MS));
    lastTick = now;
  }, LAG_INTERVAL_MS);

  const start = Date.now();

  await Promise.all(
    Array.from({ length: batchSize }, () => simulateForceClose(pool)),
  );

  const batchMs = Date.now() - start;

  clearInterval(connTimer);
  clearInterval(lagTimer);

  // 마지막 샘플 수집 대기
  await new Promise((r) => setTimeout(r, 150));

  return {
    peakConnections: Math.max(...connSamples, 0),
    batchMs,
    lagSamples,
  };
}

// ── 출력 ──────────────────────────────────────────────────────────────────────

function printResult(
  batchSize: number,
  peakConnections: number,
  batchMs: number,
  lagStats: ReturnType<typeof stats>,
) {
  console.log(`┌─ batchSize=${batchSize} (Promise.all 무제한) `);
  console.log(`│  피크 DB 커넥션    : ${peakConnections} / ${PG_CONFIG.max}  (풀 포화율 ${Math.round((peakConnections / PG_CONFIG.max) * 100)}%)`);
  console.log(`│  배치 완료 시간    : ${batchMs}ms`);
  console.log(`│  이벤트 루프 랙    : p50=${lagStats.p50}ms  p95=${lagStats.p95}ms  p99=${lagStats.p99}ms  max=${lagStats.max}ms`);
  console.log(`└─ Semaphore(10) 적용 후 예상: 피크 커넥션=10  이벤트 루프 랙 ≈ 0ms`);
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const workPool = new Pool(PG_CONFIG);
  const monitorPool = new Pool({ ...PG_CONFIG, max: 3 });

  console.log('');
  console.log('====================================================');
  console.log(' Backpressure Baseline — Promise.all UNBOUNDED');
  console.log('====================================================');
  console.log(`DB pool max : ${PG_CONFIG.max}`);
  console.log(`Work per task: ~${WORK_MS}ms  (pg_sleep 근사)`);
  console.log(`PG: ${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}`);
  console.log('');

  try {
    for (const batchSize of BATCH_SIZES) {
      process.stdout.write(`측정 중... batchSize=${batchSize}\r`);
      const { peakConnections, batchMs, lagSamples } = await runBatch(workPool, monitorPool, batchSize);
      const lagStats = stats(lagSamples.filter((v) => v > 0));
      printResult(batchSize, peakConnections, batchMs, lagStats);

      // 쿨다운
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log('====================================================');
    console.log(' Story 2 구현 후 이 스크립트를 다시 실행하면');
    console.log(' 피크 커넥션과 이벤트 루프 랙이 개선됨을 확인할 수 있습니다.');
    console.log('====================================================');
    console.log('');
  } finally {
    await workPool.end();
    await monitorPool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
