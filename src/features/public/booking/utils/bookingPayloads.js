export function buildBookingSelectionFingerprint(bookingBlocksSummary) {
  return JSON.stringify(
    bookingBlocksSummary.map((block) => ({
      id: block.id,
      idBarbero: block.idBarbero,
      selectedDate: block.selectedDate,
      selectedTime: block.selectedTime,
      selectedDateTime: block.selectedDateTime,
      selection_type: block.selection_type,
      packageId: block.selectedPackage?.id_paquete || '',
      serviceIds: Array.isArray(block.selectedServiceIdsEffective) ? block.selectedServiceIdsEffective : [],
      promotionIds: Array.isArray(block.promotionIds) ? block.promotionIds : [],
    }))
  );
}
