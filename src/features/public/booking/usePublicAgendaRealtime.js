import { useEffect, useRef } from 'react';
import { supabase } from '../../../config/supabaseClient.js';

function matchesDateKey(value, dateKey) {
  if (!dateKey) return true;
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return normalized.slice(0, 10) === dateKey;
}

export default function usePublicAgendaRealtime({
  barberId,
  dateKey,
  enabled = true,
  onInvalidate,
}) {
  const invalidateRef = useRef(onInvalidate);

  useEffect(() => {
    invalidateRef.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    if (!enabled || !supabase || !barberId) return undefined;

    let timeoutId = null;
    const scheduleInvalidate = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        invalidateRef.current?.();
      }, 120);
    };

    const handleCitaChange = (payload) => {
      const row = payload?.new && Object.keys(payload.new).length > 0 ? payload.new : payload?.old;
      if (!row) {
        scheduleInvalidate();
        return;
      }
      if (String(row.id_empleado_barbero || '') !== String(barberId)) return;
      if (
        dateKey
        && !matchesDateKey(row.inicio_at, dateKey)
        && !matchesDateKey(row.fin_at, dateKey)
      ) {
        return;
      }
      scheduleInvalidate();
    };

    const handleBloqueoChange = (payload) => {
      const row = payload?.new && Object.keys(payload.new).length > 0 ? payload.new : payload?.old;
      if (!row) {
        scheduleInvalidate();
        return;
      }
      if (String(row.id_empleado || '') !== String(barberId)) return;
      scheduleInvalidate();
    };

    const channel = supabase
      .channel(`public-booking-agenda:${barberId}:${dateKey || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'citas', filter: `id_empleado_barbero=eq.${barberId}` },
        handleCitaChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bloqueos_agenda', filter: `id_empleado=eq.${barberId}` },
        handleBloqueoChange
      )
      .subscribe();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      void supabase.removeChannel(channel);
    };
  }, [barberId, dateKey, enabled]);
}
