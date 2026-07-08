import { normalizeBookingParticipant } from './bookingModels.js';

export function buildBookingParticipantsSummary(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).map((block, index) => normalizeBookingParticipant(block, index));
}

export function getTitularParticipant(participants = []) {
  return (Array.isArray(participants) ? participants : []).find((participant) => Number(participant?.order || 0) === 1) || null;
}

export function getCompanionParticipants(participants = []) {
  return (Array.isArray(participants) ? participants : []).filter((participant) => Number(participant?.order || 0) > 1);
}
