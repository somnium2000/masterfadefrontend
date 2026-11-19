import { expect, test } from 'vitest';
import { resolveConfirmStepRedirect } from '../hooks/useBookingWizardNavigation.js';

test.each([true,false])('retorno al resumen conserva checkout existente %s sin exigir validaciones de avance',hasCheckoutContext=>{
 const result=resolveConfirmStepRedirect({pathname:'/agendar/confirmar',selectedBranchId:'',selectedBarberId:'',allBlocksComplete:false,hasCheckoutContext});
 expect(result).toBe(hasCheckoutContext?'':'/agendar/barberos');
});
