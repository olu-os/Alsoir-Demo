import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * StatusBanner — Layer 1
 */

interface StatusBannerProps {
  userId: string;
  currentView: string;
}

const StatusBanner: React.FC<StatusBannerProps> = ({ userId, currentView }) => {
  const [hasActiveIncident, setHasActiveIncident] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const checkStatus = async () => {
      const { data } = await supabase
        .from('incidents')
        .select('id')
        .eq('user_id', userId)
        .in('severity', ['high', 'critical'])
        .eq('status', 'open')
        .limit(1);
      setHasActiveIncident((data ?? []).length > 0);
    };

    checkStatus();

    // Re-check whenever a new incident is created
    const channel = supabase
      .channel(`status_banner:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents', filter: `user_id=eq.${userId}` },
        () => checkStatus()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, currentView]);

  if (!hasActiveIncident || currentView !== 'observability') return null;

  return (
    <div className="relative w-full h-0.5 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #f59e0b 30%, #ef4444 50%, #f59e0b 70%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'sweep 2.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes sweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};

export default StatusBanner;
