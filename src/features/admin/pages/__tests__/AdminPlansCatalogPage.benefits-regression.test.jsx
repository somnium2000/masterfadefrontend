// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import AdminPlansCatalogPage from "../AdminPlansCatalogPage.jsx";

const BRANCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN = "11111111-1111-4111-8111-111111111111";
const SERVICE = "21111111-1111-4111-8111-111111111111";
const COURTESY = "31111111-1111-4111-8111-111111111111";

const plansApi = vi.hoisted(() => ({
  listAdminPlanes: vi.fn(), createAdminPlan: vi.fn(), updateAdminPlan: vi.fn(), setAdminPlanEstado: vi.fn(),
}));
const catalogApi = vi.hoisted(() => ({ listAdminServicios: vi.fn() }));
const courtesiesApi = vi.hoisted(() => ({ listAdminCortesias: vi.fn() }));
const branchesApi = vi.hoisted(() => ({ listAdminSucursales: vi.fn() }));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => ({ ...(await vi.importActual("react-router-dom")), useNavigate: () => navigateMock }));
vi.mock("../../../../context/AuthContext.jsx", () => ({ useAuth: () => ({ branchIds: [BRANCH], roles: ["admin"] }) }));
vi.mock("../../../../context/NotificationsContext.jsx", () => ({ useNotifications: () => notifications }));
vi.mock("../../lib/adminPlansApi.js", () => plansApi);
vi.mock("../../lib/adminCatalogApi.js", () => catalogApi);
vi.mock("../../lib/adminCortesiasApi.js", () => courtesiesApi);
vi.mock("../../lib/adminSucursalesApi.js", () => branchesApi);
vi.mock("../../../../lib/catalogSync.js", () => ({ emitCatalogSync: vi.fn() }));

const originalPlan = {
  id_plan: PLAN,
  id_sucursal: BRANCH,
  nombre_plan: "Plan VIP",
  descripcion: "Original",
  periodo_membresia_codigo: "mensual",
  periodo_membresia_label: "Mensual",
  categoria_nivel: 1,
  precio_hnl: 1000,
  activo: true,
  visible_publico: true,
  orden_visual: 10,
  beneficios: [
    { tipo: "servicio", id_servicio: SERVICE, id_cortesia: null, nombre: "Servicio heredado", cantidad: 1 },
    { tipo: "cortesia", id_servicio: null, id_cortesia: COURTESY, nombre: "Cortesia heredada", cantidad: 1 },
  ],
};

