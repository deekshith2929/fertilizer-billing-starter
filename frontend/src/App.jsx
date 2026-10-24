import React, {useEffect, useMemo, useState} from 'react';
import AdminPage from './pages/AdminPage.jsx';
import SearchableProductSelect from './components/SearchableProductSelect.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import StockPage from './pages/StockPage.jsx';
import {API_BASE_URL} from './api.js';

const API = API_BASE_URL;
const money = value => new Intl.NumberFormat('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2}).format(Number(value || 0));
const emptyRow = id => ({id, productId: '', productName: '', hsnCode: '', bagSizeKg: '50', gstRate: '5', price: '', bags: ''});
const CUSTOM_PRODUCT = '__custom__';

export default function App() {
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([emptyRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [focusProductRowId, setFocusProductRowId] = useState(null);
  const [bill, setBill] = useState(null);
  const [page, setPage] = useState('billing');
  const [type, setType] = useState(() => sessionStorage.getItem('billing.billType') || 'CASH');
  const [destination, setDestination] = useState(() => sessionStorage.getItem('billing.destination') || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

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
    return () => { cancelled = true; };
  }, [user, page]);

  const activeRows = useMemo(() => rows.filter(row => row.productId), [rows]);
  function navigateToPage(nextPage) {
    if (nextPage !== 'billing') setFocusProductRowId(null);
    setPage(nextPage);
  }

  const updateRow = (id, patch) => {
    setRows(current => current.map(row => row.id === id ? {...row, ...patch} : row));
    setBill(null);
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
      const response = await fetch(`${API}/billing/calculate`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({dealerId: user.dealerId, items, billType: type, destinationStateCode: destination || undefined})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Bill calculation failed.');
      setBill(data);
    } catch (e) { setError(e.message || 'Bill calculation failed.'); }
    finally { setLoading(false); }
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
    <header className="app-header"><div><strong>Agri Dealer Hub</strong><small>{user.dealerName} · {user.fullName}</small></div><button className="quiet-button" onClick={logout}>Logout</button></header>
    <nav className="app-nav"><button className={page === 'billing' ? 'active' : ''} onClick={() => navigateToPage('billing')}>Billing</button>{['ADMIN', 'DEALER'].includes(user.role) && <button className={page === 'products' ? 'active' : ''} onClick={() => navigateToPage('products')}>Products</button>}{['ADMIN', 'DEALER'].includes(user.role) ? <button className={page === 'stock' ? 'active' : ''} onClick={() => navigateToPage('stock')}>Stock Report</button> : <span>Stock Report <em>Coming later</em></span>}<span>Company / Dealer Ledger <em>Coming later</em></span><span>Farmer / Customer Ledger <em>Coming later</em></span>{user.role === 'ADMIN' && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigateToPage('admin')}>Admin</button>}</nav>

    {page === 'admin' && user.role === 'ADMIN'
      ? <AdminPage user={user}/>
      : page === 'products' && ['ADMIN', 'DEALER'].includes(user.role)
        ? <ProductsPage user={user}/>
        : page === 'stock' && ['ADMIN', 'DEALER'].includes(user.role)
          ? <StockPage user={user}/>
        : <>
    <main className="billing-layout">
      <section className="entry-panel">
        <div className="panel-heading"><span className="eyebrow">RUNTIME BILLING</span><h1>GST Billing Calculator</h1><p>Choose products and quantities. Default prices are fetched from the backend and can be overridden for this bill only.</p></div>
        <form onSubmit={calculate}>
          <div className="form-grid">
            <label>Bill type<select value={type} onChange={e => {setType(e.target.value); sessionStorage.setItem('billing.billType', e.target.value);}}><option value="CASH">Cash Bill</option><option value="CREDIT">Credit Bill</option></select></label>
            <label>Customer state code <input value={destination} onChange={e => {setDestination(e.target.value); sessionStorage.setItem('billing.destination', e.target.value);}} maxLength={2} placeholder={`Default: ${user.stateCode || 'dealer state'}`}/></label>
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
          <button className="primary-button calculate-button" disabled={loading}>{loading ? 'Calculating…' : 'Calculate bill'}</button>
          <p className="runtime-note">Runtime-only calculation. No invoice or bill history is saved.</p>
        </form>
      </section>

      <section className="preview-panel">
        <div className="preview-toolbar"><div><span className="eyebrow">PRINT PREVIEW</span><h2>Generated bill</h2></div><span className="preview-status">{bill ? 'Ready to print' : 'Waiting for calculation'}</span></div>
        {!bill ? <div className="preview-empty"><div className="preview-empty-icon">₹</div><h3>Your bill will appear here</h3><p>Select one or more products, enter the number of bags and calculate the bill.</p></div> : <article className="invoice-paper" id="invoice-paper">
          <div className="invoice-title">Tax Invoice</div>
          <button className="invoice-back" type="button" onClick={() => setBill(null)}>BACK</button>
          <div className="invoice-mode">{bill.billType === 'Credit Bill' ? 'Cash / CreditBill' : 'Cash / CreditBill'}</div>
          <div className="invoice-number">Invoice Number</div>
          <h1>{bill.dealer.displayName}</h1>
          <p className="invoice-address">{[bill.dealer.addressLine1, bill.dealer.addressLine2, bill.dealer.city, bill.dealer.stateName, bill.dealer.pincode].filter(Boolean).join(', ')}</p>
          {bill.dealer.gstin && <p className="invoice-gstin">GSTIN: {bill.dealer.gstin}</p>}
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
          <div className="invoice-footer"><span>Runtime-only preview · No bill is stored</span><button type="button" className="print-button" onClick={() => window.print()}>Print / Save PDF</button></div>
        </article>}
      </section>
    </main>
    </>}
  </div>;
}
