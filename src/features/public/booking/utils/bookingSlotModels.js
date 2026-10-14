function slotMinutes(slot) {
  const match = String(slot?.hora || '').trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function periodForMinutes(minutes) {
  if (minutes >= 360 && minutes < 720) return 'manana';
  if (minutes >= 720 && minutes < 1080) return 'tarde';
  return 'noche';
}

export function buildPeriodSlotModels({ slots = [], slotsCurated, selectedDate, isPastSlotForToday = () => false }) {
  const models = {};
  for (const periodKey of ['manana', 'tarde', 'noche']) {
    const seen = new Set();
    const ordered = [];
    const append = (candidates) => {
      for (const slot of Array.isArray(candidates) ? candidates : [candidates]) {
        const minutes = slotMinutes(slot);
        if (minutes == null || !slot?.disponible || periodForMinutes(minutes) !== periodKey) continue;
        if (selectedDate && isPastSlotForToday(selectedDate, slot.hora)) continue;
        if (seen.has(minutes)) continue;
        seen.add(minutes);
        ordered.push(slot);
      }
    };
    const curated = slotsCurated?.[periodKey];
    // AM: Backend ranking is authoritative; only legacy/raw fallback is sorted.
    append(curated?.recommended);
    append(Array.isArray(curated?.alternatives) ? curated.alternatives : []);
    append(Array.isArray(curated?.overflow) ? curated.overflow : []);
    append((Array.isArray(slots) ? slots : []).slice().sort((a, b) => (slotMinutes(a) ?? Infinity) - (slotMinutes(b) ?? Infinity)));
    const visibleSlots = ordered.slice(0, 4);
    models[periodKey] = {
      recommended: visibleSlots[0] || null,
      alternatives: visibleSlots.slice(1),
      visibleSlots,
      total: visibleSlots.length,
    };
  }
  return models;
}
