// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import AdminCortesiasCatalogPage from "../AdminCortesiasCatalogPage.jsx";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "11111111-1111-4111-8111-111111111111";
const auth = vi.hoisted(() => ({ branchIds: [], roles: ["super_admin"] }));
const api = vi.hoisted(() => ({
  createAdminCortesia: vi.fn(), listAdminCortesias: vi.fn(), setAdminCortesiaEstado: vi.fn(), updateAdminCortesia: vi.fn(),
}));
const branchesApi = vi.hoisted(() => ({ listAdminSucursales: vi.fn() }));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../../../../context/AuthContext.jsx", () => ({ useAuth: () => auth }));
vi.mock("../../../../context/NotificationsContext.jsx", () => ({ useNotifications: () => notifications }));
vi.mock("../../lib/adminCortesiasApi.js", () => api);
vi.mock("../../lib/adminSucursalesApi.js", () => branchesApi);
vi.mock("../../../../lib/catalogSync.js", () => ({ emitCatalogSync: vi.fn() }));

const courtesy = {
  id: ID, nombre: "Corte gratis", descripcion: "Original",
  sucursales: [{ id: "21111111-1111-4111-8111-111111111111", id_sucursal: A, nombre_sucursal: "Centro", activa: true, created_at: null, updated_at: null }],
};

async function renderReady() {
  render(<AdminCortesiasCatalogPage />);
  await screen.findByText("Corte gratis");
}

async function openEdit() {
  await renderReady();
  fireEvent.click(screen.getByTitle("Editar cortesía maestra"));
  return screen.getByRole("dialog", { name: "Editar cortesía maestra" });
}

beforeEach(() => {
  auth.branchIds = [];
  auth.roles = ["super_admin"];
  Object.values(api).forEach((mock) => mock.mockReset());
  Object.values(notifications).forEach((mock) => mock.mockReset());
  branchesApi.listAdminSucursales.mockReset();
  branchesApi.listAdminSucursales.mockResolvedValue({ data: { sucursales: [
    { id_sucursal: A, nombre_sucursal: "Centro", estado: true },
    { id_sucursal: B, nombre_sucursal: "Norte", estado: true },
  ] } });
  api.listAdminCortesias.mockResolvedValue({ data: { cortesias: [courtesy] } });
  api.updateAdminCortesia.mockResolvedValue({ data: courtesy });
  api.createAdminCortesia.mockResolvedValue({ data: courtesy });
  api.setAdminCortesiaEstado.mockResolvedValue({ data: courtesy });
});

afterEach(() => cleanup());

describe("edición segura de cortesías", () => {
  test.each([["Nombre", "Corte global"], ["Descripción", "Descripción global"]])("cambiar %s muestra advertencia global", async (label, value) => {
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText(new RegExp(label)), { target: { value } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByRole("dialog", { name: "Modificar información global" })).toHaveTextContent("todas las sucursales");
    expect(api.updateAdminCortesia).not.toHaveBeenCalled();
  });

  test("cancelar conserva formulario y no llama API", async () => {
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText(/Nombre/), { target: { value: "Cambio pendiente" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    const confirm = screen.getByRole("dialog", { name: "Modificar información global" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByDisplayValue("Cambio pendiente")).toBeInTheDocument();
    expect(api.updateAdminCortesia).not.toHaveBeenCalled();
  });

  test("confirmar ejecuta un PATCH sin asociaciones innecesarias", async () => {
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText(/Nombre/), { target: { value: "Corte global" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    const confirm = screen.getByRole("dialog", { name: "Modificar información global" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Confirmar cambios" }));
    await waitFor(() => expect(api.updateAdminCortesia).toHaveBeenCalledTimes(1));
    expect(api.updateAdminCortesia).toHaveBeenCalledWith(ID, { nombre: "Corte global", descripcion: "Original" });
  });

  test("valores maestros equivalentes normalizados no muestran advertencia", async () => {
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText(/Nombre/), { target: { value: "  Corte gratis  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.updateAdminCortesia).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Modificar información global" })).not.toBeInTheDocument();
  });

  test("desmarcar asociación envía inactivación explícita y omite otras sucursales", async () => {
    const dialog = await openEdit();
    fireEvent.click(within(dialog).getByLabelText("Centro"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.updateAdminCortesia).toHaveBeenCalledTimes(1));
    expect(api.updateAdminCortesia).toHaveBeenCalledWith(ID, expect.objectContaining({ sucursales: [{ id_sucursal: A, activa: false }] }));
    expect(api.updateAdminCortesia.mock.calls[0][1].sucursales).not.toEqual(expect.arrayContaining([expect.objectContaining({ id_sucursal: B })]));
  });

  test("error HTTP conserva formulario y presenta mensaje funcional", async () => {
    api.updateAdminCortesia.mockRejectedValue({ data: { error: { message: "No fue posible guardar" } } });
    const dialog = await openEdit();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible guardar");
    expect(screen.getByRole("dialog", { name: "Editar cortesía maestra" })).toBeInTheDocument();
  });

  test("crear conserva sucursales y no muestra advertencia global", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Nueva maestra" }));
    const dialog = screen.getByRole("dialog", { name: "Nueva cortesía maestra" });
    fireEvent.change(within(dialog).getByLabelText(/Nombre/), { target: { value: "Nueva cortesía" } });
    fireEvent.click(within(dialog).getByLabelText("Centro"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear cortesía maestra" }));
    await waitFor(() => expect(api.createAdminCortesia).toHaveBeenCalledTimes(1));
    expect(api.createAdminCortesia.mock.calls[0][0].sucursales).toEqual([{ id_sucursal: A, activa: true }]);
    expect(screen.queryByRole("dialog", { name: "Modificar información global" })).not.toBeInTheDocument();
  });

  test("cambio de estado independiente conserva su endpoint", async () => {
    await renderReady();
    fireEvent.click(screen.getByTitle("Inactivar en esta sucursal"));
    const confirm = screen.getByRole("dialog", { name: "Inactivar cortesía en sucursal" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Inactivar" }));
    await waitFor(() => expect(api.setAdminCortesiaEstado).toHaveBeenCalledWith(ID, { id_sucursal: A, activa: false }));
  });
});
