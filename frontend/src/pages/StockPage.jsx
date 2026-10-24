import React, {useEffect, useState} from 'react';
import SearchableProductSelect from '../components/SearchableProductSelect.jsx';
import {API_BASE_URL} from '../api.js';

const API = API_BASE_URL;
const CUSTOM_PRODUCT = '__custom__';
const AUTHORIZED_IMAGE_OPTIONS = [
  {id: 'stamp', label: 'Stamp image'},
  {id: 'signature', label: 'Signature image'},
  {id: 'combined', label: 'Combined stamp + signature'}
];
const emptyAuthorizedSelection = {stamp: false, signature: false, combined: false};
const emptyRow = id => ({id, productId: '', productName: '', opening: '', receipts: '', sales: ''});
const toMilliunits = value => Math.round(Number(value || 0) * 1000);
const formatQuantity = value => value === 0 ? '-' : (value / 1000).toFixed(3);
const formatDate = value => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};
const localDateValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function previousReportStorageKey(dealerId) {
  return `stock.previousReport.${dealerId}`;
}

function loadPreviousReport(dealerId) {
  const saved = sessionStorage.getItem(previousReportStorageKey(dealerId));
  if (!saved) return null;
  try {
    const previous = JSON.parse(saved);
    if (!previous || !['Fertilizer', 'Pesticide'].includes(previous.reportType)
      || typeof previous.fromDate !== 'string' || typeof previous.toDate !== 'string'
      || previous.dealerId !== String(dealerId) || !Array.isArray(previous.rows))
      throw new Error('Saved stock report has an invalid format.');
    return previous;
  } catch (error) {
    sessionStorage.removeItem(previousReportStorageKey(dealerId));
    console.warn('Ignoring invalid saved stock report shortcut.', error);
    return null;
  }
}

