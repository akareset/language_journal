import { useCallback, useEffect, useRef, useState } from 'react';
import { journalStats, retryAnalysis } from './storage';
import type { JournalStats } from './analytics';
export function useJournalStats() {
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(false), generation = useRef(0);
  const refresh = useCallback(async () => {
    const revision = ++generation.current;
    try {
      const next = await journalStats();
      if (alive.current && revision === generation.current) { setStats(next); setError(null); }
    } catch (e) { if (alive.current && revision === generation.current) setError(String(e)); }
  }, []);
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; generation.current++; }; }, [refresh]);
  useEffect(() => {
    if (!stats || stats.analysis.error || (!stats.pendingNotes && !stats.analysis.running)) return;
    const timer = setTimeout(() => void refresh(), 1500);
    return () => clearTimeout(timer);
  }, [stats, refresh]);
  const retry = async () => { try { await retryAnalysis(); await refresh(); } catch(e) { setError(String(e)); } };
  return {stats, error, refresh, retry};
}
