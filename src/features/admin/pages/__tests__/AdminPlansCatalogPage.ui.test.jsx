// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import AdminPlansCatalogPage from "../AdminPlansCatalogPage.jsx";

const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const auth = vi.hoisted(() => ({ branchIds: [], roles: ["super_admin"] }));
const plansApi = vi.hoisted(() => ({
  listAdminPlanes: vi.fn(), createAdminPlan: vi.fn(), updateAdminPlan: vi.fn(), setAdminPlanEstado: vi.fn(),
}));
const catalogApi = vi.hoisted(() => ({ listAdminServicios: vi.fn() }));
const courtesiesApi = vi.hoisted(() => ({ listAdminCortesias: vi.fn() }));
const branchesApi = vi.hoisted(() => ({ listAdminSucursales: vi.fn() }));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => ({ ...(await vi.importActual("react-router-dom")), useNavigate: () => navigateMock }));
vi.mock("../../../../context/AuthContext.jsx", () => ({ useAuth: () => auth }));
vi.mock("../../../../context/NotificationsContext.jsx", () => ({ useNotifications: () => notifications }));
vi.mock("../../lib/adminPlansApi.js", () => plansApi);
vi.mock("../../lib/adminCatalogApi.js", () => catalogApi);
vi.mock("../../lib/adminCortesiasApi.js", () => courtesiesApi);
vi.mock("../../lib/adminSucursalesApi.js", () => branchesApi);
vi.mock("../../../../lib/catalogSync.js", () => ({ emitCatalogSync: vi.fn() }));

function makePlan(index, branch = BRANCH_A, overrides = {}) {
  return {
    id_plan: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    id_sucursal: branch,
    nombre_plan: `Plan VIP ${index}`,
    descripcion: `Descripción ${index}`,
    periodo_membresia_codigo: "mensual",
    categoria_nivel: 2,
    precio_hnl: 1000 + index,
    activo: true,
    visible_publico: true,
    orden_visual: index,
    beneficios: [
      { tipo: "servicio", id_servicio: `service-${index}`, nombre: "Corte premium", cantidad: 2 },
      { tipo: "cortesia", id_cortesia: `courtesy-${index}`, nombre: "Bebida", cantidad: 1 },
    ],
    ...overrides,
  };
}

async function renderCatalog(plans) {
  plansApi.listAdminPlanes.mockResolvedValue({ data: { planes: plans } });
  render(<AdminPlansCatalogPage />);
  await screen.findByText(plans[0]?.nombre_plan || "Sin planes configurados");
}

beforeEach(() => {
  auth.user = { id_usuario: "admin-a" };
  auth.branchIds = [];
  auth.roles = ["super_admin"];
  Object.values(plansApi).forEach((mock) => mock.mockReset());
  Object.values(notifications).forEach((mock) => mock.mockReset());
  navigateMock.mockReset();
  catalogApi.listAdminServicios.mockReset().mockResolvedValue({ data: { servicios: [] } });
  courtesiesApi.listAdminCortesias.mockReset().mockResolvedValue({ data: { cortesias: [] } });
  branchesApi.listAdminSucursales.mockReset().mockResolvedValue({ data: { sucursales: [
    { id_sucursal: BRANCH_A, nombre_sucursal: "Centro", estado: true },
    { id_sucursal: BRANCH_B, nombre_sucursal: "Norte", estado: true },
  ] } });
});

afterEach(() => cleanup());

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function openQa07Offer() {
  auth.roles = ["admin"]; auth.branchIds = [BRANCH_A];
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Editar oferta" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Precio/), { target: { value: "1500" } });
  return dialog;
}

test("QA07: mensajes desconocidos no exponen errores técnicos", async () => {
  plansApi.updateAdminPlan.mockRejectedValue({ message: "SQL_INTERNAL_SYNTHETIC" });
  const dialog = await openQa07Offer();
  fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo completar la operación de planes.");
});

