import { useState } from 'react';
import { Dialog } from '../ui/dialog.jsx';
import ActionConfirmDialog from './ActionConfirmDialog.jsx';

const SET_FIELDS = new Set(['roles', 'selectedIds', 'sucursales', 'ofertas', 'createBranchTariffs', 'items', 'beneficios']);

function snapshot(values, field = '') {
  if (Array.isArray(values)) {
    const entries = values.map((value) => snapshot(value));
    return JSON.stringify(SET_FIELDS.has(field) ? entries.sort() : entries);
  }
  if (values && typeof values === 'object') {
    return JSON.stringify(Object.keys(values).sort().map((key) => [key, snapshot(values[key], key)]));
  }
  return JSON.stringify(typeof values === 'number' ? String(values) : values);
}

function OpenFormDialog({ values, saving, onOpenChange, children }) {
  // AM: La captura pertenece a esta apertura; errores y confirmaciones no remontan el formulario.
  const [initialValues] = useState(() => snapshot(values));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dirty = initialValues !== snapshot(values);

  function requestOpenChange(nextOpen) {
    if (saving) return;
    if (!nextOpen && dirty) {
      setConfirmOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  }

  return (
    <>
      <Dialog open onOpenChange={requestOpenChange}>{children}</Dialog>
      <ActionConfirmDialog
        open={confirmOpen}
        onOpenChange={(nextOpen) => { if (!saving) setConfirmOpen(nextOpen); }}
        title="¿Descartar los cambios?"
        description="Los cambios sin guardar se perderán. Puedes seguir editando para conservarlos."
        cancelLabel="Seguir editando"
        confirmLabel="Descartar cambios"
        loading={saving}
        onConfirm={() => { if (!saving) onOpenChange(false); }}
      />
    </>
  );
}

export default function UnsavedChangesDialog({ open, ...props }) {
  return open ? <OpenFormDialog {...props} /> : null;
}
