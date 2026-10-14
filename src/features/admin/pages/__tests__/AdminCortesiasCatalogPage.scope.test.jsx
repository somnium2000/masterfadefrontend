// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
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

afterEach(() => { cleanup(); vi.useRealTimers(); });

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const result = (nombre) => ({ data: { cortesias: [{ ...courtesy, nombre }] } });
const selectBranch = (value) => fireEvent.change(screen.getByLabelText("Sucursal"), { target: { value } });

describe("concurrencia y selección por alcance", () => {
  test.each(["resolve", "reject"])('A → B descarta respuesta/error tardío A: %s', async (outcome) => {
    await renderReady();
    const a = deferred();
    api.listAdminCortesias.mockReturnValueOnce(a.promise).mockResolvedValueOnce(result("Cortesía B"));
    selectBranch(A);
    selectBranch(B);
    await screen.findByText("Cortesía B");
    await act(async () => outcome === "resolve" ? a.resolve(result("Cortesía A vieja")) : a.reject({ status: 500 }));
    expect(screen.getByText("Cortesía B")).toBeInTheDocument();
    expect(screen.queryByText("Cortesía A vieja")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("respuesta A no libera loading de B", async () => {
    await renderReady();
    const a = deferred(); const b = deferred();
    api.listAdminCortesias.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    selectBranch(A); selectBranch(B);
    await act(async () => a.resolve(result("Anterior")));
    expect(screen.getByText("Cargando cortesías...")).toBeInTheDocument();
    await act(async () => b.resolve(result("Vigente")));
    expect(screen.getByText("Vigente")).toBeInTheDocument();
  });

  test.each(["resolve", "reject"])('desmontaje descarta respuesta tardía: %s', async (outcome) => {
    const pending = deferred();
    api.listAdminCortesias.mockReturnValueOnce(pending.promise);
    const view = render(<AdminCortesiasCatalogPage />);
    view.unmount();
    await act(async () => outcome === "resolve" ? pending.resolve(result("Anterior")) : pending.reject(new Error("interno")));
    expect(screen.queryByText("Anterior")).not.toBeInTheDocument();
    expect(notifications.error).not.toHaveBeenCalled();
  });

  test("admin múltiple no ofrece Todas y requiere una sucursal", async () => {
    auth.roles = ["admin"]; auth.branchIds = [A, B];
    render(<AdminCortesiasCatalogPage />);
    await screen.findByRole("option", { name: "Centro" });
    expect(screen.queryByRole("option", { name: "Todas las sucursales" })).not.toBeInTheDocument();
    expect(api.listAdminCortesias).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Nueva maestra" })).toBeDisabled();
    selectBranch(A);
    await screen.findByText("Corte gratis");
    expect(api.listAdminCortesias).toHaveBeenCalledExactlyOnceWith({ id_sucursal: A, buscar: undefined });
  });

  test("admin sin sucursales no ve opciones ajenas ni puede crear", async () => {
    auth.roles = ["admin"];
    render(<AdminCortesiasCatalogPage />);
    await screen.findByRole("combobox", { name: "Sucursal" });
    expect(screen.queryByRole("option", { name: "Centro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Norte" })).not.toBeInTheDocument();
    expect(api.listAdminCortesias).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Nueva maestra" })).toBeDisabled();
  });

  test("admin de una sucursal conserva selección automática", async () => {
    auth.roles = ["admin"]; auth.branchIds = [A];
    await renderReady();
    expect(api.listAdminCortesias).toHaveBeenCalledExactlyOnceWith({ id_sucursal: A, buscar: undefined });
    expect(screen.getByText("Sucursal activa:")).toBeInTheDocument();
  });

  test("cambio de permisos invalida datos y respuesta pendiente del alcance anterior", async () => {
    const pending = deferred();
    api.listAdminCortesias.mockReturnValueOnce(pending.promise);
    const view = render(<AdminCortesiasCatalogPage />);
    auth.roles = ["admin"]; auth.branchIds = [];
    view.rerender(<AdminCortesiasCatalogPage />);
    await act(async () => pending.resolve(result("Global anterior")));
    expect(screen.queryByText("Global anterior")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva maestra" })).toBeDisabled();
  });

  test("búsqueda invalida inmediatamente y debounce agrupa entradas rápidas", async () => {
    await renderReady();
    vi.useFakeTimers();
    const old = deferred();
    api.listAdminCortesias.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result("Resultado abc"));
    const input = screen.getByPlaceholderText("Buscar por nombre o descripción");
    fireEvent.change(input, { target: { value: "a" } });
    await act(async () => { vi.advanceTimersByTime(250); });
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.change(input, { target: { value: "abc" } });
    await act(async () => old.resolve(result("Resultado a viejo")));
    expect(screen.queryByText("Resultado a viejo")).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(screen.getByText("Resultado abc")).toBeInTheDocument();
    expect(api.listAdminCortesias.mock.calls.map(([args]) => args.buscar)).toEqual([undefined, "a", "abc"]);
  });

  test("StrictMode conserva global y descarta respuesta del montaje anterior", async () => {
    const old = deferred();
    api.listAdminCortesias.mockReturnValueOnce(old.promise).mockResolvedValue(result("Vigente"));
    render(<StrictMode><AdminCortesiasCatalogPage /></StrictMode>);
    await screen.findByText("Vigente");
    await act(async () => old.resolve(result("Vieja")));
    expect(screen.queryByText("Vieja")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Todas las sucursales" })).toBeInTheDocument();
  });

  test("reintentos concurrentes de la misma consulta conservan solo el último resultado", async () => {
    api.listAdminCortesias.mockRejectedValueOnce({ status: 500 });
    render(<AdminCortesiasCatalogPage />);
    const retry = await screen.findByRole("button", { name: /Reintentar/ });
    const old = deferred();
    api.listAdminCortesias.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result("Recuperada"));
    act(() => { fireEvent.click(retry); fireEvent.click(retry); });
    await screen.findByText("Recuperada");
    await act(async () => old.resolve(result("Reintento viejo")));
    expect(screen.queryByText("Reintento viejo")).not.toBeInTheDocument();
    expect(api.listAdminCortesias).toHaveBeenCalledTimes(3);
  });

  test("reducción de claims en la misma sucursal invalida la consulta anterior", async () => {
    auth.roles = ["admin"]; auth.branchIds = [A, B];
    const old = deferred();
    api.listAdminCortesias.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result("Solo A"));
    const view = render(<AdminCortesiasCatalogPage />);
    await screen.findByRole("option", { name: "Centro" });
    selectBranch(A);
    auth.branchIds = [A];
    view.rerender(<AdminCortesiasCatalogPage />);
    await screen.findByText("Solo A");
    await act(async () => old.resolve(result("Alcance anterior")));
    expect(screen.queryByText("Alcance anterior")).not.toBeInTheDocument();
    expect(screen.getByText("Solo A")).toBeInTheDocument();
  });

  test("pérdida del rol admin limpia datos y cierra edición aunque conserve branch_ids", async () => {
    auth.roles = ["admin"]; auth.branchIds = [A];
    const view = render(<AdminCortesiasCatalogPage />);
    await screen.findByText("Corte gratis");
    fireEvent.click(screen.getByTitle("Editar cortesía maestra"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    auth.roles = ["cliente"];
    view.rerender(<AdminCortesiasCatalogPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Corte gratis")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva maestra" })).toBeDisabled();
    expect(api.listAdminCortesias).toHaveBeenCalledTimes(1);
    expect(api.updateAdminCortesia).not.toHaveBeenCalled();
  });

  test("duplicado conserva mensaje funcional y formulario", async () => {
    api.updateAdminCortesia.mockRejectedValueOnce({ status: 409, data: { error: { code: "CORTESIA_NAME_DUPLICATE" } } });
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText(/Nombre/), { target: { value: "Duplicada" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Modificar información global" })).getByRole("button", { name: "Confirmar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una cortesía con ese nombre");
    expect(screen.getByRole("dialog", { name: "Editar cortesía maestra" })).toBeInTheDocument();
  });
});

describe("edición segura de cortesías", () => {
  test("inicia en lista y alterna a tarjetas con el mismo registro", async () => {
    await renderReady();
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Lista de cortesías" })).toHaveTextContent("Corte gratis");
    fireEvent.click(screen.getByRole("button", { name: "Tarjetas" }));
    expect(screen.getByRole("button", { name: "Tarjetas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Tarjetas de cortesías" })).toHaveTextContent("Corte gratis");
  });

  test("distingue asociaciones totales y activas", async () => {
    api.listAdminCortesias.mockResolvedValue({ data: { cortesias: [{
      ...courtesy,
      sucursales: [
        courtesy.sucursales[0],
        { id: "31111111-1111-4111-8111-111111111111", id_sucursal: B, nombre_sucursal: "Norte", activa: false },
      ],
    }] } });
    await renderReady();
    expect(screen.getByText("2 asociada(s)")).toBeInTheDocument();
    expect(screen.getByText("1 activa(s)")).toBeInTheDocument();
  });

  test("pagina localmente diez registros sin solicitar otra página", async () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      ...courtesy,
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      nombre: `Cortesía ${index + 1}`,
    }));
    api.listAdminCortesias.mockResolvedValue({ data: { cortesias: rows } });
    render(<AdminCortesiasCatalogPage />);
    expect(await screen.findByText("Cortesía 1")).toBeInTheDocument();
    expect(screen.queryByText("Cortesía 11")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(await screen.findByText("Cortesía 11")).toBeInTheDocument();
    expect(api.listAdminCortesias).toHaveBeenCalledTimes(1);
  });

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
    expect(api.updateAdminCortesia).toHaveBeenCalledWith(ID, { nombre: "Corte global" });
  });

  test("valores maestros equivalentes normalizados no ejecutan PATCH", async () => {
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText(/Nombre/), { target: { value: "  Corte gratis  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.updateAdminCortesia).not.toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Modificar información global" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Editar cortesía maestra" })).not.toBeInTheDocument();
  });

  test("desmarcar asociación envía inactivación explícita y omite otras sucursales", async () => {
    const dialog = await openEdit();
    fireEvent.click(within(dialog).getByLabelText("Centro"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.updateAdminCortesia).toHaveBeenCalledTimes(1));
    expect(api.updateAdminCortesia).toHaveBeenCalledWith(ID, expect.objectContaining({ sucursales: [{ id_sucursal: A, activa: false }] }));
    expect(api.updateAdminCortesia.mock.calls[0][1]).not.toHaveProperty("nombre");
    expect(api.updateAdminCortesia.mock.calls[0][1]).not.toHaveProperty("descripcion");
    expect(api.updateAdminCortesia.mock.calls[0][1].sucursales).not.toEqual(expect.arrayContaining([expect.objectContaining({ id_sucursal: B })]));
  });

  test("editar solo descripcion omite nombre", async () => {
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText("Descripción"), { target: { value: "Nueva descripción" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    const confirm = screen.getByRole("dialog", { name: "Modificar información global" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Confirmar cambios" }));
    await waitFor(() => expect(api.updateAdminCortesia).toHaveBeenCalledTimes(1));
    expect(api.updateAdminCortesia).toHaveBeenCalledWith(ID, { descripcion: "Nueva descripción" });
  });

  test("error HTTP conserva formulario y presenta mensaje funcional", async () => {
    api.updateAdminCortesia.mockRejectedValue({ data: { error: { message: "No fue posible guardar" } } });
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText("Descripción"), { target: { value: "Cambio con error" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    const confirm = screen.getByRole("dialog", { name: "Modificar información global" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Confirmar cambios" }));
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
