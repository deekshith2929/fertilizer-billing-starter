import React, {useEffect, useRef, useState} from 'react';
import {API_BASE_URL} from '../api.js';

const API = `${API_BASE_URL}/dealer-price-lists`;
const PRODUCT_API = `${API_BASE_URL}/product-management`;
const emptyForm = {
  tradeName: '', technicalName: '', unitSize: '', unit: '', priceExGstPerUnit: '',
  gstPercent: '', priceInclGstPerUnit: '', mrpPerUnit: '', category: '',
  comments: '', sourceReference: '', reviewStatus: 'READY', reason: ''
};
const emptyInventoryProduct = {
  productCode: '', productName: '', brand: '', hsnCode: '', category: '',
  bagSizeKg: '', gstRate: '', defaultPriceInclGst: ''
};
const money = value => value == null ? '—' : new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(Number(value));
const dateLabel = value => value || 'Date not provided';
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API}/${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      ...(options.body && !isFormData ? {'Content-Type': 'application/json'} : {})
    }
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(typeof data === 'string' ? data : data.message || data.detail || 'Price-list request failed.');
  }
  return data;
}

async function requestProduct(path, options = {}) {
  const response = await fetch(`${PRODUCT_API}/${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      ...(options.body ? {'Content-Type': 'application/json'} : {})
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(typeof data === 'string' ? data : data.message || data.detail || 'Product request failed.');
  }
  return data;
}

function inventoryProductFromItem(item) {
  const unit = String(item.unit || '').trim().toLowerCase();
  const unitSize = Number(item.unitSize);
  const bagSizeKg = ['g', 'ml'].includes(unit) ? unitSize / 1000 : unitSize;
  return {
    ...emptyInventoryProduct,
    productName: item.tradeName || item.technicalName || '',
    category: item.category || '',
    bagSizeKg: Number.isFinite(bagSizeKg) && item.unitSize !== '' ? String(bagSizeKg) : '',
    gstRate: item.gstPercent || '',
    defaultPriceInclGst: item.priceInclGstPerUnit || ''
  };
}

function inventoryProductFromPrice(item) {
  const unit = String(item.unit || '').trim().toLowerCase();
  const unitSize = Number(item.unitSize);
  const bagSizeKg = ['g', 'ml'].includes(unit) ? unitSize / 1000 : unitSize;
  return {
    ...emptyInventoryProduct,
    productName: item.tradeName || item.technicalName || '',
    category: item.category || '',
    bagSizeKg: Number.isFinite(bagSizeKg) ? String(bagSizeKg) : '',
    gstRate: item.gstPercent == null ? '' : String(item.gstPercent),
    defaultPriceInclGst: item.priceInclGstPerUnit == null ? '' : String(item.priceInclGstPerUnit)
  };
}

function calculatedPrice(value, gstPercent, calculateInclusive) {
  if (value === '' || gstPercent === '') return null;
  const amount = Number(value);
  const gst = Number(gstPercent);
  if (!Number.isFinite(amount) || !Number.isFinite(gst) || amount < 0 || gst < 0 || gst > 100) return null;
  const calculated = calculateInclusive
    ? amount * (1 + gst / 100)
    : amount / (1 + gst / 100);
  return (Math.round((calculated + Number.EPSILON) * 100) / 100).toFixed(2);
}

function formFromItem(item, reason = '') {
  return {
    tradeName: item.tradeName || '',
    technicalName: item.technicalName || '',
    unitSize: item.unitSize ?? '',
    unit: item.unit || '',
    priceExGstPerUnit: item.priceExGstPerUnit ?? '',
    gstPercent: item.gstPercent ?? '',
    priceInclGstPerUnit: item.priceInclGstPerUnit ?? '',
    mrpPerUnit: item.mrpPerUnit ?? '',
    category: item.category || '',
    comments: item.comments || '',
    sourceReference: item.sourceReference || '',
    reviewStatus: item.reviewStatus || 'READY',
    reason
  };
}

function requestBody(form) {
  return {
    ...form,
    unitSize: form.unitSize === '' ? null : Number(form.unitSize),
    priceExGstPerUnit: form.priceExGstPerUnit === '' ? null : Number(form.priceExGstPerUnit),
    gstPercent: form.gstPercent === '' ? null : Number(form.gstPercent),
    priceInclGstPerUnit: form.priceInclGstPerUnit === '' ? null : Number(form.priceInclGstPerUnit),
    mrpPerUnit: form.mrpPerUnit === '' ? null : Number(form.mrpPerUnit)
  };
}

export default function DealerPriceListsPage({user}) {
  const canManage = user.permissions?.includes('DEALER_PRICE_LIST_MANAGE') || false;
  const canCreateInventoryProduct = user.permissions?.includes('PRODUCT_MANAGE')
    && user.permissions?.includes('DEALER_PRICE_MANAGE');
  const [prompt, setPrompt] = useState('');
  const [companies, setCompanies] = useState([]);
  const [technicalNames, setTechnicalNames] = useState([]);
  const [manualForm, setManualForm] = useState({
    companyName: '', effectiveDate: localDate(), item: {...emptyForm},
    addToInventory: false, inventoryProduct: {...emptyInventoryProduct}
  });
  const manualPriceBasis = useRef('priceExGstPerUnit');
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [imports, setImports] = useState([]);
  const [selectedImport, setSelectedImport] = useState(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [loadingImportId, setLoadingImportId] = useState(null);
  const reviewSectionRef = useRef(null);
  const [editingDraft, setEditingDraft] = useState(null);
  const [draftForm, setDraftForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState(null);
  const [editingCurrent, setEditingCurrent] = useState(null);
  const [revisionForm, setRevisionForm] = useState(emptyForm);
  const [inventoryPrice, setInventoryPrice] = useState(null);
  const [inventoryPriceForm, setInventoryPriceForm] = useState(emptyInventoryProduct);
  const [audit, setAudit] = useState([]);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  function updateManualItem(key, value) {
    if (key === 'priceExGstPerUnit' || key === 'priceInclGstPerUnit') {
      manualPriceBasis.current = key;
    }
    setManualForm(current => {
      const item = {...current.item, [key]: value};
      const basis = manualPriceBasis.current;
      const sourceKey = basis;
      const targetKey = basis === 'priceExGstPerUnit'
        ? 'priceInclGstPerUnit' : 'priceExGstPerUnit';
      const gstPercent = key === 'gstPercent' ? value : item.gstPercent;
      const calculated = calculatedPrice(item[sourceKey], gstPercent, basis === 'priceExGstPerUnit');
      if (calculated !== null) item[targetKey] = calculated;
      else if (item[sourceKey] === '' || key === 'gstPercent') item[targetKey] = '';

      const inventoryProduct = {...current.inventoryProduct};
      if (key === 'tradeName' && (!inventoryProduct.productName
          || inventoryProduct.productName === current.item.technicalName)) {
        inventoryProduct.productName = value;
      }
      if (key === 'technicalName' && !item.tradeName
          && (!inventoryProduct.productName || inventoryProduct.productName === current.item.technicalName)) {
        inventoryProduct.productName = value;
      }
      if (key === 'category') inventoryProduct.category = value;
      if (key === 'unitSize') {
        const unit = String(item.unit || '').trim().toLowerCase();
        const size = Number(value);
        inventoryProduct.bagSizeKg = value === '' || !Number.isFinite(size) ? ''
          : String(['g', 'ml'].includes(unit) ? size / 1000 : size);
      }
      if (key === 'unit') {
        const size = Number(item.unitSize);
        inventoryProduct.bagSizeKg = item.unitSize === '' || !Number.isFinite(size) ? ''
          : String(['g', 'ml'].includes(value.trim().toLowerCase()) ? size / 1000 : size);
      }
      if (key === 'gstPercent') inventoryProduct.gstRate = value;
      if (key === 'priceInclGstPerUnit' || targetKey === 'priceInclGstPerUnit') {
        inventoryProduct.defaultPriceInclGst = item.priceInclGstPerUnit;
      }
      return {...current, item, inventoryProduct};
    });
  }

  async function loadImports() {
    setImports(await request('imports'));
  }

  useEffect(() => {
    let active = true;
    Promise.all([request('prompt'), request('imports'), request('audit'), request('companies'), request('technical-names')])
      .then(([promptText, importRows, auditRows, companyRows, technicalNameRows]) => {
        if (!active) return;
        setPrompt(promptText);
        setImports(importRows);
        setAudit(auditRows);
        setCompanies(companyRows);
        setTechnicalNames(technicalNameRows);
      })
      .catch(exception => {
        if (active) setError(exception.message || 'Could not load dealer price lists.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (reviewSectionRef.current) {
      reviewSectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }, [selectedImport?.id]);

  async function downloadTemplate() {
    setError('');
    try {
      const response = await fetch(`${API}/template`, {credentials: 'include'});
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.detail || 'Could not download the template.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dealer-price-list-template.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (exception) {
      setError(exception.message || 'Could not download the template.');
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice('Conversion prompt copied.');
      setError('');
    } catch (exception) {
      setError(exception.message || 'Could not copy the prompt. Select and copy the text manually.');
    }
  }

  async function submitImport(event) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const data = new FormData();
      data.append('file', file);
      const imported = await request('imports', {method: 'POST', body: data});
      setSelectedImport(imported);
      setReviewOnly(false);
      setSelectedItemIds([]);
      setEditingDraft(null);
      setFile(null);
      setFileInputKey(current => current + 1);
      await loadImports();
      setNotice(`Imported ${imported.items.length} rows for review. Current prices have not changed.`);
    } catch (exception) {
      setError(exception.message || 'Could not import the price list.');
    } finally {
      setUploading(false);
    }
  }

  async function addManualPrice(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    let inventoryProductCreated = false;
    let companyPriceCreated = false;
    try {
      if (manualForm.addToInventory) {
        await requestProduct('products', {
          method: 'POST',
          body: JSON.stringify({
            ...manualForm.inventoryProduct,
            dealerId: Number(user.dealerId),
            bagSizeKg: Number(manualForm.inventoryProduct.bagSizeKg),
            gstRate: Number(manualForm.inventoryProduct.gstRate),
            defaultPriceInclGst: Number(manualForm.inventoryProduct.defaultPriceInclGst)
          })
        });
        inventoryProductCreated = true;
        setManualForm(current => ({...current, addToInventory: false}));
      }
      const created = await request('items', {
        method: 'POST',
        body: JSON.stringify({
          companyName: manualForm.companyName,
          effectiveDate: manualForm.effectiveDate,
          item: requestBody(manualForm.item)
        })
      });
      companyPriceCreated = true;
      setManualForm(current => ({
        companyName: current.companyName,
        effectiveDate: localDate(),
        item: {...emptyForm},
        addToInventory: false,
        inventoryProduct: {...emptyInventoryProduct}
      }));
      manualPriceBasis.current = 'priceExGstPerUnit';
      const companyRows = await request('companies');
      const technicalNameRows = await request('technical-names');
      setCompanies(companyRows);
      setTechnicalNames(technicalNameRows);
      await Promise.all([loadImports(), loadAudit()]);
      if (search.trim()) {
        setResults(await request(`items?${new URLSearchParams({search})}`));
      }
      setNotice(`Price added for ${created.companyName}. It is now the current price; any previous matching price remains in history.`);
    } catch (exception) {
      const detail = exception.message || 'Unknown error.';
      if (companyPriceCreated) {
        setError(inventoryProductCreated
          ? `The company price and inventory product were saved, but the page could not refresh: ${detail}`
          : `The company price was saved, but the page could not refresh: ${detail}`);
      } else if (inventoryProductCreated) {
        setError(`Product was added to dealer inventory, but the company price could not be saved: ${detail}`);
      } else {
        setError(exception.message || 'Could not add the product price.');
      }
    } finally {
      setSaving(false);
    }
  }

  function startCreateInventoryProduct(item) {
    setInventoryPrice(item);
    setInventoryPriceForm(inventoryProductFromPrice(item));
    setError('');
    setNotice('');
  }

  async function createInventoryProduct(event) {
    event.preventDefault();
    if (!inventoryPrice) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestProduct('products', {
        method: 'POST',
        body: JSON.stringify({
          ...inventoryPriceForm,
          dealerId: Number(user.dealerId),
          bagSizeKg: Number(inventoryPriceForm.bagSizeKg),
          gstRate: Number(inventoryPriceForm.gstRate),
          defaultPriceInclGst: Number(inventoryPriceForm.defaultPriceInclGst)
        })
      });
      setNotice(`${inventoryPriceForm.productName} was added to the dealer product list.`);
      setInventoryPrice(null);
      setInventoryPriceForm({...emptyInventoryProduct});
    } catch (exception) {
      setError(exception.message || 'Could not add this product to the dealer product list.');
    } finally {
      setSaving(false);
    }
  }

  async function openImport(importId, onlyNeedsReview = false) {
    setError('');
    setNotice('');
    setLoadingImportId(importId);
    try {
      setSelectedImport(await request(`imports/${importId}`));
      setReviewOnly(onlyNeedsReview);
      setSelectedItemIds([]);
      setEditingDraft(null);
    } catch (exception) {
      setError(exception.message || 'Could not load the selected import.');
    } finally {
      setLoadingImportId(null);
    }
  }

  async function saveDraftRow(event) {
    event.preventDefault();
    if (!selectedImport || !editingDraft) return;
    setSaving(true);
    setError('');
    try {
      const updated = await request(`imports/${selectedImport.id}/items/${editingDraft}`, {
        method: 'PUT',
        body: JSON.stringify(requestBody(draftForm))
      });
      setSelectedImport(updated);
      setSelectedItemIds([]);
      setEditingDraft(null);
      setNotice('Draft row updated. Confirm the full report when all rows are reviewed.');
      await loadImports();
    } catch (exception) {
      setError(exception.message || 'Could not update the draft row.');
    } finally {
      setSaving(false);
    }
  }

  async function excludeSelectedRows() {
    if (!selectedImport || selectedItemIds.length === 0) return;
    if (!window.confirm(`Exclude ${selectedItemIds.length} selected rows from this report's confirmation? The rows will be retained in the report.`)) return;
    setError('');
    setSaving(true);
    try {
      const updated = await request(`imports/${selectedImport.id}/items/exclude`, {
        method: 'POST',
        body: JSON.stringify({itemIds: selectedItemIds})
      });
      setSelectedImport(updated);
      setSelectedItemIds([]);
      setEditingDraft(null);
      await loadImports();
      setNotice('Selected rows excluded. They remain in the report but will not become current prices.');
    } catch (exception) {
      setError(exception.message || 'Could not exclude the selected rows.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmImport() {
    if (!selectedImport) return;
    if (!window.confirm(`Confirm the complete price list from ${selectedImport.companyName}?`)) return;
    setSaving(true);
    setError('');
    try {
      const confirmed = await request(`imports/${selectedImport.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({makeCurrent})
      });
      setSelectedImport(confirmed);
      await Promise.all([loadImports(), loadAudit()]);
      setNotice(makeCurrent
        ? 'Price list confirmed. Included rows are now current prices.'
        : 'Price list confirmed as history; current prices were not changed.');
    } catch (exception) {
      setError(exception.message || 'Could not confirm the price list.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelImport(importId) {
    if (!window.confirm('Cancel this review? Its draft rows will be retained but not used for price searches.')) return;
    setError('');
    try {
      await request(`imports/${importId}/cancel`, {method: 'POST'});
      if (selectedImport?.id === importId) setSelectedImport(null);
      await loadImports();
      setNotice('Price-list review cancelled.');
    } catch (exception) {
      setError(exception.message || 'Could not cancel this import.');
    }
  }

  async function searchPrices(event) {
    event.preventDefault();
    setError('');
    setHistory(null);
    try {
      setResults(await request(`items?${new URLSearchParams({search})}`));
    } catch (exception) {
      setError(exception.message || 'Could not search current prices.');
    }
  }

  async function openHistory(item) {
    setError('');
    try {
      setHistory({item, rows: await request(`items/${item.id}/history`)});
    } catch (exception) {
      setError(exception.message || 'Could not load price history.');
    }
  }

  async function loadAudit() {
    setAudit(await request('audit'));
  }

  async function saveRevision(event) {
    event.preventDefault();
    if (!editingCurrent) return;
    setSaving(true);
    setError('');
    try {
      await request(`items/${editingCurrent.id}/revisions`, {
        method: 'POST',
        body: JSON.stringify(requestBody(revisionForm))
      });
      setEditingCurrent(null);
      await Promise.all([searchPrices({preventDefault() {}}), loadAudit()]);
      setNotice('Price updated. The previous confirmed value remains in history.');
    } catch (exception) {
      setError(exception.message || 'Could not save the price revision.');
    } finally {
      setSaving(false);
    }
  }

  function startDraftEdit(item) {
    setEditingDraft(item.id);
    setDraftForm({
      ...formFromItem(item),
      reviewStatus: item.reviewStatus === 'EXCLUDED' ? 'READY' : item.reviewStatus
    });
  }

  function startRevision(item) {
    setEditingCurrent(item);
    setRevisionForm(formFromItem(item));
  }

  const draftRows = selectedImport?.items || [];
  const visibleDraftRows = reviewOnly
    ? draftRows.filter(item => item.reviewStatus === 'NEEDS_REVIEW')
    : draftRows;
  const selectableDraftRows = visibleDraftRows.filter(item => item.reviewStatus !== 'EXCLUDED');
  const allVisibleRowsSelected = selectableDraftRows.length > 0
    && selectableDraftRows.every(item => selectedItemIds.includes(item.id));
  const includedRows = draftRows.filter(item => item.reviewStatus !== 'EXCLUDED');
  const reviewCount = draftRows.filter(item => item.reviewStatus === 'NEEDS_REVIEW').length;
  const priceFields = [
    ['tradeName', 'Trade name', 'text'],
    ['technicalName', 'Technical name', 'text'],
    ['unitSize', 'Unit size', 'number'],
    ['unit', 'Unit (Kg/Ltr/ml/g/No)', 'text'],
    ['priceExGstPerUnit', 'Price ex-GST / unit', 'number'],
    ['gstPercent', 'GST %', 'number'],
    ['priceInclGstPerUnit', 'Price incl-GST / unit', 'number'],
    ['mrpPerUnit', 'MRP / unit', 'number'],
    ['category', 'Category', 'text'],
    ['sourceReference', 'Source page/row', 'text']
  ];

  return <main className="dealer-price-list-layout">
    <header className="admin-heading">
      <span className="eyebrow">DEALER PRICE COMPARISON</span>
      <h1>Company price lists</h1>
      <p>Import a standard price list, review every row, and compare the latest unit prices across companies.</p>
    </header>
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status">{notice}</p>}

    {canManage && <section className="dealer-price-list-card">
      <h2>Add one product price</h2>
      <p>Add a price directly for an existing or new company. New prices become current without an audit entry; replacing a matching current price keeps it in history and records the change. Price ex-GST and incl-GST calculate each other when GST is entered, and both remain editable.</p>
      <form className="price-list-item-editor" onSubmit={addManualPrice}>
        <div className="price-list-editor-grid">
          <label>Company name<input required maxLength="200" list="dealer-price-list-companies"
            value={manualForm.companyName}
            onChange={event => setManualForm({...manualForm, companyName: event.target.value})}/></label>
          <datalist id="dealer-price-list-companies">
            {companies.map(company => <option key={company.id} value={company.companyName}/>)}
          </datalist>
          <label>Effective date<input required type="date" value={manualForm.effectiveDate}
            onChange={event => setManualForm({...manualForm, effectiveDate: event.target.value})}/></label>
          {priceFields.map(([key, label, type]) => key === 'technicalName'
            ? <label key={key}>{label}<input type="text" list="dealer-price-list-technical-names"
              placeholder="Search or type a technical name"
              value={manualForm.item.technicalName}
              onChange={event => updateManualItem('technicalName', event.target.value)}/>
              <datalist id="dealer-price-list-technical-names">
                {technicalNames.map(name => <option key={name} value={name}/>)}
              </datalist>
              <span className="admin-help">Select an existing name or enter a new one.</span>
            </label>
            : <label key={key}>{label}<input required={['unitSize', 'unit', 'priceExGstPerUnit', 'gstPercent', 'priceInclGstPerUnit'].includes(key)}
              type={type}
              min={type === 'number' && key !== 'gstPercent' ? '0' : undefined}
              max={key === 'gstPercent' ? '100' : undefined}
              step={type === 'number' ? 'any' : undefined}
              value={manualForm.item[key]}
              onChange={event => updateManualItem(key, event.target.value)}/></label>)}
          <label>Comments<textarea value={manualForm.item.comments}
            onChange={event => updateManualItem('comments', event.target.value)}/></label>
          <label>Reason (required when replacing a current price)<textarea maxLength="1000" value={manualForm.item.reason}
            onChange={event => updateManualItem('reason', event.target.value)}/></label>
        </div>
        <label className="price-list-inventory-toggle">
          <input type="checkbox" disabled={!canCreateInventoryProduct || saving}
            checked={manualForm.addToInventory}
            onChange={event => setManualForm(current => ({
              ...current,
              addToInventory: event.target.checked,
              inventoryProduct: event.target.checked
                ? inventoryProductFromItem(current.item) : current.inventoryProduct
            }))}/>
          Also add this product to dealer inventory
        </label>
        {!canCreateInventoryProduct && <p className="admin-help">Adding to inventory requires Product Manage and Dealer Price Manage permissions.</p>}
        {manualForm.addToInventory && <>
          <p className="admin-help">Product code, name, HSN, packing size, GST rate, and default GST-inclusive price are required; brand and category are optional.</p>
          <div className="price-list-editor-grid">
          <label>Product code<input required maxLength="60" value={manualForm.inventoryProduct.productCode}
            onChange={event => setManualForm(current => ({...current, inventoryProduct: {...current.inventoryProduct, productCode: event.target.value}}))}/></label>
          <label>Product name<input required maxLength="200" value={manualForm.inventoryProduct.productName}
            onChange={event => setManualForm(current => ({...current, inventoryProduct: {...current.inventoryProduct, productName: event.target.value}}))}/></label>
          <label>Brand<input maxLength="120" value={manualForm.inventoryProduct.brand}
            onChange={event => setManualForm(current => ({...current, inventoryProduct: {...current.inventoryProduct, brand: event.target.value}}))}/></label>
          <label>HSN code<input required maxLength="20" value={manualForm.inventoryProduct.hsnCode}
            onChange={event => setManualForm(current => ({...current, inventoryProduct: {...current.inventoryProduct, hsnCode: event.target.value}}))}/></label>
          <label>Inventory category<input maxLength="40" list="dealer-inventory-category-options"
            value={manualForm.inventoryProduct.category}
            onChange={event => setManualForm(current => ({...current, inventoryProduct: {...current.inventoryProduct, category: event.target.value}}))}/>
            <datalist id="dealer-inventory-category-options"><option value="Fertilizer"/><option value="Pesticide"/><option value="General"/></datalist>
          </label>
          <label>Packing size (Kg/Ltr)<input required type="number" min="0.001" step="0.001"
            value={manualForm.inventoryProduct.bagSizeKg}
            onChange={event => setManualForm(current => ({...current, inventoryProduct: {...current.inventoryProduct, bagSizeKg: event.target.value}}))}/></label>
          <label>Inventory GST rate (%)<input required type="number" min="0" max="100" step="0.01"
            value={manualForm.inventoryProduct.gstRate}
            onChange={event => setManualForm(current => ({...current, inventoryProduct: {...current.inventoryProduct, gstRate: event.target.value}}))}/></label>
          <label>Inventory default price incl. GST (₹)<input required type="number" min="0.01" step="0.01"
            value={manualForm.inventoryProduct.defaultPriceInclGst}
            onChange={event => setManualForm(current => ({...current, inventoryProduct: {...current.inventoryProduct, defaultPriceInclGst: event.target.value}}))}/></label>
          </div>
        </>}
        <div className="dealer-price-list-tools">
          <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : manualForm.addToInventory ? 'Add price and inventory product' : 'Add as current price'}</button>
        </div>
      </form>
    </section>}

    <section className="dealer-price-list-card">
      <h2>Prepare a price list</h2>
      <p>Use the standard template directly, or provide your supplier PDF/image/spreadsheet to an AI tool with the prompt below. Check all extracted unit prices before importing.</p>
      <div className="dealer-price-list-tools">
        <button type="button" className="quiet-light-button" onClick={downloadTemplate}>Download Excel template</button>
        <button type="button" className="quiet-light-button" onClick={copyPrompt} disabled={!prompt}>Copy conversion prompt</button>
      </div>
      <label className="dealer-price-list-prompt">Conversion prompt<textarea readOnly rows="6" value={prompt}/></label>
      <p className="admin-help">Upload only the completed standard .xlsx, .xls, or .csv file. Supplier files are not parsed directly. Do not send confidential price lists to external AI services unless permitted.</p>
      {canManage && <form className="dealer-price-list-upload" onSubmit={submitImport}>
        <label>Completed price-list file<input key={fileInputKey} required type="file" accept=".xlsx,.xls,.csv" onChange={event => setFile(event.target.files?.[0] || null)}/></label>
        <button className="primary-button" disabled={uploading || !file}>{uploading ? 'Importing…' : 'Upload for review'}</button>
      </form>}
    </section>

    <section className="dealer-price-list-card">
      <div className="dealer-price-list-section-heading"><div><h2>Price-list imports</h2><p>Rows in review are drafts; they do not affect current-price search until the whole report is confirmed.</p></div></div>
      {imports.length === 0 ? <p className="admin-help">No price lists uploaded yet.</p> : <div className="dealer-price-list-imports">
        {imports.map(item => <article key={item.id} className="dealer-price-list-import">
          <div><strong>{item.companyName}</strong><span>{dateLabel(item.effectiveDate || item.effectivePeriodText)} · {item.sourceFileName || 'Manual revision'}</span></div>
          <span className={`price-list-status status-${item.status.toLowerCase()}`}>{item.status}</span>
          <span>{item.itemCount} rows{item.needsReviewCount ? ` · ${item.needsReviewCount} need review` : ''}{item.excludedCount ? ` · ${item.excludedCount} excluded` : ''}</span>
          {item.status === 'REVIEW' && <div className="dealer-price-list-actions">
            {canManage && item.needsReviewCount > 0 && <button type="button" disabled={loadingImportId !== null}
              onClick={() => openImport(item.id, true)}>
              {loadingImportId === item.id ? 'Loading rows…' : `Review ${item.needsReviewCount} rows`}
            </button>}
            <button type="button" disabled={loadingImportId !== null} onClick={() => openImport(item.id)}>
              {loadingImportId === item.id ? 'Loading rows…' : 'View all rows'}
            </button>
            {canManage && <button type="button" className="admin-delete" onClick={() => cancelImport(item.id)}>Cancel</button>}
          </div>}
        </article>)}
      </div>}
    </section>

    {selectedImport && <section ref={reviewSectionRef} className="dealer-price-list-card" tabIndex="-1">
      <div className="dealer-price-list-section-heading">
        <div><h2>{reviewOnly ? 'Rows needing review:' : 'Price-list rows:'} {selectedImport.companyName}</h2><p>{selectedImport.sourceFileName} · {dateLabel(selectedImport.effectiveDate || selectedImport.effectivePeriodText)} · {reviewOnly ? `${visibleDraftRows.length} of ${draftRows.length} rows need review` : `${draftRows.length} rows`}</p></div>
        <span className={`price-list-status status-${selectedImport.status.toLowerCase()}`}>{selectedImport.status}</span>
      </div>
      {selectedImport.status === 'REVIEW' && <>
        {canManage && <div className="dealer-price-list-tools">
          <button type="button" className="quiet-light-button" onClick={() => {
            setReviewOnly(value => !value);
            setSelectedItemIds([]);
          }}>
            {reviewOnly ? `View all ${draftRows.length} rows` : `Show only ${reviewCount} rows needing review`}
          </button>
          {selectedItemIds.length > 0 && <>
            <span>{selectedItemIds.length} selected</span>
            <button type="button" className="admin-delete" disabled={saving} onClick={excludeSelectedRows}>
              {saving ? 'Excluding…' : `Exclude selected (${selectedItemIds.length})`}
            </button>
            <button type="button" className="quiet-light-button" onClick={() => setSelectedItemIds([])}>Clear selection</button>
          </>}
        </div>}
        <div className="dealer-price-list-grid-wrap"><table className="dealer-price-list-table">
          <thead><tr>
            {canManage && <th><input aria-label="Select all visible rows" type="checkbox"
              checked={allVisibleRowsSelected} disabled={selectableDraftRows.length === 0}
              onChange={event => setSelectedItemIds(event.target.checked
                ? selectableDraftRows.map(item => item.id) : [])}/></th>}
            <th>Trade name</th><th>Technical name</th><th>Unit</th><th>Ex-GST</th><th>GST</th><th>Incl-GST</th><th>MRP</th><th>Review status</th><th>Notes</th><th>Action</th>
          </tr></thead>
          <tbody>{visibleDraftRows.map(item => <tr key={item.id} className={item.reviewStatus === 'EXCLUDED' ? 'price-list-row-excluded' : ''}>
            {canManage && <td><input aria-label={`Select ${item.tradeName || item.technicalName || `row ${item.id}`} for exclusion`}
              type="checkbox" disabled={item.reviewStatus === 'EXCLUDED' || saving}
              checked={selectedItemIds.includes(item.id)}
              onChange={event => setSelectedItemIds(current => event.target.checked
                ? [...current, item.id] : current.filter(id => id !== item.id))}/></td>}
            <td>{item.tradeName || '—'}</td><td>{item.technicalName || '—'}</td>
            <td>{item.unitSize} {item.unit}</td><td>{money(item.priceExGstPerUnit)}</td>
            <td>{item.gstPercent == null ? '—' : `${item.gstPercent}%`}</td>
            <td>{money(item.priceInclGstPerUnit)}</td><td>{money(item.mrpPerUnit)}</td>
            <td>{item.reviewStatus}</td><td>{item.reviewNotes || item.comments || '—'}</td>
            <td className="dealer-price-list-actions">
              {canManage && <>
                <button type="button" onClick={() => startDraftEdit(item)}>{item.reviewStatus === 'EXCLUDED' ? 'Restore / edit' : 'Edit'}</button>
              </>}
            </td>
          </tr>)}</tbody>
        </table></div>
        {visibleDraftRows.length === 0 && <p className="admin-help">{reviewOnly ? 'No rows need review. You can show all report rows or confirm the report.' : 'This report has no rows.'}</p>}
        {canManage && editingDraft && <form className="price-list-item-editor" onSubmit={saveDraftRow}>
          <h3>Edit draft row</h3>
          <div className="price-list-editor-grid">{priceFields.map(([key, label, type]) =>
            <label key={key}>{label}<input required={['unitSize', 'unit'].includes(key)} type={type}
              min={type === 'number' && key !== 'gstPercent' ? '0' : undefined}
              step={type === 'number' ? 'any' : undefined}
              value={draftForm[key]} onChange={event => setDraftForm({...draftForm, [key]: event.target.value})}/></label>)}
            <label>Comments<textarea value={draftForm.comments} onChange={event => setDraftForm({...draftForm, comments: event.target.value})}/></label>
          </div>
          <div className="dealer-price-list-tools"><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save row'}</button><button type="button" className="quiet-light-button" onClick={() => setEditingDraft(null)}>Cancel</button></div>
        </form>}
        {canManage && <div className="dealer-price-list-confirm">
          <label><input type="checkbox" checked={makeCurrent} onChange={event => setMakeCurrent(event.target.checked)}/> Make included rows the current prices for this company</label>
          <span>{includedRows.length} included · {reviewCount} still need review · {draftRows.length - includedRows.length} excluded</span>
          <button type="button" className="primary-button" disabled={saving || Boolean(editingDraft) || selectedItemIds.length > 0 || reviewCount > 0 || includedRows.length === 0} onClick={confirmImport}>
            {saving ? 'Confirming…' : 'Confirm entire price list'}
          </button>
        </div>}
      </>}
    </section>}

    <section className="dealer-price-list-card">
      <h2>Search current prices</h2>
      <p>Search by trade or technical name. Results show the latest confirmed price per company and equivalent unit size (for example, 500 ml and 0.5 Ltr match).</p>
      <form className="dealer-price-list-search" onSubmit={searchPrices}>
        <input aria-label="Search trade or technical name" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product name or technical name"/>
        <button className="primary-button">Search</button>
      </form>
      {results.length > 0 && <div className="dealer-price-list-grid-wrap"><table className="dealer-price-list-table">
        <thead><tr><th>Company</th><th>Trade name</th><th>Technical name</th><th>Unit</th><th>Equivalent size</th><th>Ex-GST</th><th>GST</th><th>Incl-GST</th><th>MRP</th><th>Effective</th><th>Actions</th></tr></thead>
        <tbody>{results.map(item => <tr key={item.id}>
          <td>{item.companyName}</td><td>{item.tradeName || '—'}</td><td>{item.technicalName || '—'}</td>
          <td>{item.unitSize} {item.unit}</td><td>{Number(item.matchUnitSize)} {item.matchUnit}</td>
          <td>{money(item.priceExGstPerUnit)}</td>
          <td>{item.gstPercent == null ? '—' : `${item.gstPercent}%`}</td>
          <td><strong>{money(item.priceInclGstPerUnit)}</strong></td><td>{money(item.mrpPerUnit)}</td>
          <td>{dateLabel(item.effectiveDate)}</td><td className="dealer-price-list-actions">
            <button type="button" onClick={() => openHistory(item)}>History</button>
            {canManage && <button type="button" onClick={() => startRevision(item)}>Edit</button>}
            {canCreateInventoryProduct && <button type="button" disabled={saving}
              onClick={() => startCreateInventoryProduct(item)}>Add to products</button>}
          </td>
        </tr>)}</tbody>
      </table></div>}
      {search && results.length === 0 && <p className="admin-help">No current prices match this search.</p>}

      {inventoryPrice && <form className="price-list-item-editor" onSubmit={createInventoryProduct}>
        <h3>Add to dealer product list · {inventoryPrice.tradeName || inventoryPrice.technicalName}</h3>
        <p>Product code, name, HSN, packing size, GST rate, and default GST-inclusive price are required; brand and category are optional. Values are prefilled from this price where available.</p>
        <div className="price-list-editor-grid">
          <label>Product code<input required maxLength="60" value={inventoryPriceForm.productCode}
            onChange={event => setInventoryPriceForm({...inventoryPriceForm, productCode: event.target.value})}/></label>
          <label>Product name<input required maxLength="200" value={inventoryPriceForm.productName}
            onChange={event => setInventoryPriceForm({...inventoryPriceForm, productName: event.target.value})}/></label>
          <label>Brand<input maxLength="120" value={inventoryPriceForm.brand}
            onChange={event => setInventoryPriceForm({...inventoryPriceForm, brand: event.target.value})}/></label>
          <label>HSN code<input required maxLength="20" value={inventoryPriceForm.hsnCode}
            onChange={event => setInventoryPriceForm({...inventoryPriceForm, hsnCode: event.target.value})}/></label>
          <label>Category<input maxLength="40" list="search-inventory-category-options"
            value={inventoryPriceForm.category}
            onChange={event => setInventoryPriceForm({...inventoryPriceForm, category: event.target.value})}/>
            <datalist id="search-inventory-category-options"><option value="Fertilizer"/><option value="Pesticide"/><option value="General"/></datalist>
          </label>
          <label>Packing size (Kg/Ltr)<input required type="number" min="0.001" step="0.001"
            value={inventoryPriceForm.bagSizeKg}
            onChange={event => setInventoryPriceForm({...inventoryPriceForm, bagSizeKg: event.target.value})}/></label>
          <label>GST rate (%)<input required type="number" min="0" max="100" step="0.01"
            value={inventoryPriceForm.gstRate}
            onChange={event => setInventoryPriceForm({...inventoryPriceForm, gstRate: event.target.value})}/></label>
          <label>Default price incl. GST (₹)<input required type="number" min="0.01" step="0.01"
            value={inventoryPriceForm.defaultPriceInclGst}
            onChange={event => setInventoryPriceForm({...inventoryPriceForm, defaultPriceInclGst: event.target.value})}/></label>
        </div>
        <div className="dealer-price-list-tools">
          <button className="primary-button" disabled={saving}>{saving ? 'Adding product…' : 'Add to product list'}</button>
          <button type="button" className="quiet-light-button" disabled={saving}
            onClick={() => setInventoryPrice(null)}>Cancel</button>
        </div>
      </form>}

      {editingCurrent && <form className="price-list-item-editor" onSubmit={saveRevision}>
        <h3>Edit current price · {editingCurrent.companyName}</h3>
        <p>Saving creates a new audited version; the existing value remains in history.</p>
        <div className="price-list-editor-grid">{priceFields.map(([key, label, type]) =>
          <label key={key}>{label}<input required={['unitSize', 'unit'].includes(key)} type={type}
            min={type === 'number' && key !== 'gstPercent' ? '0' : undefined}
            step={type === 'number' ? 'any' : undefined}
            value={revisionForm[key]} onChange={event => setRevisionForm({...revisionForm, [key]: event.target.value})}/></label>)}
          <label>Edit reason<textarea required maxLength={1000} value={revisionForm.reason} onChange={event => setRevisionForm({...revisionForm, reason: event.target.value})}/></label>
          <label>Comments<textarea value={revisionForm.comments} onChange={event => setRevisionForm({...revisionForm, comments: event.target.value})}/></label>
        </div>
        <div className="dealer-price-list-tools"><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save audited revision'}</button><button type="button" className="quiet-light-button" onClick={() => setEditingCurrent(null)}>Cancel</button></div>
      </form>}

      {history && <div className="dealer-price-list-history">
        <h3>Price history: {history.item.technicalName || history.item.tradeName} · {history.item.unitSize} {history.item.unit}</h3>
        <div className="dealer-price-list-grid-wrap"><table className="dealer-price-list-table">
          <thead><tr><th>Effective</th><th>Source</th><th>Ex-GST</th><th>GST</th><th>Incl-GST</th><th>MRP</th><th>Current</th></tr></thead>
          <tbody>{history.rows.map(item => <tr key={item.id}>
            <td>{dateLabel(item.effectiveDate)}</td><td>{item.sourceFileName || item.sourceType}</td>
            <td>{money(item.priceExGstPerUnit)}</td><td>{item.gstPercent == null ? '—' : `${item.gstPercent}%`}</td>
            <td>{money(item.priceInclGstPerUnit)}</td><td>{money(item.mrpPerUnit)}</td>
            <td>{item.current ? 'Yes' : 'No'}</td>
          </tr>)}</tbody>
        </table></div>
        <button type="button" className="quiet-light-button" onClick={() => setHistory(null)}>Close history</button>
      </div>}
    </section>

    <section className="dealer-price-list-card">
      <div className="dealer-price-list-section-heading"><div><h2>Recent audit activity</h2><p>Imports and confirmed price changes for this dealership.</p></div><button type="button" onClick={() => loadAudit().catch(exception => setError(exception.message))}>Refresh</button></div>
      {audit.length === 0 ? <p className="admin-help">No confirmed price-list activity yet.</p> : <div className="dealer-price-list-audit">
        {audit.slice(0, 30).map(entry => <article key={entry.id}>
          <strong>{entry.eventType.replaceAll('_', ' ')} · {entry.companyName}</strong>
          <span>{entry.technicalName || entry.tradeName || 'Unnamed product'} · {entry.unitSize} {entry.unit}</span>
          <span>{entry.recordedBy} · {new Date(entry.recordedAt).toLocaleString()}</span>
          {entry.reason && <p>{entry.reason}</p>}
          <details><summary>Changed fields</summary><pre>{JSON.stringify(JSON.parse(entry.changedFields), null, 2)}</pre></details>
        </article>)}
      </div>}
    </section>
  </main>;
}
