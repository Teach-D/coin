import { useNavigate, useParams } from 'react-router-dom';
import { useBattleResult } from '../hooks/useBattleResult';

export function BattleResultPage() {
  const { battleId } = useParams<{ battleId: string }>();
  const navigate = useNavigate();
  const { data: result, isLoading } = useBattleResult(battleId, true);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0C0C0D] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">결과 불러오는 중...</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[#0C0C0D] flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-500 text-sm">결과를 불러올 수 없습니다</p>
        <button
          onClick={() => navigate('/battles')}
          className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          배틀 목록으로
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0C0C0D] text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate('/battles')}
            className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors text-sm"
          >
            ←
          </button>
          <h1 className="text-sm font-bold text-white">배틀 결과</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full flex-1 p-4 space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          {result.participants.map((p) => (
            <div
              key={p.userId}
              className="flex items-center px-4 py-3 border-b border-zinc-800/60 last:border-0"
            >
              <span className="text-sm font-bold w-8 text-center shrink-0 text-zinc-400">
                {p.rank}위
              </span>
              <span className="text-sm text-white flex-1 truncate ml-3">{p.nickname}</span>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold font-mono ${p.profitRate >= 0 ? 'text-[#2DD4BF]' : 'text-red-400'}`}>
                  {p.profitRate >= 0 ? '+' : ''}{p.profitRate.toFixed(2)}%
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/battles')}
          className="w-full rounded-2xl border border-zinc-700 py-3.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
        >
          배틀 목록으로
        </button>
      </main>
    </div>
  );
}
