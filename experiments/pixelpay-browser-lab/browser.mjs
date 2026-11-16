const { Models, Requests, Services, Entities, Responses } = window;
const report = {
  constructed: false, authenticationRequested: false, publicSandboxPreset: false,
  sdkMethodsUnchanged: false, scriptLoaded: false, cardinalApiPresent: false,
  finished: false, responseType: null, responseStatus: null, financialApproval: false,
  cardinalValidationFailed: false, cardinalJwtRejected: false, cardinalErrorNumber: null,
  hashValidationRequiresBackend: false, rejected: false, pageError: false, fixtureStages: [],
};
const allowedStages = new Set(['setup_fixture', 'challenge_fixture', 'validated_fixture']);
window.labRecordFixture = stage => {
  if (allowedStages.has(stage)) report.fixtureStages.push(stage);
};
window.labSnapshot = () => JSON.parse(JSON.stringify({ ...report,
  sdkMethodsUnchanged: methods[0] === Services.Transaction.prototype.doSale
    && methods[1] === Requests.SaleTransaction.prototype.withAuthenticationRequest,
}));
window.addEventListener('error', () => { report.pageError = true; });
window.addEventListener('unhandledrejection', () => { report.pageError = true; });
document.addEventListener('load', event => {
  if (event.target?.tagName === 'SCRIPT'
      && event.target.src === 'https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js') {
    report.scriptLoaded = true;
    report.cardinalApiPresent = ['configure', 'setup', 'on', 'continue']
      .every(key => typeof window.Cardinal?.[key] === 'function');
  }
}, true);

// AM: Native official example construction. Inputs are fixed synthetic fixtures, never operator data.
const settings = new Models.Settings();
settings.setupSandbox();
report.publicSandboxPreset = Boolean(settings.auth_key && settings.auth_hash)
  && settings.endpoint === 'https://pixelpay.dev';
const methods = [Services.Transaction.prototype.doSale, Requests.SaleTransaction.prototype.withAuthenticationRequest];
const card = new Models.Card();
card.number = '4111111111111111';
card.cvv2 = '999';
card.expire_month = 7;
card.expire_year = 2028;
card.cardholder = 'Synthetic fixture';
const billing = new Models.Billing();
billing.address = 'Synthetic address';
billing.country = 'HN';
billing.state = 'HN-CR';
billing.city = 'San Pedro Sula';
billing.phone = '99999999';
const item = new Models.Item();
item.code = '00001';
item.title = 'Synthetic item';
item.price = 1;
item.qty = 1;
const order = new Models.Order();
order.id = 'OFFLINE-BROWSER-LAB';
order.currency = 'HNL';
order.customer_name = 'Synthetic fixture';
order.customer_email = 'fixture@example.invalid';
order.addItem(item);
const sale = new Requests.SaleTransaction();
sale.withAuthenticationRequest();
sale.setOrder(order);
sale.setCard(card);
sale.setBilling(billing);
report.constructed = sale instanceof Requests.SaleTransaction;
report.authenticationRequested = sale.authentication_request === true;
const service = new Services.Transaction(settings);
try {
  service.verifyPaymentHash('synthetic', order.id, 'synthetic');
} catch {
  report.hashValidationRequiresBackend = true;
}
try {
  const response = await service.doSale(sale);
  report.responseType = response instanceof Responses.FailureResponse ? 'FailureResponse'
    : response instanceof Responses.PayloadResponse ? 'PayloadResponse' : 'OTHER';
  report.responseStatus = Number.isInteger(response?.status) ? response.status : null;
  const safeMessageSource = typeof response?.message === 'string' ? response.message : '';
  report.cardinalValidationFailed = safeMessageSource.startsWith('Cardinal validation failed.');
  if (report.cardinalValidationFailed) {
    report.cardinalJwtRejected = /jwt/i.test(safeMessageSource) && /invalid|missing|malformed|empty|decode|parse/i.test(safeMessageSource);
    report.cardinalErrorNumber = safeMessageSource.match(/\((\d{1,8})\)$/)?.[1] || null;
  }
  report.financialApproval = Entities.TransactionResult.validateResponse(response);
} catch {
  report.rejected = true;
} finally {
  report.sdkMethodsUnchanged = methods[0] === Services.Transaction.prototype.doSale
    && methods[1] === Requests.SaleTransaction.prototype.withAuthenticationRequest;
  report.finished = true;
  document.querySelector('#state').textContent = 'Observación terminada. Resultado sanitizado en la terminal.';
}
