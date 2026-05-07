$path = "src\features\admin\pages\AdminCitasPreviewPage.jsx"
$content = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)

# The broken section: from "      setMonth," (in dep array) through the broken JSX
# We need to replace from "      setMonth," onward in the dep array through to
# the correct close of useMemo and then the correct return statement

$broken = "      setMonth,
          <LoadingSpinner />
        </div>
      ) : null}
      {contextError ? <ErrorBanner message={contextError} onRetry={fetchContext} /> : null}

      {!contextLoading && !contextError ? (
        <div className=`"public-booking-main`">
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
"

$fixed = "      setMonth,
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
      selectedServices,
    ]
  );

  return (
    <div className=`"mf-page citas-page public-booking-page public-booking-preview-scope`">
      <div className=`"citas-toolbar`">
        <span className=`"citas-mode-pill`">Modo Vista Previa - Simulacion (sin hold real)</span>
        <div className=`"citas-stepper`">
          {PREVIEW_STEPS.map((step) => (
            <button
              key={step.id}
              type=`"button`"
              className={``citas-step-btn `${previewStep === step.id ? 'is-active' : ''}`"``}
              disabled={!previewCanOpenStep[step.id]}
              onClick={() => selectPreviewStep(step.id)}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {contextLoading ? (
        <div className=`"citas-surface p-6`">
          <LoadingSpinner />
        </div>
      ) : null}
      {contextError ? <ErrorBanner message={contextError} onRetry={fetchContext} /> : null}

      {!contextLoading && !contextError ? (
        <div className=`"public-booking-main`">
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
"

if ($content.Contains($broken)) {
    $content = $content.Replace($broken, $fixed)
    [IO.File]::WriteAllText($path, $content, [Text.Encoding]::UTF8)
    Write-Output "FIXED"
} else {
    Write-Output "NOT FOUND - checking actual content..."
    $idx = $content.IndexOf("      setMonth,")
    if ($idx -ge 0) {
        Write-Output "setMonth found at index $idx"
        Write-Output $content.Substring($idx, [Math]::Min(500, $content.Length - $idx))
    }
}