test("QA07: dos clics del mismo render guardan una sola vez", async () => {
  const pending = deferred(); plansApi.updateAdminPlan.mockReturnValue(pending.promise);
  const dialog = await openQa07Offer();
  const save = within(dialog).getByRole("button", { name: "Guardar cambios" });
  act(() => { save.click(); save.click(); });
  expect(plansApi.updateAdminPlan).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ data: makePlan(1) }));
});

test("QA07: dos confirmaciones del mismo render cambian estado una sola vez", async () => {
  auth.roles = ["admin"]; auth.branchIds = [BRANCH_A];
  const pending = deferred(); plansApi.setAdminPlanEstado.mockReturnValue(pending.promise);
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Inactivar oferta" }));
  const confirm = within(await screen.findByRole("dialog")).getByRole("button", { name: "Inactivar oferta" });
  act(() => { confirm.click(); confirm.click(); });
  expect(plansApi.setAdminPlanEstado).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ data: makePlan(1, BRANCH_A, { activo: false }) }));
});

test("QA07: cambio de identidad con mismos roles limpia datos y descarta 401 anterior", async () => {
  auth.roles = ["admin"]; auth.branchIds = [BRANCH_A];
  const pending = deferred(); plansApi.updateAdminPlan.mockReturnValue(pending.promise);
  plansApi.listAdminPlanes.mockResolvedValueOnce({ data: { planes: [makePlan(1)] } }).mockResolvedValue({ data: { planes: [makePlan(2)] } });
  const view = render(<AdminPlansCatalogPage />);
  await screen.findByText("Plan VIP 1");
  fireEvent.click(screen.getByRole("button", { name: "Editar oferta" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  auth.user = { id_usuario: "admin-b" };
  view.rerender(<AdminPlansCatalogPage />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await screen.findByText("Plan VIP 2");
  await act(async () => pending.reject({ status: 401 }));
  expect(notifications.error).not.toHaveBeenCalled();
  expect(notifications.success).not.toHaveBeenCalled();
  expect(navigateMock).not.toHaveBeenCalled();
  expect(screen.queryByText("Plan VIP 1")).not.toBeInTheDocument();
});

test.each(["save", "state"])("QA07: resultado anterior de %s no libera ni altera operación de B", async (kind) => {
  auth.roles = ["admin"]; auth.branchIds = [BRANCH_A];
  const a = deferred(), b = deferred();
  const api = kind === "save" ? plansApi.updateAdminPlan : plansApi.setAdminPlanEstado;
  api.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  plansApi.listAdminPlanes.mockResolvedValue({ data: { planes: [makePlan(1)] } });
  const view = render(<AdminPlansCatalogPage />);
  const start = async () => {
    await screen.findByText("Plan VIP 1");
    fireEvent.click(screen.getByRole("button", { name: kind === "save" ? "Editar oferta" : "Inactivar oferta" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: kind === "save" ? "Guardar cambios" : "Inactivar oferta" }));
    return dialog;
  };
  await start();
  auth.user = { id_usuario: "admin-b" }; view.rerender(<AdminPlansCatalogPage />);
  const dialogB = await start();
  expect(api).toHaveBeenCalledTimes(2);
  await act(async () => a.reject({ status: 401, message: "INTERNAL_SYNTHETIC" }));
  expect(dialogB).toBeInTheDocument();
  expect(within(dialogB).getByRole("button", { name: kind === "save" ? "Guardar cambios" : "Inactivar oferta" })).toBeDisabled();
  expect(notifications.error).not.toHaveBeenCalled();
  expect(notifications.success).not.toHaveBeenCalled();
  expect(navigateMock).not.toHaveBeenCalled();
  await act(async () => b.resolve({ data: makePlan(1) }));
  expect(notifications.success).toHaveBeenCalledTimes(1);
});

test("QA07: confirmación de suscripciones conserva payload y libera bloqueo para confirmar", async () => {
  auth.roles = ["admin"]; auth.branchIds = [BRANCH_A];
  plansApi.setAdminPlanEstado.mockRejectedValueOnce({ data: { error: {
    code: "CATALOG_PLAN_ACTIVE_SUBSCRIPTIONS_CONFIRM_REQUIRED", details: { total_clientes_activos: 2 },
  } } }).mockResolvedValueOnce({ data: makePlan(1, BRANCH_A, { activo: false }) });
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Inactivar oferta" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Inactivar oferta" }));
  await within(dialog).findByText(/2 cliente\(s\) con suscripcion vigente/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Inactivar oferta" }));
  await waitFor(() => expect(notifications.success).toHaveBeenCalledTimes(1));
  expect(plansApi.setAdminPlanEstado).toHaveBeenLastCalledWith(makePlan(1).id_plan, {
    activo: false, id_sucursal: BRANCH_A, confirmar_clientes_activos: true,
  });
});

test.each([401, 403, 503])("QA07: error vigente %s se procesa y permite reintentar", async (status) => {
  plansApi.updateAdminPlan.mockRejectedValueOnce({ status, message: "INTERNAL_SYNTHETIC" }).mockResolvedValueOnce({ data: makePlan(1) });
  const dialog = await openQa07Offer();
  const save = within(dialog).getByRole("button", { name: "Guardar cambios" });
  fireEvent.click(save);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("No se pudo completar la operación de planes.");
  expect(save).toBeEnabled();
  expect(notifications.error).toHaveBeenCalledTimes(1);
  fireEvent.click(save);
  await waitFor(() => expect(notifications.success).toHaveBeenCalledTimes(1));
  expect(plansApi.updateAdminPlan).toHaveBeenCalledTimes(2);
});

test("servicios no agendables o sin precio positivo no son seleccionables", async () => {
  auth.roles = ["admin"];
  auth.branchIds = [BRANCH_A];
  catalogApi.listAdminServicios.mockResolvedValue({ data: { servicios: [
    { id_servicio: "invalid", nombre_servicio: "No agendable", id_sucursal: BRANCH_A, activo: true, tarifa_activa: true, agendable: false, precio_hnl: 100 },
    { id_servicio: "missing", nombre_servicio: "Sin precio", id_sucursal: BRANCH_A, activo: true, tarifa_activa: true, agendable: true },
  ] } });
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Editar maestro" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByRole("option", { name: "No agendable" })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("option", { name: "Sin precio" })).not.toBeInTheDocument();
});

test("seleccion rapida de ofertas conserva ambas sucursales", async () => {
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Nuevo plan maestro" }));
  const dialog = await screen.findByRole("dialog");
  const a = deferred(), b = deferred();
  catalogApi.listAdminServicios.mockImplementation(({ id_sucursal }) => id_sucursal === BRANCH_A ? a.promise : b.promise);
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Centro" }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Norte" }));
  await act(async () => { b.resolve({ data: { servicios: [] } }); });
  await act(async () => { a.resolve({ data: { servicios: [] } }); });
  expect(within(dialog).getByRole("checkbox", { name: "Centro" })).toBeChecked();
  expect(within(dialog).getByRole("checkbox", { name: "Norte" })).toBeChecked();
});

