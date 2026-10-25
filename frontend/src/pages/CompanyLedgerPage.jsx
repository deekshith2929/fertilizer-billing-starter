import React, {useEffect, useMemo, useRef, useState} from 'react';
import {API_BASE_URL} from '../api.js';
import {readSupplierLedgerDocument} from '../utils/supplierLedgerDocumentReader.js';

const blankSupplier = {supplierName: '', supplierCode: '', contactName: '', phone: '', email: '', address: ''};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const money = value => new Intl.NumberFormat('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(value || 0));
const entryLabels = {OPENING: 'Opening balance', PURCHASE: 'Purchase / invoice', PAYMENT: 'Payment'};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/company-ledger/${path}`, {
    ...options,
    credentials: 'include',
    headers: {...options.headers, ...(options.body ? {'Content-Type': 'application/json'} : {})}
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.detail || 'Supplier ledger request failed.');
  return data;
}

async function loadDealers() {
  const response = await fetch(`${API_BASE_URL}/admin/dealers`, {credentials: 'include'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.detail || 'Could not load dealers.');
  return data;
}

function parseDocument(text) {
  const normalized = text.replace(/\s+/g, ' ');
  const dateMatch = normalized.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b|\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  let entryDate = '';
  if (dateMatch) {
    if (dateMatch[4]) entryDate = `${dateMatch[4]}-${dateMatch[5].padStart(2, '0')}-${dateMatch[6].padStart(2, '0')}`;
    else {
      const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
      entryDate = `${year}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
    }
    const [year, month, day] = entryDate.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) entryDate = '';
  }
  const amountMatch = normalized.match(/(?:grand\s*total|invoice\s*total|net\s*amount|amount\s*paid|paid|total\s*amount|total)\D{0,24}(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const referenceMatch = normalized.match(/(?:invoice|inv(?:oice)?|bill)\s*(?:no\.?|number|#)\s*[:.-]?\s*([a-z0-9/-]{2,40})/i);
  return {
    entryType: /\b(payment|paid|receipt)\b/i.test(normalized) ? 'PAYMENT' : 'PURCHASE',
    entryDate,
    amount: amountMatch ? amountMatch[1].replace(/,/g, '') : '',
    reference: referenceMatch ? referenceMatch[1] : ''
  };
}

function balanceLabel(value) {
  const amount = Number(value || 0);
  if (amount < 0) return `Advance ₹${money(Math.abs(amount))}`;
  return `Payable ₹${money(amount)}`;
}

export default function CompanyLedgerPage({user}) {
  const canManageAllDealers = user.permissions?.includes('DEALER_MANAGE') || false;
  const [dealers, setDealers] = useState([]);
  const [dealerId, setDealerId] = useState(String(user.dealerId || ''));
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [entries, setEntries] = useState([]);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [entryEditHistory, setEntryEditHistory] = useState({});
  const [supplierForm, setSupplierForm] = useState(blankSupplier);
  const [entryForm, setEntryForm] = useState({entryType: 'PURCHASE', entryDate: today(), amount: '', openingBalanceSide: 'PAYABLE', reference: '', notes: ''});
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const documentInput = useRef(null);
  const entryFormElement = useRef(null);
  const [documentText, setDocumentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const dealerIdRef = useRef(dealerId);
  const supplierIdRef = useRef(supplierId);
  dealerIdRef.current = dealerId;
  supplierIdRef.current = supplierId;
  const selectedSupplier = useMemo(
    () => suppliers.find(supplier => String(supplier.id) === supplierId),
    [suppliers, supplierId]
  );

  async function loadSuppliers(forDealerId = dealerId) {
    const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(forDealerId)}` : '';
    const data = await request(`suppliers${query}`);
    if (dealerIdRef.current !== forDealerId) return;
    setSuppliers(data);
    setSupplierId(current => data.some(item => String(item.id) === current) ? current : (data[0] ? String(data[0].id) : ''));
  }

  async function loadEntries(forDealerId = dealerId, forSupplierId = supplierId) {
    if (!forSupplierId) {
      setEntries([]);
      return;
    }
    const query = new URLSearchParams();
    if (canManageAllDealers) query.set('dealerId', forDealerId);
    if (fromDate) query.set('fromDate', fromDate);
    if (toDate) query.set('toDate', toDate);
    const params = query.toString();
    const suffix = params ? `?${params}` : '';
    const data = await request(`suppliers/${forSupplierId}/entries${suffix}`);
    if (dealerIdRef.current === forDealerId && supplierIdRef.current === forSupplierId) setEntries(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoading(true);
      setError('');
      setNotice('');
      setDocumentText('');
      setSelectedFile(null);
      if (documentInput.current) documentInput.current.value = '';
      setFromDate('');
      setToDate('');
      setEntryForm({entryType: 'PURCHASE', entryDate: today(), amount: '', openingBalanceSide: 'PAYABLE', reference: '', notes: ''});
      setEditingEntryId(null);
      setExpandedHistoryId(null);
      setEntryEditHistory({});
      try {
        if (canManageAllDealers) {
          const data = await loadDealers();
          if (cancelled) return;
          setDealers(data);
          if (!data.some(item => String(item.id) === dealerId)) {
            setDealerId(data[0] ? String(data[0].id) : '');
            setSuppliers([]);
            setEntries([]);
            return;
          }
        }
        await loadSuppliers();
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
    if (!supplierId) {
      setEntries([]);
      return () => {cancelled = true;};
    }
    request(`suppliers/${supplierId}/entries?${new URLSearchParams({
      ...(canManageAllDealers ? {dealerId} : {}),
      ...(fromDate ? {fromDate} : {}),
      ...(toDate ? {toDate} : {})
    }).toString()}`)
      .then(data => {if (!cancelled) setEntries(data);})
      .catch(requestError => {if (!cancelled) setError(requestError.message);});
    return () => {cancelled = true;};
  }, [dealerId, supplierId, fromDate, toDate, canManageAllDealers]);

  async function createSupplier(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(dealerId)}` : '';
      await request(`suppliers${query}`, {method: 'POST', body: JSON.stringify(supplierForm)});
      setSupplierForm(blankSupplier);
      await loadSuppliers();
      setNotice('Supplier added.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!supplierId) {
      setError('Add or select a supplier first.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(dealerId)}` : '';
      const path = `suppliers/${supplierId}/entries${editingEntryId ? `/${editingEntryId}` : ''}${query}`;
      const wasEditing = editingEntryId !== null;
      let changed = true;
      if (wasEditing) changed = await request(path, {method: 'PUT', body: JSON.stringify(entryForm)});
      else await request(path, {method: 'POST', body: JSON.stringify(entryForm)});
      setEditingEntryId(null);
      setEntryForm(current => ({...current, amount: '', reference: '', notes: ''}));
      if (wasEditing) setEntryEditHistory(current => {
        const next = {...current};
        delete next[editingEntryId];
        return next;
      });
      await Promise.all([loadSuppliers(dealerId), loadEntries(dealerId, supplierId)]);
      setNotice(wasEditing
        ? changed ? 'Ledger entry updated. The change is recorded in its edit history.' : 'No changes were made to this ledger entry.'
        : 'Ledger entry saved.');
      setDocumentText('');
      setSelectedFile(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditingEntry(entry) {
    setEditingEntryId(entry.id);
    setNotice('');
    setError('');
    setEntryForm({
      entryType: entry.entryType,
      entryDate: entry.entryDate,
      amount: String(entry.entryType === 'PAYMENT' || (entry.entryType === 'OPENING' && Number(entry.debitAmount) > 0)
        ? entry.debitAmount : entry.creditAmount),
      openingBalanceSide: Number(entry.debitAmount) > 0 ? 'ADVANCE' : 'PAYABLE',
      reference: entry.reference || '',
      notes: entry.notes || ''
    });
    entryFormElement.current?.scrollIntoView({behavior: 'smooth', block: 'center'});
  }

  function cancelEditingEntry() {
    setEditingEntryId(null);
    setEntryForm({entryType: 'PURCHASE', entryDate: today(), amount: '', openingBalanceSide: 'PAYABLE', reference: '', notes: ''});
    setError('');
  }

  async function toggleEntryHistory(entryId) {
    if (expandedHistoryId === entryId) {
      setExpandedHistoryId(null);
      return;
    }
    const historyDealerId = dealerId;
    const historySupplierId = supplierId;
    setExpandedHistoryId(entryId);
    if (entryEditHistory[entryId]) return;
    setError('');
    try {
      const query = canManageAllDealers ? `?dealerId=${encodeURIComponent(historyDealerId)}` : '';
      const history = await request(`suppliers/${historySupplierId}/entries/${entryId}/history${query}`);
      if (dealerIdRef.current === historyDealerId && supplierIdRef.current === historySupplierId)
        setEntryEditHistory(current => ({...current, [entryId]: history}));
    } catch (requestError) {
      if (dealerIdRef.current === historyDealerId && supplierIdRef.current === historySupplierId) {
        setExpandedHistoryId(null);
        setError(requestError.message);
      }
    }
  }

  async function readDocument() {
    if (!selectedFile) return;
    const readingDealerId = dealerId;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'application/pdf'].includes(selectedFile.type)) {
      setError('Choose a JPG, PNG, WebP, BMP, or PDF file.');
      setSelectedFile(null);
      if (documentInput.current) documentInput.current.value = '';
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Choose a file smaller than 10 MB.');
      setSelectedFile(null);
      if (documentInput.current) documentInput.current.value = '';
      return;
    }
    setReading(true);
    setError('');
    setNotice('');
    try {
      const text = await readSupplierLedgerDocument(selectedFile);
      if (dealerIdRef.current !== readingDealerId) return;
      setDocumentText(text);
      const parsed = parseDocument(text);
      setEntryForm(current => ({
        ...current,
        entryType: parsed.entryType,
        entryDate: parsed.entryDate || current.entryDate,
        amount: parsed.amount || current.amount,
        reference: parsed.reference || current.reference
      }));
      const matchedSupplier = suppliers.find(item => text.toLowerCase().includes(item.supplierName.toLowerCase()));
      if (matchedSupplier) setSupplierId(String(matchedSupplier.id));
      setNotice('Document read in this browser. Review every field before saving.');
    } catch (readError) {
      setError(readError.message || 'Could not read this document. Enter the details manually.');
    } finally {
      setSelectedFile(null);
      if (documentInput.current) documentInput.current.value = '';
      setReading(false);
    }
  }

  const displayedBalance = selectedSupplier?.balance;

  return <main className="supplier-ledger-layout">
    <header className="supplier-ledger-heading">
      <div><span className="eyebrow">SUPPLIER ACCOUNTS</span><h1>Company / Dealer Ledger</h1>
        <p>Track opening balances, purchase invoices, and payments for each supplier. Ledger entries do not change stock.</p></div>
      {canManageAllDealers && <label className="ledger-dealer-select">Dealer
        <select value={dealerId} disabled={saving || reading || editingEntryId !== null} onChange={event => setDealerId(event.target.value)}>
          {dealers.map(dealer => <option key={dealer.id} value={dealer.id}>{dealer.displayName || dealer.legalName}</option>)}
        </select>
      </label>}
    </header>
    {error && <p className="ledger-message ledger-error" role="alert">{error}</p>}
    {notice && <p className="ledger-message ledger-notice" role="status">{notice}</p>}
    {loading ? <p className="admin-help">Loading supplier ledger…</p> : <>
      <div className="supplier-ledger-cards">
        <section className="admin-card">
          <h2>Add supplier</h2>
          <form className="admin-form" onSubmit={createSupplier}>
            <label>Supplier / company name<input required maxLength="200" value={supplierForm.supplierName} onChange={event => setSupplierForm({...supplierForm, supplierName: event.target.value})}/></label>
            <label>Supplier code<input maxLength="60" value={supplierForm.supplierCode} onChange={event => setSupplierForm({...supplierForm, supplierCode: event.target.value})}/></label>
            <label>Contact name<input maxLength="200" value={supplierForm.contactName} onChange={event => setSupplierForm({...supplierForm, contactName: event.target.value})}/></label>
            <label>Phone<input maxLength="30" value={supplierForm.phone} onChange={event => setSupplierForm({...supplierForm, phone: event.target.value})}/></label>
            <label>Email<input type="email" maxLength="200" value={supplierForm.email} onChange={event => setSupplierForm({...supplierForm, email: event.target.value})}/></label>
            <label>Address<input maxLength="2000" value={supplierForm.address} onChange={event => setSupplierForm({...supplierForm, address: event.target.value})}/></label>
            <button className="primary-button" disabled={saving || !dealerId}>{saving ? 'Saving…' : 'Add supplier'}</button>
          </form>
        </section>

        <section className="admin-card">
          <h2>Supplier ledger</h2>
          {suppliers.length === 0 ? <p className="admin-help">Add a supplier to start recording balances and transactions.</p> : <>
            <div className="supplier-ledger-toolbar">
              <label>Supplier<select value={supplierId} disabled={saving || reading || editingEntryId !== null} onChange={event => setSupplierId(event.target.value)}>
                {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>)}
              </select></label>
              {selectedSupplier && <div className="ledger-balance"><span>Current balance</span><strong>{balanceLabel(displayedBalance)}</strong></div>}
            </div>

            <form className="ledger-entry-form" ref={entryFormElement} onSubmit={saveEntry}>
              <h3>{editingEntryId ? 'Edit ledger entry' : 'Record a transaction'}</h3>
              <div className="ledger-form-grid">
                <label>Entry type<select value={entryForm.entryType} onChange={event => setEntryForm({...entryForm, entryType: event.target.value})}>
                  <option value="OPENING">Opening balance</option><option value="PURCHASE">Purchase / invoice</option><option value="PAYMENT">Payment</option>
                </select></label>
                <label>Date<input type="date" required value={entryForm.entryDate} onChange={event => setEntryForm({...entryForm, entryDate: event.target.value})}/></label>
                <label>Amount (₹)<input type="number" min="0.01" step="0.01" required value={entryForm.amount} onChange={event => setEntryForm({...entryForm, amount: event.target.value})}/></label>
                <label>Reference / invoice no.<input maxLength="100" value={entryForm.reference} onChange={event => setEntryForm({...entryForm, reference: event.target.value})}/></label>
                {entryForm.entryType === 'OPENING' && <label>Opening balance<select value={entryForm.openingBalanceSide} onChange={event => setEntryForm({...entryForm, openingBalanceSide: event.target.value})}>
                  <option value="PAYABLE">Amount payable to supplier</option><option value="ADVANCE">Advance paid to supplier</option>
                </select></label>}
                <label className="ledger-notes">Notes<input maxLength="1000" value={entryForm.notes} onChange={event => setEntryForm({...entryForm, notes: event.target.value})}/></label>
              </div>
              <div className="ledger-entry-actions">
                <button className="primary-button" disabled={saving || !supplierId}>{saving ? 'Saving…' : editingEntryId ? 'Update ledger entry' : 'Save ledger entry'}</button>
                {editingEntryId && <button className="quiet-light-button" type="button" disabled={saving} onClick={cancelEditingEntry}>Cancel edit</button>}
              </div>
              {entryForm.entryType === 'PURCHASE' && <p className="ledger-hint">A purchase increases the payable balance. Its invoice reference must be unique for this supplier.</p>}
              {entryForm.entryType === 'PAYMENT' && <p className="ledger-hint">A payment reduces the payable balance; an overpayment is shown as an advance.</p>}
            </form>

            <section className="ledger-document-reader">
              <h3>Optional invoice / payment document reader</h3>
              <p>Select a JPG, PNG, WebP, BMP, or PDF up to 10 MB to prefill the form. The first five PDF pages are read in your browser; the document is not uploaded or saved. OCR engine assets are downloaded from jsDelivr when needed, but your document is not sent there. Check all fields before saving.</p>
              <div className="ledger-document-controls">
                <input ref={documentInput} type="file" accept="image/jpeg,image/png,image/webp,image/bmp,application/pdf" onChange={event => setSelectedFile(event.target.files?.[0] || null)}/>
                <button type="button" className="quiet-light-button" disabled={!selectedFile || reading} onClick={readDocument}>{reading ? 'Reading document…' : 'Read document'}</button>
              </div>
              {documentText && <details className="ledger-ocr-preview"><summary>Review extracted text</summary><pre>{documentText}</pre></details>}
            </section>
          </>}
        </section>
      </div>

      {selectedSupplier && <section className="admin-card ledger-history">
        <div className="admin-list-heading"><h2>{selectedSupplier.supplierName} — ledger</h2>
          <div className="ledger-filters">
            <label>From<input type="date" max={toDate || undefined} value={fromDate} onChange={event => setFromDate(event.target.value)}/></label>
            <label>To<input type="date" min={fromDate || undefined} value={toDate} onChange={event => setToDate(event.target.value)}/></label>
            <button type="button" className="quiet-light-button" onClick={() => window.print()}>Print statement</button>
          </div>
        </div>
        <p className="ledger-print-balance">Current balance: {balanceLabel(selectedSupplier.balance)}</p>
        <p className="ledger-hint">Running balances include all entries before the selected date range.</p>
        {entries.length === 0 ? <p className="admin-help">No ledger entries for this period.</p> : <div className="admin-table-wrap">
          <table className="admin-table supplier-ledger-table">
            <thead><tr><th>Date</th><th>Entry</th><th>Reference</th><th>Notes</th><th>Debit (₹)</th><th>Credit (₹)</th><th>Balance (₹)</th><th>Recorded by</th><th>Actions</th></tr></thead>
            <tbody>{entries.map(entry => <React.Fragment key={entry.id}><tr>
              <td>{entry.entryDate}</td><td>{entryLabels[entry.entryType] || entry.entryType}</td><td>{entry.reference || '—'}</td>
              <td>{entry.notes || '—'}</td><td>{money(entry.debitAmount)}</td><td>{money(entry.creditAmount)}</td>
              <td>{balanceLabel(entry.runningBalance)}</td><td>{entry.createdBy || '—'}</td>
              <td className="ledger-row-actions">
                <button type="button" disabled={saving || reading || editingEntryId !== null} onClick={() => startEditingEntry(entry)}>Edit</button>
                <button type="button" onClick={() => toggleEntryHistory(entry.id)}>{expandedHistoryId === entry.id ? 'Hide history' : 'Edit history'}</button>
              </td>
            </tr>{expandedHistoryId === entry.id && <tr className="ledger-history-row"><td colSpan="9">
              {!entryEditHistory[entry.id] ? <p className="admin-help">Loading edit history…</p>
                : entryEditHistory[entry.id].length === 0 ? <p className="admin-help">No edits recorded for this entry.</p>
                  : entryEditHistory[entry.id].map(edit => {
                    const fields = [
                      ['Type', 'entryType', value => entryLabels[value] || value],
                      ['Date', 'entryDate', value => value],
                      ['Reference', 'reference', value => value || '—'],
                      ['Notes', 'notes', value => value || '—'],
                      ['Debit', 'debitAmount', value => money(value)],
                      ['Credit', 'creditAmount', value => money(value)]
                    ];
                    const changes = fields.filter(([, key]) => edit.previousValues[key] !== edit.updatedValues[key]);
                    return <section className="ledger-history-item" key={edit.id}>
                      <strong>{new Date(edit.changedAt).toLocaleString()} · {edit.changedBy}</strong>
                      {changes.length === 0 ? <p>Entry was saved without changing its values.</p> : <ul>
                        {changes.map(([label, key, format]) => <li key={key}><span>{label}:</span> {format(edit.previousValues[key])} <span aria-hidden="true">→</span> {format(edit.updatedValues[key])}</li>)}
                      </ul>}
                    </section>;
                  })}
            </td></tr>}</React.Fragment>)}</tbody>
          </table>
        </div>}
      </section>}
    </>}
  </main>;
}
