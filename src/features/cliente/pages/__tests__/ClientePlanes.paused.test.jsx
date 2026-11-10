// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import Page from '../ClientePlanesPage.jsx';
const api=vi.hoisted(()=>({getClientePlanEstado:vi.fn().mockResolvedValue({estado_plan:'sin_plan',planes_activos:[],historial_consumos:[]}),cancelClientePlanBySubscription:vi.fn(),confirmMembershipPayment:vi.fn(),createMembershipOrder:vi.fn(),createMembershipPaymentIntent:vi.fn(),queryMembershipPaymentStatus:vi.fn()}));
const notices=vi.hoisted(()=>({error:vi.fn(),success:vi.fn(),warning:vi.fn()}));
vi.mock('../../lib/clienteApi.js',()=>api);
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>({user:{id_usuario:'U',cliente_id:'C'},clienteId:'C'})}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>notices}));
vi.mock('../../../public/lib/catalogApi.js',()=>({listPublicCatalogBranches:vi.fn().mockResolvedValue({branches:[]}),listPublicPlansByBranch:vi.fn().mockResolvedValue({plans:[]})}));
vi.mock('../../../plans/components/PlanPurchaseFlowDialog.jsx',()=>({default:({open})=>open?<div data-testid="purchase-flow"/>:null}));
afterEach(()=>{cleanup();sessionStorage.clear();vi.clearAllMocks();});
test('planes accesibles con compra pausada ignoran compra persistida sin efectos comerciales',async()=>{
 sessionStorage.setItem('mf_cliente_vip_purchase_attempt_v1',JSON.stringify({version:1,identity:'U:C',offerId:'O',branchId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',key:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:'resolved',orderSummary:{id_order:'ORDER'},paymentIntent:{id_payment_intent:'INTENT'}}));
 render(<Page/>);
 await waitFor(()=>expect(api.getClientePlanEstado).toHaveBeenCalled());
 expect(screen.queryByTestId('purchase-flow')).not.toBeInTheDocument();
 for(const name of ['createMembershipOrder','createMembershipPaymentIntent','confirmMembershipPayment','queryMembershipPaymentStatus'])expect(api[name]).not.toHaveBeenCalled();
});
