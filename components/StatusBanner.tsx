import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { AlertTriangle } from 'lucide-react';

/**
 * StatusBanner — Layer 1
 */

interface StatusBannerProps {
  userId: string;
}

const StatusBanner: React.FC<StatusBannerProps> = ({ userId }) => {
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
  }, [userId]);

  if (!hasActiveIncident) return null;

  return (
    <div className="flex items-center space-x-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-medium">
      <AlertTriangle className="w-3.5 h-3.5" />
      <span>We're experiencing issues — our team is investigating</span>
    </div>
  );
};

export default StatusBanner;