async function readAuthorizedImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('The image must be 5 MB or smaller.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({name: file.name, src: String(reader.result)});
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

export default function StockPage({user}) {
  const [reportType, setReportType] = useState('Fertilizer');
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([emptyRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [focusProductRowId, setFocusProductRowId] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [stampRequired, setStampRequired] = useState('No');
  const [authorizedSelection, setAuthorizedSelection] = useState(emptyAuthorizedSelection);
  const [authorizedImages, setAuthorizedImages] = useState({stamp: null, signature: null, combined: null});
  const [report, setReport] = useState(null);
  const [previousReport, setPreviousReport] = useState(() => loadPreviousReport(user.dealerId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setProducts([]);
    setRows([emptyRow(1)]);
    setNextId(2);
    setFocusProductRowId(1);
    setReport(null);
    setError('');
    setLoading(true);
    const query = new URLSearchParams({dealerId: String(user.dealerId)});
    fetch(`${API}/product-management/products?${query}`, {credentials: 'include'})
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.detail || 'Could not load products.');
        return data;
      })
      .then(data => {
        if (!cancelled) setProducts(data.filter(product => product.active
          && product.category?.toLowerCase() === reportType.toLowerCase()));
      })
      .catch(e => {
        if (!cancelled) setError(e.message || 'Could not load products for this report.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reportType, user.dealerId]);

  function updateRow(rowId, patch) {
    setRows(current => current.map(row => row.id === rowId ? {...row, ...patch} : row));
    setReport(null);
  }

  function changeProduct(rowId, productId) {
    if (productId && productId !== CUSTOM_PRODUCT
      && rows.some(row => row.id !== rowId && row.productId === productId)) {
      setError('A product can only appear once in a stock report.');
      return;
    }
    setError('');
    setRows(current => {
      let next = current.map(row => row.id === rowId
        ? {...row, productId, productName: ''}
        : row);
      next = next.filter((row, index) => row.productId || index === next.length - 1);
      if (productId && next[next.length - 1]?.productId) next.push(emptyRow(nextId));
      if (!next.length) next = [emptyRow(nextId)];
      return next;
    });
    if (productId) {
      const selectedRowIndex = rows.findIndex(row => row.id === rowId);
      const isTrailingEmptyRow = selectedRowIndex === rows.length - 1 && !rows[selectedRowIndex]?.productId;
      setNextId(id => id + 1);
      setFocusProductRowId(isTrailingEmptyRow ? nextId : rows[rows.length - 1]?.id ?? null);
    } else {
      setFocusProductRowId(null);
    }
    setReport(null);
  }

  function copyPreviousReportRows() {
    if (!previousReport || previousReport.reportType !== reportType) return;
    const copiedRows = previousReport.rows.map((row, index) => ({...row, id: nextId + index}));
    setRows([...copiedRows, emptyRow(nextId + copiedRows.length)]);
    setNextId(nextId + copiedRows.length + 1);
    setFocusProductRowId(null);
    setError('');
    setReport(null);
  }

  function changeQuantity(rowId, field, value) {
    if (value !== '' && !/^\d*(?:\.\d{0,3})?$/.test(value)) return;
    updateRow(rowId, {[field]: value});
  }

  function normalizeQuantity(rowId, field, value) {
    if (value === '') return;
    const quantity = Number(value);
    updateRow(rowId, {[field]: Number.isFinite(quantity) ? quantity.toFixed(3) : ''});
  }

  function removeRow(rowId) {
    setRows(current => {
      const remaining = current.filter(row => row.id !== rowId && row.productId);
      return [...remaining, emptyRow(nextId)];
    });
    setNextId(id => id + 1);
    setReport(null);
    setError('');
  }

  async function handleAuthorizedImageChange(imageType, event) {
    const file = event.target.files?.[0];
    setAuthorizedImages(current => ({...current, [imageType]: null}));
    setReport(null);
    if (!file) return;
    try {
      const image = await readAuthorizedImage(file);
      setAuthorizedImages(current => ({...current, [imageType]: image}));
      setError('');
    } catch (e) {
      setError(e.message);
      event.target.value = '';
    }
  }

  function toggleAuthorizedImage(imageType, checked) {
    setAuthorizedSelection(current => imageType === 'combined'
      ? {...emptyAuthorizedSelection, combined: checked}
      : {...current, [imageType]: checked, combined: false});
    setReport(null);
  }

  function generateReport(event) {
    event.preventDefault();
    setError('');
    if (!fromDate || !toDate) return setError('From Date and To Date are required.');
    if (toDate < fromDate) return setError('To Date cannot be earlier than From Date.');
    const selectedRows = rows.filter(row => row.productId);
    if (!selectedRows.length) return setError('Add at least one product to the report.');
    const selectedImageTypes = ['signature', 'stamp', 'combined'].filter(type => authorizedSelection[type]);
    if (stampRequired === 'Yes' && !selectedImageTypes.length)
      return setError('Select a stamp, signature, or combined image to include in the PDF.');
    const missingImage = selectedImageTypes.find(type => !authorizedImages[type]);
    if (stampRequired === 'Yes' && missingImage)
      return setError(`Upload the selected ${AUTHORIZED_IMAGE_OPTIONS.find(option => option.id === missingImage)?.label.toLowerCase()} to include it in the PDF.`);

    const names = new Set();
    const reportRows = [];
    for (const row of selectedRows) {
      const productName = row.productId === CUSTOM_PRODUCT
        ? (row.productName || '').trim()
        : products.find(product => String(product.id) === row.productId)?.productName || (row.productName || '').trim();
      if (!productName) return setError('Enter a name for each runtime product.');
      const duplicateKey = productName.trim().toLocaleLowerCase();
      if (names.has(duplicateKey)) return setError(`Duplicate product: ${productName}.`);
      names.add(duplicateKey);
      const values = [row.opening, row.receipts, row.sales];
      if (values.some(value => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)))
        return setError(`Quantities for ${productName} must be zero or greater.`);
      if (values.some(value => value.includes('.') && value.split('.')[1].length > 3))
        return setError(`Quantities for ${productName} may have at most 3 decimal places.`);
      const opening = toMilliunits(row.opening);
      const receipts = toMilliunits(row.receipts);
      const sales = toMilliunits(row.sales);
      const total = opening + receipts;
      if (sales > total)
        return setError(`Sales for ${productName} cannot exceed opening balance plus receipts (${formatQuantity(total)}).`);
      reportRows.push({productName, opening, receipts, total, sales, closing: total - sales});
    }
    const savedReport = {
      dealerId: String(user.dealerId), reportType, fromDate, toDate,
      rows: selectedRows.map(row => ({
        ...row,
        productName: row.productId === CUSTOM_PRODUCT
          ? (row.productName || '').trim()
          : products.find(product => String(product.id) === row.productId)?.productName || (row.productName || '').trim()
      }))
    };
    setReport({
        reportType, fromDate, toDate, stampRequired: stampRequired === 'Yes',
        authorizedImages: stampRequired === 'Yes'
          ? selectedImageTypes.map(type => ({type, ...authorizedImages[type]}))
        : [],
        rows: reportRows
    });
    setPreviousReport(savedReport);
    try {
        sessionStorage.setItem(previousReportStorageKey(user.dealerId), JSON.stringify(savedReport));
    } catch (storageError) {
        console.error('Could not save the previous stock report shortcut.', storageError);
        setError('Report generated, but this browser could not save it for quick reuse later.');
    }
  }

  const productOptions = [
    ...products.map(product => ({value: String(product.id), label: product.productName})),
    {value: CUSTOM_PRODUCT, label: 'Add runtime product…'}
  ];

  return <main className="stock-report-page">
    <header className="admin-heading stock-screen-heading">
      <span className="eyebrow">STOCK REPORT</span>
      <h1>Stock reports</h1>
      <p>Create a date-range fertilizer or pesticide stock report. Runtime products are only included in this report and are not saved to the product catalog.</p>
    </header>

    <section className="admin-card stock-report-controls">
      <div className="stock-report-types" role="tablist" aria-label="Stock report type">
        {['Fertilizer', 'Pesticide'].map(type => <button
          key={type}
          type="button"
          role="tab"
          aria-selected={reportType === type}
          className={reportType === type ? 'active' : ''}
          onClick={() => setReportType(type)}
        >{type} Stock Report</button>)}
      </div>
      <form onSubmit={generateReport}>
        <div className="stock-report-fields">
          <label>From Date<input type="date" required value={fromDate} onChange={e => {setFromDate(e.target.value); setReport(null);}}/></label>
          <label>To Date<input type="date" required value={toDate} min={fromDate || undefined} onChange={e => {setToDate(e.target.value); setReport(null);}}/></label>
          <label>Authorized Stamp Required<select value={stampRequired} onChange={e => {setStampRequired(e.target.value); setReport(null);}}><option>No</option><option>Yes</option></select></label>
          <div className="stock-report-shortcuts"><button type="button" className="quiet-light-button" onClick={() => {const today = localDateValue(new Date()); setFromDate(today); setToDate(today); setReport(null);}}>Today</button><button type="button" className="quiet-light-button" disabled={!previousReport} onClick={() => {setFromDate(previousReport.fromDate); setToDate(previousReport.toDate); setReport(null);}}>Use previous report dates</button></div>
          {stampRequired === 'Yes' && <fieldset className="stock-authorized-image-options">
            <legend>Choose an authorized image to include</legend>
            {AUTHORIZED_IMAGE_OPTIONS.map(option => {
              const image = authorizedImages[option.id];
              return <label className={`stock-authorized-image-card ${authorizedSelection[option.id] ? 'selected' : ''}`} key={option.id}>
                <span><input type="checkbox" checked={authorizedSelection[option.id]} onChange={event => toggleAuthorizedImage(option.id, event.target.checked)}/>{option.label}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload ${option.label.toLowerCase()}`} onChange={event => handleAuthorizedImageChange(option.id, event)}/>
                <small>{image ? `Selected: ${image.name}` : 'JPG, PNG, or WebP · max 5 MB'}</small>
              </label>;
            })}
          </fieldset>}
        </div>

        <div className="item-list-heading stock-list-heading"><h2>{reportType} products</h2><div className="stock-list-actions"><button type="button" className="quiet-light-button" disabled={!previousReport || previousReport.reportType !== reportType} onClick={copyPreviousReportRows}>Copy previous report rows</button><span>{rows.filter(row => row.productId).length} selected</span></div></div>
        <div className="stock-entry-columns"><span>Product</span><span>O/P Balance</span><span>Receipts</span><span>Sales</span><span></span></div>
        {loading && <p className="admin-help">Loading {reportType.toLowerCase()} products…</p>}
        {!loading && products.length === 0 && <p className="admin-help">No active products are categorized as {reportType}. You can still add runtime products below.</p>}
        {rows.map((row, index) => {
          const rowOptions = row.productId && row.productId !== CUSTOM_PRODUCT
            && !productOptions.some(option => option.value === row.productId)
            ? [...productOptions, {value: row.productId, label: row.productName || 'Previously selected product'}]
            : productOptions;
          return <div className="stock-entry-row" key={row.id}>
          <div className={`stock-product-entry ${row.productId === CUSTOM_PRODUCT ? 'custom-product-selected' : ''}`}>
            <SearchableProductSelect
              options={rowOptions}
              value={row.productId}
              onChange={value => changeProduct(row.id, value)}
              placeholder="Search products…"
              ariaLabel={`Product ${index + 1}`}
              autoFocus={row.id === focusProductRowId}
            />
            {row.productId === CUSTOM_PRODUCT && <input aria-label={`Runtime product name ${index + 1}`} maxLength="200" placeholder="Product name" value={row.productName} onChange={e => updateRow(row.id, {productName: e.target.value})}/>}
          </div>
          {['opening', 'receipts', 'sales'].map(field => <input
            key={field}
            aria-label={`${field} for product ${index + 1}`}
            className="stock-quantity-input"
            type="text"
            inputMode="decimal"
            maxLength="13"
            placeholder="0.000"
            value={row[field]}
            onChange={e => changeQuantity(row.id, field, e.target.value)}
            onBlur={e => normalizeQuantity(row.id, field, e.target.value)}
          />)}
          {row.productId
            ? <button type="button" className="remove-button" aria-label={`Remove product ${index + 1}`} onClick={() => removeRow(row.id)}>×</button>
            : <span/>}
          </div>;
        })}
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="stock-form-actions"><button className="primary-button" type="submit">Generate Report</button></div>
      </form>
    </section>

    {report && <section className="admin-card stock-report-output">
      <div className="stock-output-toolbar"><h2>Report preview</h2><button className="primary-button" type="button" onClick={() => window.print()}>Print / Save PDF</button></div>
      <div className="stock-report-paper">
        <table className="stock-print-table">
          <thead>
            <tr><th colSpan="7">{user.dealerName?.toLocaleUpperCase() || 'NATARAJA FERTILIZERS'}</th></tr>
            <tr><th colSpan="7">{report.reportType === 'Pesticide' ? `PL NO:${user.plNo || ''}` : `AGL NO:${user.aglNo || ''}`}</th></tr>
            <tr><th colSpan="7">STOCK REPORT OF {report.reportType === 'Pesticide' ? 'PESTICIDES' : 'FERTILIZERS'}</th></tr>
            <tr><th colSpan="7">DATE : {formatDate(report.fromDate)} TO {formatDate(report.toDate)}</th></tr>
            <tr>
              <th>S.No</th><th>Product Name</th><th>O/P Balance</th><th>Receipts</th>
              <th>Total Available</th><th>Sales</th>
              <th>{report.reportType === 'Pesticide' ? 'Closing Balance(ltr(s)/kg(s))' : 'Closing Balance'}</th>
            </tr>
          </thead>
          <tbody>{report.rows.map((row, index) => <tr key={`${row.productName}-${index}`}>
            <td>{index + 1}</td><td>{row.productName}</td>
            <td>{formatQuantity(row.opening)}</td><td>{formatQuantity(row.receipts)}</td>
            <td>{formatQuantity(row.total)}</td><td>{formatQuantity(row.sales)}</td>
            <td>{formatQuantity(row.closing)}</td>
          </tr>)}</tbody>
        </table>
        {report.stampRequired && <div className="stock-authorized-stamp">{report.authorizedImages.map(image => <img key={image.type} className={`stock-authorized-image ${image.type}`} src={image.src} alt={AUTHORIZED_IMAGE_OPTIONS.find(option => option.id === image.type)?.label || 'Authorized image'}/>)}</div>}
      </div>
    </section>}
  </main>;
}
