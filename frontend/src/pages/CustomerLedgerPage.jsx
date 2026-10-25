import React, {useEffect, useMemo, useState} from 'react';
import {API_BASE_URL} from '../api.js';

const blankCustomer = {customerName: '', phone: '', email: '', address: '', gstin: '', stateCode: ''};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const money = value => new Intl.NumberFormat('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(value || 0));
const entryLabels = {OPENING: 'Opening balance', BILL: 'Bill', PAYMENT: 'Payment', ADJUSTMENT: 'Adjustment'};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/customer-ledger/${path}`, {
    ...options,
    credentials: 'include',
    headers: {...options.headers, ...(options.body ? {'Content-Type': 'application/json'} : {})}
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.detail || 'Customer ledger request failed.');
  return data;
}

async function loadDealers() {
  const response = await fetch(`${API_BASE_URL}/admin/dealers`, {credentials: 'include'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.detail || 'Could not load dealers.');
  return data;
}

function balanceLabel(value) {
  const amount = Number(value || 0);
  if (amount < 0) return `Customer advance ₹${money(Math.abs(amount))}`;
  return `Amount due ₹${money(amount)}`;
}

export default function CustomerLedgerPage({user}) {
  const canManageAllDealers = user.permissions?.includes('DEALER_MANAGE') || false;
  const [dealers, setDealers] = useState([]);
  const [dealerId, setDealerId] = useState(String(user.dealerId || ''));
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [entries, setEntries] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceEdits, setInvoiceEdits] = useState([]);
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [editReason, setEditReason] = useState('');
  const [entriesRefreshKey, setEntriesRefreshKey] = useState(0);
  const [customerForm, setCustomerForm] = useState(blankCustomer);
  const [entryForm, setEntryForm] = useState({
    entryType: 'PAYMENT', entryDate: today(), amount: '',
    balanceSide: 'RECEIVABLE', reference: '', notes: ''
  });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedCustomer = useMemo(
    () => customers.find(customer => String(customer.id) === customerId),
    [customers, customerId]
  );
  const dealerRef = React.useRef(dealerId);
  const customerRef = React.useRef(customerId);
  dealerRef.current = dealerId;
  customerRef.current = customerId;

  async function refreshCustomers(forDealer = dealerId) {
    const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(forDealer)}` : '';
    const data = await request(`customers${query}`);
    if (dealerRef.current !== forDealer) return;
    setCustomers(data);
    setCustomerId(current => data.some(customer => String(customer.id) === current)
      ? current : (data[0] ? String(data[0].id) : ''));
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoading(true);
      setError('');
      setNotice('');
      setSelectedInvoice(null);
      setFromDate('');
      setToDate('');
      try {
        if (canManageAllDealers) {
          const activeDealers = await loadDealers();
          if (cancelled) return;
          setDealers(activeDealers);
          if (!activeDealers.some(dealer => String(dealer.id) === dealerId)) {
            setDealerId(activeDealers[0] ? String(activeDealers[0].id) : '');
            setCustomers([]);
            setEntries([]);
            return;
          }
        }
        await refreshCustomers();
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    initialize();
    return () => {cancelled = true;};
  }, [dealerId, canManageAllDealers]);

  useEffect(() => {
    let cancelled = false;
    setSelectedInvoice(null);
    if (!customerId) {
      setEntries([]);
      return () => {cancelled = true;};
    }
    const params = new URLSearchParams();
    if (canManageAllDealers) params.set('dealerId', dealerId);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    const query = params.toString();
    request(`customers/${customerId}/entries${query ? `?${query}` : ''}`)
      .then(data => {
        if (!cancelled && dealerRef.current === dealerId && customerRef.current === customerId) setEntries(data);
      })
      .catch(requestError => {if (!cancelled) setError(requestError.message);});
    return () => {cancelled = true;};
  }, [dealerId, customerId, fromDate, toDate, canManageAllDealers, entriesRefreshKey]);

  async function createCustomer(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(dealerId)}` : '';
      const customer = await request(`customers${query}`, {method: 'POST', body: JSON.stringify(customerForm)});
      setCustomerForm(blankCustomer);
      setCustomers(current => [customer, ...current.filter(item => item.id !== customer.id)]);
      setCustomerId(String(customer.id));
      try {
        await refreshCustomers();
      } catch (refreshError) {
        setError(`Customer was added, but the customer list could not be refreshed. ${refreshError.message}`);
        return;
      }
      setNotice('Customer added.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!customerId) {
      setError('Add or select a customer first.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(dealerId)}` : '';
      await request(`customers/${customerId}/entries${query}`, {
        method: 'POST',
        body: JSON.stringify(entryForm)
      });
      setEntryForm(current => ({...current, amount: '', reference: '', notes: ''}));
      try {
        await refreshCustomers(dealerId);
      } catch (refreshError) {
        setError(`Ledger entry was saved, but the customer balance could not be refreshed. ${refreshError.message}`);
        return;
      }
      setNotice('Customer ledger entry saved.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function viewInvoice(invoiceId) {
    setSelectedInvoice(null);
    setInvoiceEdits([]);
    setEditingInvoice(false);
    setError('');
    try {
      const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(dealerId)}` : '';
      const invoice = await request(`customers/${customerId}/invoices/${invoiceId}${query}`);
      if (dealerRef.current !== dealerId || customerRef.current !== customerId) return;
      setSelectedInvoice(invoice);
      await refreshInvoiceEdits(invoiceId, dealerId, customerId);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function refreshInvoiceEdits(invoiceId, forDealer = dealerId, forCustomer = customerId) {
    const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(forDealer)}` : '';
    const history = await request(`customers/${forCustomer}/invoices/${invoiceId}/edits${query}`);
    if (dealerRef.current === forDealer && customerRef.current === forCustomer) setInvoiceEdits(history);
  }

  function beginInvoiceEdit() {
    setEditItems(selectedInvoice.items.map((item, index) => ({
      ...item,
      editKey: `${item.lineNumber}-${index}`,
      rateInclGst: String(item.rateInclGst),
      bags: String(item.bags)
    })));
    setEditReason('');
    setEditingInvoice(true);
    setError('');
  }

  async function saveInvoiceEdit(event) {
    event.preventDefault();
    if (!selectedInvoice || !editReason.trim() || !editItems.length) {
      setError(editItems.length ? 'Enter a reason for this invoice edit.' : 'An invoice must have at least one item.');
      return;
    }
    const projectedTotal = editItems.reduce((total, item) =>
      total + Number(item.rateInclGst || 0) * Number(item.bags || 0), 0);
    const difference = projectedTotal - Number(selectedInvoice.grandTotal);
    const balanceEffect = difference > 0
      ? `The customer's amount due will increase by approximately ₹${money(difference)}.`
      : difference < 0
        ? `A customer account credit of approximately ₹${money(Math.abs(difference))} will be recorded.`
        : 'The customer balance will not change.';
    if (!window.confirm(
      `Save this ${selectedInvoice.billType} invoice correction?\n\nCurrent total: ₹${money(selectedInvoice.grandTotal)}\nNew projected total: ₹${money(projectedTotal)}\n${balanceEffect}\n\nReason: ${editReason.trim()}`
    )) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(dealerId)}` : '';
      const updatedInvoice = await request(
        `customers/${customerId}/invoices/${selectedInvoice.id}${query}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            reason: editReason.trim(),
            items: editItems.map(item => ({
              productId: item.productId,
              productName: item.productName,
              hsnCode: item.hsnCode,
              bagSizeKg: item.bagSizeKg,
              bags: Number(item.bags),
              rateInclGst: Number(item.rateInclGst),
              gstRate: item.gstRate
            }))
          })
        }
      );
      setSelectedInvoice(updatedInvoice);
      setEditingInvoice(false);
      setEditItems([]);
      setEditReason('');
      setEntriesRefreshKey(current => current + 1);
      try {
        await Promise.all([
          refreshInvoiceEdits(updatedInvoice.id),
          refreshCustomers(dealerId)
        ]);
      } catch (refreshError) {
        setError(`Invoice ${updatedInvoice.invoiceNumber} was updated, but the account or history could not be refreshed. ${refreshError.message}`);
        return;
      }
      setNotice(`Invoice ${updatedInvoice.invoiceNumber} was updated. The edit reason and prior values are in its history.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function printStatement() {
    document.body.classList.remove('printing-customer-invoice');
    window.print();
  }

  function printInvoice() {
    document.body.classList.add('printing-customer-invoice');
    try {
      window.print();
    } finally {
      window.setTimeout(() => document.body.classList.remove('printing-customer-invoice'), 1000);
    }
  }

  const entryType = entryForm.entryType;
  const opening = entryType === 'OPENING';
  const adjustment = entryType === 'ADJUSTMENT';
  const editGrandTotal = editItems.reduce((total, item) =>
    total + Number(item.rateInclGst || 0) * Number(item.bags || 0), 0);

  return <main className="customer-ledger-layout">
    <header className="customer-ledger-heading">
      <div><span className="eyebrow">CUSTOMER ACCOUNTS</span><h1>Farmer / Customer Ledger</h1>
        <p>View customer bills, payments, advances, and the amount due. Customer bills are saved only when you choose to save them.</p></div>
      {canManageAllDealers && <label className="ledger-dealer-select">Dealer
        <select value={dealerId} disabled={saving} onChange={event => setDealerId(event.target.value)}>
          {dealers.map(dealer => <option key={dealer.id} value={dealer.id}>{dealer.displayName || dealer.legalName}</option>)}
        </select>
      </label>}
    </header>
    {error && <p className="ledger-message ledger-error" role="alert">{error}</p>}
    {notice && <p className="ledger-message ledger-notice" role="status">{notice}</p>}
    {loading ? <p className="admin-help">Loading customer ledger…</p> : <>
      <div className="customer-ledger-cards">
        <section className="admin-card">
          <h2>Add customer</h2>
          <form className="admin-form" onSubmit={createCustomer}>
            <label>Customer / farmer name<input required maxLength="200" value={customerForm.customerName} onChange={event => setCustomerForm({...customerForm, customerName: event.target.value})}/></label>
            <label>Phone<input maxLength="30" value={customerForm.phone} onChange={event => setCustomerForm({...customerForm, phone: event.target.value})}/></label>
            <label>Email<input type="email" maxLength="200" value={customerForm.email} onChange={event => setCustomerForm({...customerForm, email: event.target.value})}/></label>
            <label>State code<input inputMode="numeric" pattern="[0-9]{2}" maxLength="2" value={customerForm.stateCode} onChange={event => setCustomerForm({...customerForm, stateCode: event.target.value})}/></label>
            <label>GSTIN<input maxLength="15" value={customerForm.gstin} onChange={event => setCustomerForm({...customerForm, gstin: event.target.value})}/></label>
            <label>Address<input maxLength="2000" value={customerForm.address} onChange={event => setCustomerForm({...customerForm, address: event.target.value})}/></label>
            <button className="primary-button" disabled={saving || !dealerId}>{saving ? 'Saving…' : 'Add customer'}</button>
          </form>
        </section>

        <section className="admin-card">
          <h2>Customer account</h2>
          {customers.length === 0 ? <p className="admin-help">Add a customer to start recording bills and payments.</p> : <>
            <div className="customer-ledger-toolbar">
              <label>Customer<select value={customerId} disabled={saving} onChange={event => {
                setCustomerId(event.target.value);
                setSelectedInvoice(null);
              }}>
                {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.customerName}</option>)}
              </select></label>
              {selectedCustomer && <div className="ledger-balance"><span>Current balance</span><strong>{balanceLabel(selectedCustomer.balance)}</strong></div>}
            </div>

            <form className="ledger-entry-form" onSubmit={saveEntry}>
              <h3>Record payment or balance</h3>
              <div className="ledger-form-grid">
                <label>Entry type<select value={entryType} onChange={event => setEntryForm({
                  ...entryForm, entryType: event.target.value,
                  balanceSide: event.target.value === 'OPENING' ? 'RECEIVABLE'
                    : event.target.value === 'ADJUSTMENT' ? 'INCREASE_DUE' : 'RECEIVABLE'
                })}>
                  <option value="PAYMENT">Payment received</option>
                  <option value="OPENING">Opening balance</option>
                  <option value="ADJUSTMENT">Balance adjustment</option>
                </select></label>
                <label>Date<input type="date" required value={entryForm.entryDate} onChange={event => setEntryForm({...entryForm, entryDate: event.target.value})}/></label>
                <label>Amount (₹)<input type="number" min="0.01" step="0.01" required value={entryForm.amount} onChange={event => setEntryForm({...entryForm, amount: event.target.value})}/></label>
                <label>{opening ? 'Opening balance side' : adjustment ? 'Adjustment direction' : 'Receipt / reference'}{opening || adjustment
                  ? <select required value={entryForm.balanceSide} onChange={event => setEntryForm({...entryForm, balanceSide: event.target.value})}>
                    {opening
                      ? <><option value="RECEIVABLE">Customer owes us</option><option value="ADVANCE">Customer advance / credit</option></>
                      : <><option value="INCREASE_DUE">Increase amount due</option><option value="DECREASE_DUE">Decrease amount due</option></>}
                  </select>
                  : <input maxLength="100" value={entryForm.reference} onChange={event => setEntryForm({...entryForm, reference: event.target.value})}/>}
                </label>
                <label className="ledger-notes">Notes<input maxLength="1000" value={entryForm.notes} onChange={event => setEntryForm({...entryForm, notes: event.target.value})}/></label>
              </div>
              <button className="primary-button" disabled={saving || !customerId}>{saving ? 'Saving…' : 'Save ledger entry'}</button>
              <p className="ledger-hint">Payments and advances reduce the amount due. Bills saved from Billing appear here automatically.</p>
            </form>
          </>}
        </section>
      </div>

      {selectedCustomer && <section className="admin-card customer-ledger-history">
        <div className="admin-list-heading"><h2>{selectedCustomer.customerName} — account statement</h2>
          <div className="ledger-filters">
            <label>From<input type="date" max={toDate || undefined} value={fromDate} onChange={event => setFromDate(event.target.value)}/></label>
            <label>To<input type="date" min={fromDate || undefined} value={toDate} onChange={event => setToDate(event.target.value)}/></label>
            <button type="button" className="quiet-light-button" onClick={printStatement}>Print statement</button>
          </div>
        </div>
        <p className="customer-print-balance">Current balance: {balanceLabel(selectedCustomer.balance)}</p>
        <p className="ledger-hint">Running balances include entries before the selected date range.</p>
        {entries.length === 0 ? <p className="admin-help">No account entries for this period.</p> : <div className="admin-table-wrap">
          <table className="admin-table customer-ledger-table">
            <thead><tr><th>Date</th><th>Entry</th><th>Reference</th><th>Notes</th><th>Debit (₹)</th><th>Credit (₹)</th><th>Balance (₹)</th><th>Recorded by</th><th></th></tr></thead>
            <tbody>{entries.map(entry => <tr key={entry.id}>
              <td>{entry.entryDate}</td><td>{entryLabels[entry.entryType] || entry.entryType}</td>
              <td>{entry.invoiceNumber || entry.reference || '—'}</td><td>{entry.notes || '—'}</td>
              <td>{money(entry.debitAmount)}</td><td>{money(entry.creditAmount)}</td>
              <td>{balanceLabel(entry.runningBalance)}</td><td>{entry.createdBy || '—'}</td>
              <td>{entry.invoiceId && <button type="button" className="ledger-row-link" onClick={() => viewInvoice(entry.invoiceId)}>View bill</button>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>}

      {selectedInvoice && <section className="admin-card customer-invoice-detail">
        <div className="admin-list-heading"><div><span className="eyebrow">SAVED CUSTOMER INVOICE</span><h2>{selectedInvoice.invoiceNumber}</h2></div>
          <button type="button" className="quiet-light-button invoice-detail-close" onClick={() => setSelectedInvoice(null)}>Close</button>
        </div>
        <div className="customer-invoice-seller">
          <strong>{selectedInvoice.dealerName}</strong>
          <span>{[selectedInvoice.dealerAddressLine1, selectedInvoice.dealerAddressLine2, selectedInvoice.dealerCity, selectedInvoice.dealerStateName, selectedInvoice.dealerPincode].filter(Boolean).join(', ')}</span>
          {selectedInvoice.dealerGstin && <span>GSTIN: {selectedInvoice.dealerGstin}</span>}
        </div>
        <div className="customer-invoice-meta">
          <span>Customer: <strong>{selectedInvoice.customerName}</strong></span>
          {selectedInvoice.customerPhone && <span>Phone: <strong>{selectedInvoice.customerPhone}</strong></span>}
          <span>Date: <strong>{selectedInvoice.invoiceDate}</strong></span>
          <span>Type: <strong>{selectedInvoice.billType}</strong></span>
          <span>State code: <strong>{selectedInvoice.destinationStateCode}</strong></span>
          {selectedInvoice.customerGstin && <span>GSTIN: <strong>{selectedInvoice.customerGstin}</strong></span>}
          {selectedInvoice.customerAddress && <span>Address: <strong>{selectedInvoice.customerAddress}</strong></span>}
        </div>
        <div className="admin-table-wrap"><table className="admin-table customer-invoice-table">
          <thead><tr><th>#</th><th>Product</th><th>HSN</th><th>Bags</th><th>Quantity (kg)</th><th>Price / bag incl. GST (₹)</th><th>GST</th><th>Total (₹)</th>{editingInvoice && <th className="invoice-edit-controls">Action</th>}</tr></thead>
          <tbody>{(editingInvoice ? editItems : selectedInvoice.items).map((item, index) => <tr key={item.editKey || item.lineNumber}>
            <td>{index + 1}</td><td>{item.productName}</td><td>{item.hsnCode}</td>
            {editingInvoice ? <>
              <td><input aria-label={`Bags for ${item.productName}`} type="number" min="1" step="1" required value={item.bags} onChange={event => setEditItems(current => current.map((line, lineIndex) => lineIndex === index ? {...line, bags: event.target.value} : line))}/></td>
              <td>{money(Number(item.bagSizeKg) * Number(item.bags || 0))}</td>
              <td><input aria-label={`Price per bag for ${item.productName}`} type="number" min="0.01" step="0.01" required value={item.rateInclGst} onChange={event => setEditItems(current => current.map((line, lineIndex) => lineIndex === index ? {...line, rateInclGst: event.target.value} : line))}/></td>
              <td>{money(item.gstRate)}%</td><td>{money(Number(item.rateInclGst || 0) * Number(item.bags || 0))}</td>
              <td className="invoice-edit-controls"><button type="button" className="invoice-remove-item" disabled={saving || editItems.length <= 1} onClick={() => setEditItems(current => current.filter((_, lineIndex) => lineIndex !== index))}>Remove</button></td>
            </> : <>
              <td>{item.bags}</td><td>{money(item.quantityKg)}</td><td>{money(item.rateInclGst)}</td><td>{money(item.gstRate)}%</td><td>{money(item.lineTotal)}</td>
            </>}
          </tr>)}</tbody>
        </table></div>
        <div className="customer-invoice-totals">
          {editingInvoice
            ? <><span>Current total: ₹{money(selectedInvoice.grandTotal)}</span>
              <strong>New projected total: ₹{money(editGrandTotal)}</strong>
              <span>Tax totals will be recalculated when saved.</span></>
            : <><span>Taxable: ₹{money(selectedInvoice.taxableTotal)}</span>
              {selectedInvoice.taxType === 'IGST'
                ? <span>IGST: ₹{money(selectedInvoice.igstTotal)}</span>
                : <><span>CGST: ₹{money(selectedInvoice.cgstTotal)}</span><span>SGST: ₹{money(selectedInvoice.sgstTotal)}</span></>}
              <strong>Total: ₹{money(selectedInvoice.grandTotal)}</strong></>}
        </div>
        {editingInvoice ? <form className="invoice-edit-form" onSubmit={saveInvoiceEdit}>
          <p className="ledger-hint">Removed lines and price or quantity changes are saved in the audit history. The customer balance is adjusted by the invoice total difference.</p>
          <label>Mandatory edit reason<textarea required maxLength="1000" value={editReason} onChange={event => setEditReason(event.target.value)} placeholder="For example: Customer returned one bag of DAP"/></label>
          <div className="invoice-edit-actions">
            <button type="button" className="quiet-light-button invoice-edit-controls" disabled={saving} onClick={() => setEditingInvoice(false)}>Cancel</button>
            <button type="submit" className="primary-button invoice-edit-controls" disabled={saving || !editItems.length}>{saving ? 'Saving…' : 'Save invoice correction'}</button>
          </div>
        </form> : <div className="invoice-detail-actions">
          <button type="button" className="quiet-light-button invoice-edit-controls" onClick={beginInvoiceEdit}>Edit invoice</button>
          <button type="button" className="primary-button invoice-print-button" onClick={printInvoice}>Print saved bill</button>
        </div>}
        {invoiceEdits.length > 0 && <section className="invoice-edit-history">
          <h3>Invoice edit history</h3>
          {invoiceEdits.map(edit => <details key={edit.id} className="invoice-edit-history-entry">
            <summary>{edit.editedAt.replace('T', ' ').slice(0, 16)} · {edit.editedBy} · ₹{money(edit.previousGrandTotal)} → ₹{money(edit.updatedGrandTotal)}</summary>
            <p><strong>Reason:</strong> {edit.reason}</p>
            <div className="invoice-edit-comparison">
              <div><strong>Before</strong>{edit.previousItems.map(item => <span key={item.lineNumber}>{item.productName} · {item.bags} bag(s) · {money(item.quantityKg)} kg · ₹{money(item.rateInclGst)} each</span>)}</div>
              <div><strong>After</strong>{edit.updatedItems.map(item => <span key={item.lineNumber}>{item.productName} · {item.bags} bag(s) · {money(item.quantityKg)} kg · ₹{money(item.rateInclGst)} each</span>)}</div>
            </div>
          </details>)}
        </section>}
      </section>}
    </>}
  </main>;
}
