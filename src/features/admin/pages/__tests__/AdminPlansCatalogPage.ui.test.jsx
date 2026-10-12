// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(await screen.findByText("No fue posible cargar los planes.")).toBeInTheDocument();
    expect(screen.queryByText(/stack|select \*/i)).not.toBeInTheDocument();
  });
});