test.each([0, 2])("admin con %i sucursales requiere seleccion sin consulta global", async (count) => {
  auth.roles = ["admin"];
  auth.branchIds = [BRANCH_A, BRANCH_B].slice(0, count);
  plansApi.listAdminPlanes.mockResolvedValue({ data: { planes: [] } });
  render(<AdminPlansCatalogPage />);
  await waitFor(() => expect(screen.getByLabelText("Sucursal")).toBeInTheDocument());
  expect(screen.queryByRole("option", { name: "Todas las sucursales" })).not.toBeInTheDocument();
  expect(plansApi.listAdminPlanes).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Nuevo plan maestro" })).toBeDisabled();
});

test.each(["success", "error"])("respuesta tardia A (%s) no sustituye B", async (outcome) => {
  const pending = deferred();
  plansApi.listAdminPlanes.mockImplementation(({ id_sucursal }) => id_sucursal === BRANCH_A ? pending.promise : Promise.resolve({ data: { planes: id_sucursal === BRANCH_B ? [makePlan(2, BRANCH_B)] : [] } }));
  render(<AdminPlansCatalogPage />);
  const selector = await screen.findByLabelText("Sucursal");
  await screen.findByRole("option", { name: "Norte" });
  fireEvent.change(selector, { target: { value: BRANCH_A } });
  await waitFor(() => expect(plansApi.listAdminPlanes).toHaveBeenCalledWith({ id_sucursal: BRANCH_A }));
  fireEvent.change(selector, { target: { value: BRANCH_B } });
  expect(await screen.findByText("Plan VIP 2")).toBeInTheDocument();
  await act(async () => outcome === "success" ? pending.resolve({ data: { planes: [makePlan(1)] } }) : pending.reject({ data: { error: { message: "Error anterior" } } }));
  expect(screen.getByText("Plan VIP 2")).toBeInTheDocument();
  expect(screen.queryByText("Plan VIP 1")).not.toBeInTheDocument();
  expect(screen.queryByText("Error anterior")).not.toBeInTheDocument();
});