async function openMasterEditor() {
  render(<AdminPlansCatalogPage />);
  await screen.findByText("Plan VIP");
  fireEvent.click(screen.getByRole("button", { name: "Editar maestro" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  Object.values(plansApi).forEach((mock) => mock.mockReset());
  Object.values(notifications).forEach((mock) => mock.mockReset());
  catalogApi.listAdminServicios.mockReset();
  courtesiesApi.listAdminCortesias.mockReset();
  branchesApi.listAdminSucursales.mockReset();
  plansApi.listAdminPlanes.mockResolvedValue({ data: { planes: [originalPlan] } });
  plansApi.updateAdminPlan.mockResolvedValue({ data: originalPlan });
  branchesApi.listAdminSucursales.mockResolvedValue({ data: { sucursales: [{ id_sucursal: BRANCH, nombre_sucursal: "Centro", estado: true }] } });
  catalogApi.listAdminServicios.mockResolvedValue({ data: { servicios: [] } });
  courtesiesApi.listAdminCortesias.mockResolvedValue({ data: { cortesias: [] } });
});

afterEach(() => cleanup());

describe("edicion segura de beneficios globales", () => {
  test("conserva y representa beneficios existentes no disponibles", async () => {
    const dialog = await openMasterEditor();
    expect(await within(dialog).findByRole("option", { name: "Servicio heredado (No disponible)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "Cortesia heredada (No disponible)" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("spinbutton").map((input) => input.value)).toEqual(["1", "1"]);
  });

  test("edicion descriptiva envia PATCH parcial sin beneficios", async () => {
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getByLabelText("Descripcion"), { target: { value: "Actualizada" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(plansApi.updateAdminPlan).toHaveBeenCalledWith(PLAN, {
      descripcion: "Actualizada",
      id_sucursal: BRANCH,
    }));
  });

  test("borrar descripcion envia null sin beneficios", async () => {
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getByLabelText("Descripcion"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(plansApi.updateAdminPlan).toHaveBeenCalledWith(PLAN, {
      descripcion: null,
      id_sucursal: BRANCH,
    }));
  });

  test("editar categoria envia solo categoria e id de sucursal", async () => {
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getByLabelText("Categoria visual"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(plansApi.updateAdminPlan).toHaveBeenCalledWith(PLAN, {
      categoria_nivel: 2,
      id_sucursal: BRANCH,
    }));
  });

  test("sin cambios no ejecuta PATCH", async () => {
    const dialog = await openMasterEditor();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(plansApi.updateAdminPlan).not.toHaveBeenCalled();
  });

  test("cambio real de cantidad incluye beneficios", async () => {
    catalogApi.listAdminServicios.mockResolvedValue({ data: { servicios: [{
      id_servicio: SERVICE, id_sucursal: BRANCH, nombre_servicio: "Servicio heredado", activo: true,
      tarifa_activa: true, servicio_informativo: false,
    }] } });
    courtesiesApi.listAdminCortesias.mockResolvedValue({ data: { cortesias: [{
      id: COURTESY, nombre: "Cortesia heredada", sucursales: [{ id_sucursal: BRANCH, activa: true }],
    }] } });
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getAllByRole("spinbutton")[0], { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(plansApi.updateAdminPlan).toHaveBeenCalledTimes(1));
    const payload = plansApi.updateAdminPlan.mock.calls[0][1];
    expect(payload.id_sucursal).toBe(BRANCH);
    expect(payload.beneficios.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: "servicio", id_servicio: SERVICE, cantidad: 2 }),
      expect.objectContaining({ tipo: "cortesia", id_cortesia: COURTESY, cantidad: 1 }),
    ]));
    expect(payload).not.toHaveProperty("nombre_plan");
  });

  test("cortesia inactiva existente permanece visible con su cantidad", async () => {
    courtesiesApi.listAdminCortesias.mockResolvedValue({ data: { cortesias: [{
      id: COURTESY, nombre: "Cortesia heredada", sucursales: [{ id_sucursal: BRANCH, activa: false }],
    }] } });
    const dialog = await openMasterEditor();
    expect(await within(dialog).findByRole("option", { name: "Cortesia heredada (Inactiva)" })).toBeInTheDocument();
    expect(within(dialog).getByText(/puedes conservarla porque ya estaba asociada/i)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("spinbutton")[1]).toHaveValue(1);
  });

  test("no permite aumentar una cortesia existente mientras permanece inactiva", async () => {
    catalogApi.listAdminServicios.mockResolvedValue({ data: { servicios: [{
      id_servicio: SERVICE, id_sucursal: BRANCH, nombre_servicio: "Servicio heredado", activo: true,
      tarifa_activa: true, servicio_informativo: false,
    }] } });
    courtesiesApi.listAdminCortesias.mockResolvedValue({ data: { cortesias: [{
      id: COURTESY, nombre: "Cortesia heredada", sucursales: [{ id_sucursal: BRANCH, activa: false }],
    }] } });
    const dialog = await openMasterEditor();
    fireEvent.change(within(dialog).getAllByRole("spinbutton")[1], { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Una o mas cortesias no son validas para la sucursal actual.");
    expect(plansApi.updateAdminPlan).not.toHaveBeenCalled();
  });

  test("una falla auxiliar no elimina beneficios persistidos", async () => {
    catalogApi.listAdminServicios.mockRejectedValue(new Error("fallo auxiliar"));
    courtesiesApi.listAdminCortesias.mockRejectedValue(new Error("fallo auxiliar"));
    const dialog = await openMasterEditor();
    expect(await within(dialog).findByRole("option", { name: "Servicio heredado (No disponible)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "Cortesia heredada (No disponible)" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("spinbutton")).toHaveLength(2);
  });

  test("conflicto 409 conserva formulario y valores", async () => {
    plansApi.updateAdminPlan.mockRejectedValue({ data: { error: {
      code: "CATALOG_PLAN_BENEFITS_BRANCH_CONFLICT",
      message: "Los beneficios no estan disponibles en todas las sucursales.",
    } } });
    catalogApi.listAdminServicios.mockResolvedValue({ data: { servicios: [{
      id_servicio: SERVICE, id_sucursal: BRANCH, nombre_servicio: "Servicio heredado", activo: true,
      tarifa_activa: true, servicio_informativo: false,
    }] } });
    courtesiesApi.listAdminCortesias.mockResolvedValue({ data: { cortesias: [{
      id: COURTESY, nombre: "Cortesia heredada", sucursales: [{ id_sucursal: BRANCH, activa: true }],
    }] } });
    const dialog = await openMasterEditor();
    const quantity = within(dialog).getAllByRole("spinbutton")[0];
    fireEvent.change(quantity, { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Los beneficios no estan disponibles en todas las sucursales.");
    expect(quantity).toHaveValue(2);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
