'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, SessionContext, setSessionAccount, type SessionUser } from '../lib/client';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    try { const data = await api<{ user: SessionUser }>('/api/me'); if (version === generation.current) { setSessionAccount(data.user.id); setUser(data.user); } }
    catch { if (version === generation.current) setUser(null); }
    finally { if (version === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    // This effect subscribes to the remote session; state updates follow the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const expired = () => { generation.current++; setUser(null); setLoading(false); };
    const focus = () => { if (document.visibilityState === 'visible') void reload(); };
    window.addEventListener('teumgil:session-expired', expired);
    window.addEventListener('focus', focus);
    return () => { window.removeEventListener('teumgil:session-expired', expired); window.removeEventListener('focus', focus); };
  }, [reload]);
  return <SessionContext value={{ user, loading, reload }}>{children}</SessionContext>;
}