test("loading pertenece a B aunque A termine antes", async () => {
  const a = deferred(), b = deferred();
  plansApi.listAdminPlanes.mockImplementation(({ id_sucursal }) => id_sucursal === BRANCH_A ? a.promise : id_sucursal === BRANCH_B ? b.promise : Promise.resolve({ data: { planes: [] } }));
  render(<AdminPlansCatalogPage />);
  await screen.findByRole("option", { name: "Norte" });
  fireEvent.change(screen.getByLabelText("Sucursal"), { target: { value: BRANCH_A } });
  fireEvent.change(screen.getByLabelText("Sucursal"), { target: { value: BRANCH_B } });
  await act(async () => a.resolve({ data: { planes: [makePlan(1)] } }));
  expect(screen.getByText("Cargando planes...")).toBeInTheDocument();
  await act(async () => b.resolve({ data: { planes: [makePlan(2, BRANCH_B)] } }));
  expect(screen.getByText("Plan VIP 2")).toBeInTheDocument();
});

test("perdida de alcance cierra formulario y descarta respuestas pendientes", async () => {
  auth.roles = ["admin"];
  auth.branchIds = [BRANCH_A];
  plansApi.listAdminPlanes.mockResolvedValue({ data: { planes: [makePlan(1)] } });
  const view = render(<AdminPlansCatalogPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar oferta" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  auth.branchIds = [];
  view.rerender(<AdminPlansCatalogPage />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("Plan VIP 1")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Nuevo plan maestro" })).toBeDisabled();
  expect(screen.queryByRole("option", { name: "Centro" })).not.toBeInTheDocument();
});

test("StrictMode y desmontaje descartan errores tardios sin notificar", async () => {
  const pending = deferred();
  plansApi.listAdminPlanes.mockImplementation(() => pending.promise);
  const view = render(<StrictMode><AdminPlansCatalogPage /></StrictMode>);
  await screen.findByText("Cargando planes...");
  view.unmount();
  await act(async () => pending.reject({ data: { error: { message: "Error anterior" } } }));
  expect(notifications.error).not.toHaveBeenCalled();
  expect(navigateMock).not.toHaveBeenCalled();
});

test.each([
  { activo: false }, { agendable: false }, { tarifa_activa: false }, { servicio_informativo: true },
  { precio_hnl: null }, { precio_hnl: "" }, { precio_hnl: 0 }, { precio_hnl: -1 }, { precio_hnl: "abc" }, { id_sucursal: BRANCH_B },
])("no ofrece servicio no operativo %j y conserva historicos", async (invalid) => {
  auth.roles = ["admin"];
  auth.branchIds = [BRANCH_A];
  catalogApi.listAdminServicios.mockResolvedValue({ data: { servicios: [
    { id_servicio: "valid", nombre_servicio: "Operativo", id_sucursal: BRANCH_A, activo: true, tarifa_activa: true, agendable: true, precio_hnl: "100.00" },
    { id_servicio: "invalid", nombre_servicio: "No disponible nuevo", id_sucursal: BRANCH_A, activo: true, tarifa_activa: true, agendable: true, precio_hnl: 100, ...invalid },
  ] } });
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Editar maestro" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("option", { name: "Operativo" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("option", { name: "No disponible nuevo" })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("option", { name: "Corte premium (No disponible)" })).toBeInTheDocument();
});

test("catalogos tardios de editor cancelado no reemplazan nueva seleccion", async () => {
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Nuevo plan maestro" }));
  let dialog = await screen.findByRole("dialog");
  const pending = deferred();
  catalogApi.listAdminServicios.mockImplementation(() => pending.promise);
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Centro" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  fireEvent.click(screen.getByRole("button", { name: "Nuevo plan maestro" }));
  dialog = await screen.findByRole("dialog");
  await act(async () => pending.resolve({ data: { servicios: [{ id_servicio: "old", nombre_servicio: "Antiguo", id_sucursal: BRANCH_A, activo: true, tarifa_activa: true, agendable: true, precio_hnl: 100 }] } }));
  expect(within(dialog).getByRole("checkbox", { name: "Centro" })).not.toBeChecked();
  expect(within(dialog).queryByRole("option", { name: "Antiguo" })).not.toBeInTheDocument();
});

test("creacion multioferta conserva precios y beneficios comunes al resolver fuera de orden", async () => {
  const service = "21111111-1111-4111-8111-111111111111";
  const courtesy = "31111111-1111-4111-8111-111111111111";
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Nuevo plan maestro" }));
  const dialog = await screen.findByRole("dialog");
  const a = deferred(), b = deferred();
  catalogApi.listAdminServicios.mockImplementation(({ id_sucursal }) => id_sucursal === BRANCH_A ? a.promise : b.promise);
  courtesiesApi.listAdminCortesias.mockImplementation(({ id_sucursal }) => Promise.resolve({ data: { cortesias: [{ id: courtesy, nombre: "Bebida comun", sucursales: [{ id_sucursal, activa: true }] }] } }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Centro" }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Norte" }));
  const prices = within(dialog).getAllByPlaceholderText("1800.00");
  fireEvent.change(prices[0], { target: { value: "1000" } });
  fireEvent.change(prices[1], { target: { value: "2000" } });
  const response = (id_sucursal) => ({ data: { servicios: [
    { id_servicio: service, nombre_servicio: "Servicio comun", id_sucursal, activo: true, agendable: true, tarifa_activa: true, precio_hnl: 100 },
    { id_servicio: id_sucursal, nombre_servicio: `Exclusivo ${id_sucursal}`, id_sucursal, activo: true, agendable: true, tarifa_activa: true, precio_hnl: 100 },
  ] } });
  await act(async () => b.resolve(response(BRANCH_B)));
  await act(async () => a.resolve(response(BRANCH_A)));
  fireEvent.change(within(dialog).getByLabelText("Nombre del plan *"), { target: { value: "Plan nuevo" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Agregar servicio" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Agregar cortesia" }));
  expect(within(dialog).getByRole("option", { name: "Servicio comun" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("option", { name: /^Exclusivo/ })).not.toBeInTheDocument();
  const serviceSelect = within(dialog).getByRole("option", { name: "Servicio comun" }).parentElement;
  const courtesySelect = within(dialog).getByRole("option", { name: "Bebida comun" }).parentElement;
  fireEvent.change(serviceSelect, { target: { value: service } });
  fireEvent.change(courtesySelect, { target: { value: courtesy } });
  plansApi.createAdminPlan.mockResolvedValue({ data: makePlan(3) });
  fireEvent.click(within(dialog).getByRole("button", { name: "Crear plan maestro" }));
  await waitFor(() => expect(plansApi.createAdminPlan).toHaveBeenCalledTimes(1));
  const payload = plansApi.createAdminPlan.mock.calls[0][0];
  expect(payload.ofertas).toEqual([
    { id_sucursal: BRANCH_A, precio_hnl: 1000, visible_publico: true, orden_visual: 100 },
    { id_sucursal: BRANCH_B, precio_hnl: 2000, visible_publico: true, orden_visual: 100 },
  ]);
  expect(payload.beneficios.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ id_servicio: service, cantidad: 1 }),
    expect.objectContaining({ id_cortesia: courtesy, cantidad: 1 }),
  ]));
});

