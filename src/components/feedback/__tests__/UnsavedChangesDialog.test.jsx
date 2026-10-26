// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import UnsavedChangesDialog from '../UnsavedChangesDialog.jsx';
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../ui/dialog.jsx';
import { Button } from '../../ui/button.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Form({ save = async () => {}, initial = { nombre: 'Inicial', roles: ['admin', 'barbero'] } }) {
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setSaving(true);
    setError('');
    try { await save(values); setOpen(false); } catch { setError('No se pudo guardar'); }
    finally { setSaving(false); }
  }
  return (
    <>
      <Button onClick={() => { setValues(initial); setOpen(true); }}>Abrir</Button>
      <UnsavedChangesDialog open={open} onOpenChange={setOpen} values={values} saving={saving}>
        <DialogContent>
          <DialogTitle>Formulario</DialogTitle><DialogDescription>Editar datos de prueba</DialogDescription>
          <label>Nombre<input value={values.nombre} onChange={(e) => setValues({ ...values, nombre: e.target.value })} /></label>
          <Button onClick={() => setValues({ ...values, roles: [...values.roles].reverse() })}>Reordenar roles</Button>
          <DialogClose asChild><Button disabled={saving}>Cancelar</Button></DialogClose>
          <Button disabled={saving} onClick={submit}>Guardar</Button>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </UnsavedChangesDialog>
    </>
  );
}

async function closeBy(method) {
  if (method === 'Escape') fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
  else if (method === 'fuera') {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' });
    fireEvent.click(document.body);
  } else fireEvent.click(within(screen.getByRole('dialog', { name: 'Formulario' })).getByRole('button', { name: method }));
}

for (const width of [390, 1280]) {
  for (const method of ['Cerrar', 'Cancelar', 'Escape', 'fuera']) {
    test(`${width}px: ${method} sin cambios cierra normalmente`, async () => {
      vi.stubGlobal('innerWidth', width);
      vi.stubGlobal('PointerEvent', MouseEvent);
      render(<Form />);
      await closeBy(method);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Formulario' })).not.toBeInTheDocument());
      expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
    });

    test(`${width}px: ${method} con cambios conserva datos hasta descarte explícito`, async () => {
      vi.stubGlobal('innerWidth', width);
      vi.stubGlobal('PointerEvent', MouseEvent);
      render(<Form />);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Modificado' } });
      await closeBy(method);
      await screen.findByRole('dialog', { name: '¿Descartar los cambios?' });
      fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
      expect(await screen.findByLabelText('Nombre')).toHaveValue('Modificado');
      await closeBy(method);
      fireEvent.click(await screen.findByRole('button', { name: 'Descartar cambios' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
      expect(screen.getByLabelText('Nombre')).toHaveValue('Inicial');
    });
  }
}

test('restaurar el valor inicial y reordenar roles no genera cambios pendientes', async () => {
  render(<Form />);
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otro' } });
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Inicial' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reordenar roles' }));
  await closeBy('Cancelar');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('guardar bloquea X, Escape y fuera; éxito cierra sin advertencia', async () => {
  let resolve;
  const save = vi.fn(() => new Promise((done) => { resolve = done; }));
  vi.stubGlobal('PointerEvent', MouseEvent);
  render(<Form save={save} />);
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Guardado' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  for (const method of ['Cerrar', 'Escape', 'fuera']) await closeBy(method);
  expect(screen.getByLabelText('Nombre')).toHaveValue('Guardado');
  expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  await act(async () => resolve());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(save).toHaveBeenCalledTimes(1);
});

test('error de guardado conserva datos y permite reintentar o seguir editando', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('sintético')).mockResolvedValueOnce({});
  render(<Form save={save} />);
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Conservar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Nombre')).toHaveValue('Conservar');
  await closeBy('Cancelar');
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(save).toHaveBeenCalledTimes(2);
});

test('cerrar la confirmación con Escape conserva el formulario y sus datos', async () => {
  render(<Form />);
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Conservar' } });
  await closeBy('Cerrar');
  fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
  expect(await screen.findByRole('dialog', { name: 'Formulario' })).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre')).toHaveValue('Conservar');
});
