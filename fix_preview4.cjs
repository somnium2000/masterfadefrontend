const fs = require('fs');
const path = 'src/features/admin/pages/AdminCitasPreviewPage.jsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// Keep everything up to and including line 1264 (0-indexed: 1263), which ends with `    }),`
// That line is the close of the useMemo object literal: `    }),`
const keepUntil = 1263; // 0-indexed

const keptLines = lines.slice(0, keepUntil + 1);

const newTail = `    [
      activeBlock,
      effectiveActiveBlockIndex,
      addCompanionBlock,
      allBlocksComplete,
      allowCompanions,
      availabilityError,
      availabilityLoading,
      availabilityMap,
      barbers,
      barbersLoading,
      bookingBlocks,
      bookingBlocksSummary,
      branchList,
      canAddCompanionBlock,
      canGoPrevMonth,
      contextData,
      currentMonth,
      fetchAvailability,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      holdDurationMin,
      holdResult,
      holdSubmitting,
      isPastSlotForToday,
      minBookingDateKey,
      monthRange,
      onSelectDay,
      onSelectTime,
      paymentRequired,
      selectedBarber,
      selectedBarberId,
      selectedBranch,
      selectedBranchId,
      selectedDate,
      selectedServices,
      selectedTime,
      serviceIds,
      services,
      servicesAtEnd,
      servicesCanScroll,
      servicesLoading,
      setActiveBlock,
      setMonth,
      selectSuggestedBarber,
      slotConflict,
      slotSuggestions,
      slotSuggestionsLoading,
      slots,
      slotsLoading,
      submitHold,
      syncServicesScrollState,
      toggleService,
      totalToPay,
      updateActiveBlockBarber,
      updateBlockAtIndex,
      selectBarber,
      selectBranch,
    ]
  );

  return (
    <div className="mf-page citas-page public-booking-page public-booking-preview-scope">
      <div className="citas-toolbar">
        <span className="citas-mode-pill">Modo Vista Previa - Simulacion (sin hold real)</span>
        <div className="citas-stepper">
          {PREVIEW_STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              className={\`citas-step-btn \${previewStep === step.id ? 'is-active' : ''}\`}
              disabled={!previewCanOpenStep[step.id]}
              onClick={() => selectPreviewStep(step.id)}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {contextLoading ? (
        <div className="citas-surface p-6">
          <LoadingSpinner />
        </div>
      ) : null}
      {contextError ? <ErrorBanner message={contextError} onRetry={fetchContext} /> : null}

      {!contextLoading && !contextError ? (
        <div className="public-booking-main">
          <PublicBookingProvider value={contextValue}>
            {previewStep === 'barberos' ? <PublicBookingBarberosStep /> : null}
            {previewStep === 'agenda' ? <PublicBookingAgendaStep /> : null}
            {previewStep === 'confirmar' ? <PublicBookingConfirmStep /> : null}
          </PublicBookingProvider>
        </div>
      ) : null}
    </div>
  );
}
`;

const result = keptLines.join('\n') + '\n' + newTail;
fs.writeFileSync(path, result, 'utf8');

const finalLines = result.split('\n');
console.log('Done. Total lines:', finalLines.length);
console.log('Line 1264:', finalLines[1263]);
console.log('Line 1265:', finalLines[1264]);
console.log('Last 5 lines:', finalLines.slice(-5).join('\n'));