test("edicion de oferta mantiene precio, visibilidad y orden por sucursal", async () => {
  auth.roles = ["admin"];
  auth.branchIds = [BRANCH_A];
  await renderCatalog([makePlan(1)]);
  fireEvent.click(screen.getByRole("button", { name: "Editar oferta" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Precio HNL *"), { target: { value: "1500" } });
  plansApi.updateAdminPlan.mockResolvedValue({ data: makePlan(1, BRANCH_A, { precio_hnl: 1500 }) });
  fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(plansApi.updateAdminPlan).toHaveBeenCalledWith(makePlan(1).id_plan, {
    id_sucursal: BRANCH_A, precio_hnl: 1500, visible_publico: true, orden_visual: 1,
  }));
});

test.each([true, false])("estado local %s utiliza exclusivamente la oferta seleccionada", async (activo) => {
  auth.roles = ["admin"];
  auth.branchIds = [BRANCH_A];
  await renderCatalog([makePlan(1, BRANCH_A, { activo })]);
  const action = activo ? "Inactivar oferta" : "Activar oferta";
  fireEvent.click(screen.getByRole("button", { name: action }));
  const dialog = await screen.findByRole("dialog");
  plansApi.setAdminPlanEstado.mockResolvedValue({ data: makePlan(1, BRANCH_A, { activo: !activo }) });
  fireEvent.click(within(dialog).getByRole("button", { name: action }));
  await waitFor(() => expect(plansApi.setAdminPlanEstado).toHaveBeenCalledWith(makePlan(1).id_plan, { id_sucursal: BRANCH_A, activo: !activo }));
});

test.each(["success", "error"])("servicios y cortesias tardios A (%s) no afectan editor B", async (outcome) => {
  const aServices = deferred(), aCourtesies = deferred();
  plansApi.listAdminPlanes.mockImplementation(({ id_sucursal }) => Promise.resolve({ data: { planes: id_sucursal ? [makePlan(1, id_sucursal)] : [] } }));
  catalogApi.listAdminServicios.mockImplementation(({ id_sucursal }) => id_sucursal === BRANCH_A ? aServices.promise : Promise.resolve({ data: { servicios: [{ id_servicio: "b", nombre_servicio: "Servicio B", id_sucursal: BRANCH_B, activo: true, agendable: true, tarifa_activa: true, precio_hnl: 100 }] } }));
  courtesiesApi.listAdminCortesias.mockImplementation(({ id_sucursal }) => id_sucursal === BRANCH_A ? aCourtesies.promise : Promise.resolve({ data: { cortesias: [{ id: "b", nombre: "Cortesia B", sucursales: [{ id_sucursal: BRANCH_B, activa: true }] }] } }));
  render(<AdminPlansCatalogPage />);
  await screen.findByRole("option", { name: "Norte" });
  fireEvent.change(screen.getByLabelText("Sucursal"), { target: { value: BRANCH_A } });
  fireEvent.change(screen.getByLabelText("Sucursal"), { target: { value: BRANCH_B } });
  fireEvent.click(await screen.findByRole("button", { name: "Editar maestro" }));
  const dialog = await screen.findByRole("dialog");
  await act(async () => {
    if (outcome === "error") {
      aServices.reject({ data: { error: { message: "Fallo auxiliar antiguo" } } });
      aCourtesies.reject({ data: { error: { message: "Fallo auxiliar antiguo" } } });
    } else {
      aServices.resolve({ data: { servicios: [] } });
      aCourtesies.resolve({ data: { cortesias: [] } });
    }
  });
  expect(within(dialog).getByRole("option", { name: "Servicio B" })).toBeInTheDocument();
  expect(within(dialog).getByRole("option", { name: "Cortesia B" })).toBeInTheDocument();
  expect(notifications.warning).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("button", { name: "Guardar cambios" })).not.toBeDisabled();
});

test("StrictMode conserva la carga vigente y permite editar", async () => {
  plansApi.listAdminPlanes.mockResolvedValue({ data: { planes: [makePlan(1)] } });
  render(<StrictMode><AdminPlansCatalogPage /></StrictMode>);
  fireEvent.click(await screen.findByRole("button", { name: "Editar maestro" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});

describe("catálogo responsive de planes VIP", () => {
  test("inicia en lista y alterna a tarjetas sin consultar de nuevo", async () => {
    await renderCatalog([makePlan(1)]);
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Lista de planes" })).toBeInTheDocument();
    const calls = plansApi.listAdminPlanes.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Tarjetas" }));
    expect(screen.getByRole("region", { name: "Tarjetas de planes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tarjetas" })).toHaveAttribute("aria-pressed", "true");
    expect(plansApi.listAdminPlanes).toHaveBeenCalledTimes(calls);
  });

  test("agrupa ofertas globales y muestra rango, beneficios y cantidades", async () => {
    const master = makePlan(1);
    await renderCatalog([
      master,
      makePlan(1, BRANCH_B, { id_plan: master.id_plan, precio_hnl: 1600, activo: false, visible_publico: false }),
    ]);

    expect(screen.getAllByText("Plan VIP 1")).toHaveLength(1);
    expect(screen.getByText("L 1001.00 - L 1600.00")).toBeInTheDocument();
    expect(screen.getByText("2x")).toBeInTheDocument();
    expect(screen.getByText("1x")).toBeInTheDocument();
    expect(screen.getAllByText("1 tipo", { selector: "div" })).toHaveLength(2);
    expect(screen.getByText(/^Nivel 2 - /)).toBeInTheDocument();
    expect(screen.getByText("Mensual")).toBeInTheDocument();
  });

  test("expande ofertas globales en línea sin nueva petición", async () => {
    const master = makePlan(1);
    await renderCatalog([master, makePlan(1, BRANCH_B, { id_plan: master.id_plan, precio_hnl: 1600 })]);
    const calls = plansApi.listAdminPlanes.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Ver 2 oferta(s)" }));
    const offers = screen.getByLabelText("Ofertas de Plan VIP 1");
    expect(within(offers).getByText("Centro")).toBeInTheDocument();
    expect(within(offers).getByText("Norte")).toBeInTheDocument();
    expect(within(offers).getByText("L 1600.00")).toBeInTheDocument();
    expect(plansApi.listAdminPlanes).toHaveBeenCalledTimes(calls);
  });

  test("busca por beneficio y conserva solo coincidencias", async () => {
    await renderCatalog([makePlan(1), makePlan(2, BRANCH_A, { beneficios: [] })]);
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre o beneficio"), { target: { value: "Corte premium" } });
    expect(screen.getByText("Plan VIP 1")).toBeInTheDocument();
    expect(screen.queryByText("Plan VIP 2")).not.toBeInTheDocument();
  });

  test("aplica filtros rápidos y ofrece limpieza", async () => {
    await renderCatalog([makePlan(1), makePlan(2, BRANCH_A, { activo: false })]);
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Solo activos" }));
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Cerrar" })[0]);
    expect(screen.getByText("Plan VIP 1")).toBeInTheDocument();
    expect(screen.queryByText("Plan VIP 2")).not.toBeInTheDocument();
    expect(screen.getByText("Estado: Activo")).toBeInTheDocument();
  });

  test("pagina localmente diez registros y no repite la consulta", async () => {
    await renderCatalog(Array.from({ length: 11 }, (_, index) => makePlan(index + 1)));
    expect(screen.getByText("Mostrando 1-10 de 11")).toBeInTheDocument();
    expect(screen.queryByText("Plan VIP 11")).not.toBeInTheDocument();
    const calls = plansApi.listAdminPlanes.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(await screen.findByText("Plan VIP 11")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 11-11 de 11")).toBeInTheDocument();
    expect(plansApi.listAdminPlanes).toHaveBeenCalledTimes(calls);
  });

  test("mantiene acciones globales accesibles", async () => {
    await renderCatalog([makePlan(1)]);
    expect(screen.getByRole("button", { name: "Ver detalle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar maestro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestionar ofertas" })).toBeInTheDocument();
  });

  test("abre creación y gestión de ofertas con los controles existentes", async () => {
    await renderCatalog([makePlan(1)]);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo plan maestro" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Datos del plan maestro" })).toBeInTheDocument();
    expect(within(dialog).getByText("Ofertas iniciales por sucursal")).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Cerrar" })[0]);

    fireEvent.click(screen.getByRole("button", { name: "Gestionar ofertas" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Agregar oferta a otra sucursal" })).toBeInTheDocument();
  });

  test("en sucursal muestra precio, orden, estado y acciones operativas", async () => {
    auth.branchIds = [BRANCH_A];
    auth.roles = ["admin"];
    await renderCatalog([makePlan(1)]);
    expect(screen.getByText("L 1001.00")).toBeInTheDocument();
    expect(screen.getByText("Orden 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar oferta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inactivar oferta" })).toBeInTheDocument();
  });

  test("conserva los diálogos de edición local e inactivación", async () => {
    auth.branchIds = [BRANCH_A];
    auth.roles = ["admin"];
    await renderCatalog([makePlan(1)]);
    fireEvent.click(screen.getByRole("button", { name: "Editar oferta" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Configuración de la oferta" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Precio HNL *")).toHaveValue(1001);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Cerrar" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Inactivar oferta" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Inactivar oferta" })).toBeInTheDocument();
  });

  test("organiza el formulario maestro en secciones sin cambiar sus controles", async () => {
    await renderCatalog([makePlan(1)]);
    fireEvent.click(screen.getByRole("button", { name: "Editar maestro" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Datos del plan maestro" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Beneficios incluidos" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Nombre del plan *")).toHaveValue("Plan VIP 1");
    expect(within(dialog).getByLabelText("Periodo")).toHaveValue("Mensual");
  });

  test("redirige roles sin permiso y no consulta catálogos", async () => {
    auth.roles = ["cliente"];
    plansApi.listAdminPlanes.mockResolvedValue({ data: { planes: [] } });
    render(<AdminPlansCatalogPage />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/unauthorized", { replace: true }));
    expect(plansApi.listAdminPlanes).not.toHaveBeenCalled();
    expect(branchesApi.listAdminSucursales).not.toHaveBeenCalled();
  });

  test("representa carga, vacío y error HTTP sin exponer detalles técnicos", async () => {
    plansApi.listAdminPlanes.mockImplementation(() => new Promise(() => {}));
    const first = render(<AdminPlansCatalogPage />);
    expect(await screen.findByText("Cargando planes...")).toBeInTheDocument();
    first.unmount();

    plansApi.listAdminPlanes.mockResolvedValue({ data: { planes: [] } });
    const second = render(<AdminPlansCatalogPage />);
    expect(await screen.findByText("Sin planes registrados")).toBeInTheDocument();
    second.unmount();

    plansApi.listAdminPlanes.mockRejectedValue({ data: { error: { message: "No fue posible cargar los planes." } } });
    render(<AdminPlansCatalogPage />);
    expect(await screen.findByText("No se pudo completar la operación de planes.")).toBeInTheDocument();
    expect(screen.queryByText(/stack|select \*/i)).not.toBeInTheDocument();
  });
});
