import React, {useEffect, useMemo, useState} from 'react';
import AdminPage from './pages/AdminPage.jsx';
import SearchableProductSelect from './components/SearchableProductSelect.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import StockPage from './pages/StockPage.jsx';
import CompanyLedgerPage from './pages/CompanyLedgerPage.jsx';
import CustomerLedgerPage from './pages/CustomerLedgerPage.jsx';
import {API_BASE_URL} from './api.js';

const API = API_BASE_URL;
const money = value => new Intl.NumberFormat('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2}).format(Number(value || 0));
const emptyRow = id => ({id, productId: '', productName: '', hsnCode: '', bagSizeKg: '50', gstRate: '5', price: '', bags: ''});
const CUSTOM_PRODUCT = '__custom__';
const navigationItems = [
  {page: 'billing', label: 'Billing', permissions: ['BILLING_USE']},
  {page: 'products', label: 'Products', permissions: ['PRODUCT_MANAGE']},
  {page: 'stock', label: 'Stock Report', permissions: ['STOCK_REPORT_VIEW']},
  {page: 'ledger', label: 'Company / Dealer Ledger', permissions: ['COMPANY_LEDGER_VIEW']},
  {page: 'customer-ledger', label: 'Farmer / Customer Ledger', permissions: ['CUSTOMER_LEDGER_VIEW']},
  {page: 'admin', label: 'Admin', permissions: ['USER_MANAGE', 'DEALER_MANAGE']}
];

const hasPermission = (user, permission) => user.permissions?.includes(permission) || false;
const canAccessPage = (user, item) => item.permissions.some(permission => hasPermission(user, permission));

export default function App() {
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSelected, setCustomerSelected] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [rows, setRows] = useState([emptyRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [focusProductRowId, setFocusProductRowId] = useState(null);
  const [bill, setBill] = useState(null);
  const [calculatedBillRequest, setCalculatedBillRequest] = useState(null);
  const [customerInvoice, setCustomerInvoice] = useState(null);
  const [page, setPage] = useState('billing');
  const [type, setType] = useState(() => sessionStorage.getItem('billing.billType') || 'CASH');
  const [destination, setDestination] = useState(() => sessionStorage.getItem('billing.destination') || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [postingCustomerBill, setPostingCustomerBill] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const availablePages = navigationItems.filter(item => user && canAccessPage(user, item));
  const activePage = availablePages.some(item => item.page === page)
    ? page : availablePages[0]?.page;

  useEffect(() => {
    if (!user || page !== 'billing') return;
    let cancelled = false;
    fetch(`${API}/products?dealerId=${user.dealerId}`, {credentials: 'include'})
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load products.');
        return data;
      })
      .then(data => { if (!cancelled) setProducts(data); })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load products. Check backend/database.'); });
    setCustomerLoading(true);
    fetch(`${API}/customer-ledger/customers?dealerId=${encodeURIComponent(user.dealerId)}`, {credentials: 'include'})
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.detail || 'Could not load customers.');
        return data;
      })
      .then(data => {
        if (!cancelled) {
          setCustomers(data);
          setCustomerId(current => data.some(customer => String(customer.id) === current)
            ? current : (data[0] ? String(data[0].id) : ''));
        }
      })
      .catch(e => {if (!cancelled) setError(e.message || 'Could not load customers.');})
      .finally(() => {if (!cancelled) setCustomerLoading(false);});
    return () => { cancelled = true; };
  }, [user, page]);

  const activeRows = useMemo(() => rows.filter(row => row.productId), [rows]);
  const selectedCustomer = customers.find(customer => String(customer.id) === customerId);
  function navigateToPage(nextPage) {
    if (nextPage !== 'billing') setFocusProductRowId(null);
    setPage(nextPage);
  }

  const updateRow = (id, patch) => {
    setRows(current => current.map(row => row.id === id ? {...row, ...patch} : row));
    setBill(null);
    setCalculatedBillRequest(null);
    setCustomerInvoice(null);
  };

  function selectProduct(rowId, productId) {
    const product = products.find(item => String(item.id) === productId);
    const selectedRowIndex = rows.findIndex(row => row.id === rowId);
    const isTrailingEmptyRow = selectedRowIndex === rows.length - 1 && !rows[selectedRowIndex]?.productId;
    setRows(current => {
      let updated = current.map(row => row.id === rowId
        ? {...row, productId, productName: '', hsnCode: '', bagSizeKg: '50', gstRate: '5',
          price: product ? String(product.defaultPriceInclGst) : '', bags: productId ? '1' : ''}
        : row);
      // Keep exactly one empty row at the end; selecting one product does not create four fixed rows.
      updated = updated.filter((row, index) => row.productId || index === updated.length - 1);
      if (productId && updated[updated.length - 1]?.productId) updated.push(emptyRow(nextId));
      if (!updated.length) updated = [emptyRow(nextId)];
      return updated;
    });
    if (productId) {
      setNextId(id => id + 1);
      setFocusProductRowId(isTrailingEmptyRow ? nextId : rows[rows.length - 1]?.id ?? null);
    } else {
      setFocusProductRowId(null);
    }
    setBill(null);
    setCalculatedBillRequest(null);
    setCustomerInvoice(null);
  }

  function duplicateRow(rowId) {
    const rowIndex = rows.findIndex(row => row.id === rowId);
    if (rowIndex < 0 || !rows[rowIndex].productId) return;
    const duplicateId = nextId;
    const emptyId = nextId + 1;
    const duplicate = {...rows[rowIndex], id: duplicateId};
    setRows(current => [
      ...current.slice(0, rowIndex + 1),
      duplicate,
      ...current.slice(rowIndex + 1).filter(row => row.productId),
      emptyRow(emptyId)
    ]);
    setNextId(nextId + 2);
    setFocusProductRowId(duplicateId);
    setBill(null);
    setCalculatedBillRequest(null);
    setCustomerInvoice(null);
  }

  function removeRow(id) {
    setRows(current => {
      const kept = current.filter(row => row.id !== id);
      const filled = kept.filter(row => row.productId);
      return [...filled, emptyRow(nextId)];
    });
    setNextId(id => id + 1);
    setFocusProductRowId(nextId);
    setBill(null);
    setCalculatedBillRequest(null);
    setCustomerInvoice(null);
  }

  async function login(event) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username, password})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.detail || 'Login failed');
      setUser(data);
      setPage(data.permissions?.includes('BILLING_USE') ? 'billing' : 'admin');
    } catch (e) {
      setError(e instanceof TypeError
        ? `Cannot reach the backend at ${API}. Check that it is online and allows this site's origin.`
        : e.message);
    } finally { setLoading(false); }
  }

  async function logout() {
    setError('');
    try {
      const response = await fetch(`${API}/auth/logout`, {method: 'POST', credentials: 'include'});
      if (!response.ok) throw new Error('Could not log out. Please try again.');
      setUser(null);
      navigateToPage('billing');
      setBill(null);
    } catch (e) {
      setError(e.message || 'Could not log out.');
    }
  }

  async function calculate(event) {
    event?.preventDefault(); setError(''); setLoading(true);
    try {
      const items = activeRows.map(row => {
        if (!row.bags || Number(row.bags) < 1) throw new Error('Enter bags (at least 1) for each selected product.');
        if (!row.price || Number(row.price) <= 0) throw new Error('Enter a valid price for each selected product.');
        if (row.productId === CUSTOM_PRODUCT) {
          if (!row.productName.trim()) throw new Error('Enter a name for each custom product.');
          if (!row.bagSizeKg || Number(row.bagSizeKg) <= 0) throw new Error('Enter a valid bag weight for each custom product.');
          if (row.gstRate === '' || Number(row.gstRate) < 0 || Number(row.gstRate) > 100) throw new Error('Enter a GST rate from 0 to 100 for each custom product.');
          return {
            productId: null, productName: row.productName.trim(), hsnCode: row.hsnCode.trim(),
            bagSizeKg: Number(row.bagSizeKg), gstRate: Number(row.gstRate),
            priceInclGst: Number(row.price), bags: Number(row.bags)
          };
        }
        return {productId: Number(row.productId), priceInclGst: Number(row.price), bags: Number(row.bags)};
      });
      if (!items.length) throw new Error('Select at least one product.');
      const requestBody = {
        dealerId: user.dealerId, items, billType: type,
        destinationStateCode: destination || (customerSelected && selectedCustomer?.stateCode) || undefined
      };
      const response = await fetch(`${API}/billing/calculate`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Bill calculation failed.');
      setBill({...data, billType: type});
      setCalculatedBillRequest(requestBody);
      setCustomerInvoice(null);
    } catch (e) { setError(e.message || 'Bill calculation failed.'); }
    finally { setLoading(false); }
  }

  async function saveCustomerBill() {
    if (!bill || !calculatedBillRequest || !customerSelected || !selectedCustomer || customerInvoice) return;
    const billTypeLabel = bill.billType === 'CREDIT' ? 'CREDIT' : 'CASH';
    const balanceEffect = billTypeLabel === 'CREDIT'
      ? 'This will increase the customer amount due.'
      : 'This will be recorded as paid and will not increase the customer amount due.';
    if (!window.confirm(
      `Save this ${billTypeLabel} BILL for ${selectedCustomer.customerName} for ₹${money(bill.grandTotal)}?\n\n${balanceEffect}`
    )) return;
    setPostingCustomerBill(true);
    setError('');
    try {
      const response = await fetch(`${API}/customer-ledger/bills`, {
        method: 'POST',
        credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({customerId: selectedCustomer.id, bill: calculatedBillRequest})
      });
      const invoice = await response.json();
      if (!response.ok) throw new Error(invoice.message || invoice.detail || 'Could not save this bill to the customer ledger.');
      setCustomerInvoice(invoice);
      setBill(current => ({...current, customerInvoiceNumber: invoice.invoiceNumber}));
      try {
        const customersResponse = await fetch(`${API}/customer-ledger/customers?dealerId=${encodeURIComponent(user.dealerId)}`, {credentials: 'include'});
        const customerList = await customersResponse.json();
        if (!customersResponse.ok) throw new Error(customerList.message || customerList.detail || 'Customer balance refresh failed.');
        setCustomers(customerList);
      } catch (refreshError) {
        setError(`Bill ${invoice.invoiceNumber} was saved, but the customer balance could not be refreshed. ${refreshError.message}`);
      }
    } catch (saveError) {
      setError(saveError.message || 'Could not save this bill to the customer ledger.');
    } finally {
      setPostingCustomerBill(false);
    }
  }

  const productOptions = [
    ...products.map(item => ({value: String(item.id), label: item.productName})),
    {value: CUSTOM_PRODUCT, label: 'Other / enter manually…'}
  ];

  if (!user) return <main className="login-shell"><form className="login-card" onSubmit={login}>
    <h1>Agri Dealer Hub</h1><p>Sign in with your account</p>
    <label>Username<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)}/></label>
    <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
    {error && <p className="error-message">{error}</p>}
    <button className="primary-button" disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
    <p className="login-contact">For any queries, contact <a href="mailto:puvvadideekshith2@gmail.com">Puvvadi Deekshith</a> at <a href="mailto:puvvadideekshith2@gmail.com">puvvadideekshith2@gmail.com</a>.</p>
  </form></main>;

  return <div className="app-shell">
    <header className="app-header"><div><strong>Agri Dealer Hub</strong><small>{user.dealerName ? `${user.dealerName} · ` : ''}{user.fullName}</small></div><div className="app-header-actions"><span className="app-user-id" title={`Role: ${user.role}`}>Username: {user.username}</span><button className="quiet-button" onClick={logout}>Logout</button></div></header>
    <nav className="app-nav">{availablePages.map(item => <button key={item.page} className={activePage === item.page ? 'active' : ''} onClick={() => navigateToPage(item.page)}>{item.label}</button>)}</nav>

    {activePage === 'admin'
      ? <AdminPage user={user}/>
      : activePage === 'products'
        ? <ProductsPage user={user}/>
        : activePage === 'stock'
          ? <StockPage user={user}/>
        : activePage === 'ledger'
          ? <CompanyLedgerPage user={user}/>
        : activePage === 'customer-ledger'
          ? <CustomerLedgerPage user={user}/>
        : activePage === 'billing'
          ? <>
    <main className="billing-layout">
      <section className="entry-panel">
        <div className="panel-heading"><span className="eyebrow">RUNTIME BILLING</span><h1>GST Billing Calculator</h1><p>Choose products and quantities. Default prices are fetched from the backend and can be overridden for this bill only.</p></div>
        <form onSubmit={calculate}>
          <div className="form-grid">
            <label>Customer bill?
              <select value={customerSelected ? 'YES' : 'NO'} onChange={event => {
                const selected = event.target.value === 'YES';
                setCustomerSelected(selected);
                setBill(null);
                setCalculatedBillRequest(null);
                setCustomerInvoice(null);
              }}>
                <option value="NO">No — runtime bill</option><option value="YES">Yes — select customer</option>
              </select>
            </label>
            {customerSelected && <label>Customer
              <select required value={customerId} disabled={customerLoading || customers.length === 0} onChange={event => {
                setCustomerId(event.target.value);
                setBill(null);
                setCalculatedBillRequest(null);
                setCustomerInvoice(null);
              }}>
                {customers.length === 0
                  ? <option value="">{customerLoading ? 'Loading customers…' : 'No customers — add one in Customer Ledger'}</option>
                  : customers.map(customer => <option key={customer.id} value={customer.id}>{customer.customerName}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
              </select>
              {customers.length === 0 && !customerLoading && <small className="customer-select-help">Add a customer from Farmer / Customer Ledger first.</small>}
            </label>}
            <label>Bill type<select value={type} onChange={e => {setType(e.target.value); sessionStorage.setItem('billing.billType', e.target.value); setBill(null); setCalculatedBillRequest(null); setCustomerInvoice(null);}}><option value="CASH">Cash Bill</option><option value="CREDIT">Credit Bill</option></select></label>
            <label>Customer state code <input value={destination} onChange={e => {setDestination(e.target.value); sessionStorage.setItem('billing.destination', e.target.value); setBill(null); setCalculatedBillRequest(null); setCustomerInvoice(null);}} maxLength={2} placeholder={customerSelected && selectedCustomer?.stateCode ? `Customer: ${selectedCustomer.stateCode}` : `Default: ${user.stateCode || 'dealer state'}`}/></label>
          </div>
          <div className="item-list-heading"><h2>Bill items</h2><span>{activeRows.length} selected</span></div>
          <div className="billing-columns"><span>Product</span><span>Price incl. GST (₹)</span><span>Bags</span><span>Weight (kg)</span><span></span></div>
          {rows.map((row, index) => {
            const product = products.find(item => String(item.id) === row.productId);
            const customProduct = row.productId === CUSTOM_PRODUCT;
            const selectedProduct = product || (customProduct ? row : null);
            return <div className={`billing-row ${!row.productId ? 'empty-row' : ''}`} key={row.id}>
              <SearchableProductSelect
                options={productOptions}
                value={row.productId}
                onChange={value => selectProduct(row.id, value)}
                placeholder={index === 0 ? 'Search products…' : 'Add next product…'}
                ariaLabel={`Product ${index + 1}`}
                autoFocus={row.id === focusProductRowId}
                onRemoveShortcut={() => removeRow(row.id)}
              />
              <input aria-label="Price including GST" type="number" min="0.01" step="0.01" value={row.price} disabled={!selectedProduct} placeholder="Auto price" onChange={e => updateRow(row.id, {price: e.target.value})}/>
              <input aria-label="Number of bags" type="number" min="1" step="1" value={row.bags} disabled={!selectedProduct} placeholder="Bags" onChange={e => updateRow(row.id, {bags: e.target.value})}/>
              <div className="weight-cell">{selectedProduct && row.bags ? money(Number(selectedProduct.bagSizeKg) * Number(row.bags)) : '—'}</div>
              {selectedProduct ? <div className="billing-row-actions"><button type="button" className="duplicate-button" aria-label={`Duplicate ${selectedProduct.productName || 'custom product'}`} onClick={() => duplicateRow(row.id)}>+</button><button type="button" className="remove-button" aria-label="Remove item" onClick={() => removeRow(row.id)}>×</button></div> : <span/>}
              {product && <small className="product-meta">HSN {product.hsnCode} · {product.bagSizeKg} kg/bag · GST {product.gstRate}% · default ₹{money(product.defaultPriceInclGst)}</small>}
              {customProduct && <>
                <label className="custom-product-name">Product name<input aria-label="Custom product name" value={row.productName} onChange={e => updateRow(row.id, {productName: e.target.value})} maxLength={200} placeholder="Type product name"/></label>
                <div className="custom-product-fields">
                  <label>HSN code<input aria-label="Custom product HSN code" value={row.hsnCode} onChange={e => updateRow(row.id, {hsnCode: e.target.value})} maxLength={20} placeholder="Optional"/></label>
                  <label>Weight per bag (kg)<input aria-label="Custom product bag weight in kilograms" type="number" min="0.001" step="0.001" value={row.bagSizeKg} onChange={e => updateRow(row.id, {bagSizeKg: e.target.value})}/></label>
                  <label>GST (%)<input aria-label="Custom product GST rate" type="number" min="0" max="100" step="0.01" value={row.gstRate} onChange={e => updateRow(row.id, {gstRate: e.target.value})}/></label>
                </div>
              </>}
            </div>;
          })}
          {error && <p className="error-message">{error}</p>}
          <button className="primary-button calculate-button" disabled={loading || (customerSelected && (!customerId || customerLoading))}>{loading ? 'Calculating…' : 'Calculate bill'}</button>
          <p className="runtime-note">{customerSelected ? 'Calculated bills are not saved until you choose “Save bill to customer” in the preview.' : 'Runtime-only calculation. No invoice or bill history is saved.'}</p>
        </form>
      </section>

      <section className="preview-panel">
        <div className="preview-toolbar"><div><span className="eyebrow">PRINT PREVIEW</span><h2>Generated bill</h2></div><span className="preview-status">{bill ? 'Ready to print' : 'Waiting for calculation'}</span></div>
        {!bill ? <div className="preview-empty"><div className="preview-empty-icon">₹</div><h3>Your bill will appear here</h3><p>Select one or more products, enter the number of bags and calculate the bill.</p></div> : <article className="invoice-paper" id="invoice-paper">
          <div className="invoice-title">Tax Invoice</div>
          <button className="invoice-back" type="button" onClick={() => setBill(null)}>BACK</button>
          <div className="invoice-mode">{bill.billType === 'CREDIT' ? 'Credit Bill' : 'Cash Bill'}</div>
          <div className="invoice-number">{bill.customerInvoiceNumber || 'Not saved'}</div>
          <h1>{bill.dealer.displayName}</h1>
          <p className="invoice-address">{[bill.dealer.addressLine1, bill.dealer.addressLine2, bill.dealer.city, bill.dealer.stateName, bill.dealer.pincode].filter(Boolean).join(', ')}</p>
          {bill.dealer.gstin && <p className="invoice-gstin">GSTIN: {bill.dealer.gstin}</p>}
          {customerSelected && selectedCustomer && <div className="invoice-customer-details">
            <strong>Customer</strong><span>{selectedCustomer.customerName}</span>
            {selectedCustomer.address && <span>{selectedCustomer.address}</span>}
            {selectedCustomer.phone && <span>Phone: {selectedCustomer.phone}</span>}
            {selectedCustomer.gstin && <span>GSTIN: {selectedCustomer.gstin}</span>}
          </div>}
          <table className="invoice-table"><thead><tr><th>S.No.</th><th>Particulars</th><th>HSN<br/>CODE</th><th>No of<br/>Bags</th><th>Qty.</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>{bill.items.map((item, index) => <tr key={`${item.hsnCode}-${index}`}>
              <td>{index + 1}</td><td className="particular-cell">{item.productName}</td><td>{item.hsnCode}</td><td>{item.bags}</td><td>{money(item.quantityKg)}</td><td>{money(Math.round(Number(item.rateInclGst) / (1 + Number(item.gstRate) / 100)))}</td><td>{money(item.taxableAmount)}</td>
            </tr>)}</tbody>
          </table>
          <div className="invoice-summary"><div className="summary-rows"><div><b>Net<br/>amount</b><span>{money(bill.taxableTotal)}</span></div>
            {Array.from(new Set(bill.items.map(item => Number(item.gstRate)))).sort((a,b) => a-b).map(rate => {
              const rateLines = bill.items.filter(item => Number(item.gstRate) === rate);
              const cgstAtRate = rateLines.reduce((sum, item) => sum + Number(item.cgst || 0), 0);
              const sgstAtRate = rateLines.reduce((sum, item) => sum + Number(item.sgst || 0), 0);
              const igstAtRate = rateLines.reduce((sum, item) => sum + Number(item.igst || 0), 0);
              return bill.taxType === 'IGST'
                ? <div key={`igst-${rate}`}><b>IGST<br/>tax {money(rate)}%</b><span>{money(igstAtRate)}</span></div>
                : <React.Fragment key={`gst-${rate}`}><div><b>CGST<br/>tax {money(rate / 2)}%</b><span>{money(cgstAtRate)}</span></div><div><b>SGST<br/>tax {money(rate / 2)}%</b><span>{money(sgstAtRate)}</span></div></React.Fragment>;
            })}
            <div className="total-row"><b>TOTAL</b><span>{money(bill.grandTotal)}</span></div></div>
            <div className="tax-stamp">GST {new Set(bill.items.map(item => Number(item.gstRate))).size === 1 ? `${money(bill.items[0].gstRate)}%` : 'DETAILS'}</div>
          </div>
          <div className="invoice-footer">
            <span>{customerInvoice ? `Saved to ${selectedCustomer?.customerName} · ${customerInvoice.invoiceNumber}` : 'Preview only · Not saved'}</span>
            <div className="invoice-footer-actions">
              {customerSelected && selectedCustomer && <button type="button" className="primary-button save-customer-bill-button" disabled={postingCustomerBill || Boolean(customerInvoice)} onClick={saveCustomerBill}>
                {postingCustomerBill ? 'Saving…' : customerInvoice ? 'Saved to customer ledger' : 'Save bill to customer'}
              </button>}
              <button type="button" className="print-button" onClick={() => window.print()}>Print / Save PDF</button>
            </div>
          </div>
        </article>}
      </section>
    </main>
    </> : <main className="admin-layout"><p className="admin-help">No application modules are assigned to this account. Contact your administrator.</p></main>}
  </div>;
}
