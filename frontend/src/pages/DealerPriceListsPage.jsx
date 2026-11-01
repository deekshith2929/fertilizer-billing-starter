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
const matchUnitLabel = item => `${Number(item.matchUnitSize)} ${item.matchUnit}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
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

function CollapsiblePriceSection({id, title, description, expanded, loading, onToggle, children}) {
  return <section className={`dealer-price-list-card price-list-section-${id}`}>
    <div className="dealer-price-list-section-heading">
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      <button type="button" className="dealer-price-list-section-toggle"
        aria-expanded={expanded} aria-controls={`dealer-price-list-section-${id}`} onClick={onToggle}>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        <span>{loading ? 'Loading…' : expanded ? 'Collapse' : 'Expand'}</span>
      </button>
    </div>
    {expanded && <div id={`dealer-price-list-section-${id}`}>{children}</div>}
  </section>;
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
  const [expandedSections, setExpandedSections] = useState({});
  const [loadingSections, setLoadingSections] = useState({});
  const [deletingCompanyId, setDeletingCompanyId] = useState(null);
  const [selectedImport, setSelectedImport] = useState(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [loadingImportId, setLoadingImportId] = useState(null);
  const reviewSectionRef = useRef(null);
  const [editingDraft, setEditingDraft] = useState(null);
  const [draftForm, setDraftForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [results, setResults] = useState([]);
  const [searchedFilters, setSearchedFilters] = useState(null);
  const [unitFilter, setUnitFilter] = useState('');
  const [history, setHistory] = useState(null);
  const [commentsModal, setCommentsModal] = useState(null);
  const [editingCurrent, setEditingCurrent] = useState(null);
  const [revisionForm, setRevisionForm] = useState(emptyForm);
  const [inventoryPrice, setInventoryPrice] = useState(null);
  const [inventoryPriceForm, setInventoryPriceForm] = useState(emptyInventoryProduct);
  const [audit, setAudit] = useState([]);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

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

  async function loadCompanies() {
    setCompanies(await request('companies'));
  }

  async function loadTechnicalNames() {
    setTechnicalNames(await request('technical-names'));
  }

  async function refreshOpenImportsAndAudit() {
    const refreshes = [];
    if (expandedSections.imports) refreshes.push(loadImports());
    if (expandedSections.audit) refreshes.push(loadAudit());
    await Promise.all(refreshes);
  }

  async function refreshCurrentSearch(
    companyId = searchedFilters?.companyId ?? companyFilter,
    searchValue = searchedFilters?.search ?? search
  ) {
    if (!expandedSections.search) return;
    const params = new URLSearchParams();
    if (searchValue.trim()) params.set('search', searchValue.trim());
    if (companyId) params.set('companyId', companyId);
    setResults(await request(`items?${params}`));
    setSearchedFilters({search: searchValue, companyId});
  }

  async function toggleSection(section) {
    const expand = !expandedSections[section];
    setExpandedSections(current => ({...current, [section]: expand}));
    if (!expand) return;
    setError('');
    setLoadingSections(current => ({...current, [section]: true}));
    try {
      switch (section) {
        case 'search':
        case 'delete-company':
          await loadCompanies();
          break;
        case 'add-price':
          await Promise.all([loadCompanies(), loadTechnicalNames()]);
          break;
        case 'prepare':
          setPrompt(await request('prompt'));
          break;
        case 'imports':
          await loadImports();
          break;
        case 'audit':
          await loadAudit();
          break;
        default:
          break;
      }
    } catch (exception) {
      setError(exception.message || `Could not load ${section.replace('-', ' ')} data.`);
    } finally {
      setLoadingSections(current => ({...current, [section]: false}));
    }
  }

  useEffect(() => {
    if (reviewSectionRef.current) {
      reviewSectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }, [selectedImport?.id, expandedSections.imports]);

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
      if (expandedSections.imports) await loadImports();
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
      if (expandedSections['add-price']) {
        await Promise.all([loadCompanies(), loadTechnicalNames()]);
      }
      await refreshOpenImportsAndAudit();
      await refreshCurrentSearch();
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
      if (expandedSections.imports) await loadImports();
    } catch (exception) {
      setError(exception.message || 'Could not update the draft row.');
    } finally {
      setSaving(false);
    }
  }

  async function excludeSelectedRows() {
    if (!selectedImport || selectedItemIds.length === 0) return;
    const itemIds = draftRows.filter(item => selectedItemIds.includes(item.id)
      && item.reviewStatus !== 'EXCLUDED').map(item => item.id);
    if (itemIds.length === 0) return;
    if (!window.confirm(`Exclude ${itemIds.length} selected rows from this report's confirmation? The rows will be retained in the report.`)) return;
    setError('');
    setSaving(true);
    try {
      const updated = await request(`imports/${selectedImport.id}/items/exclude`, {
        method: 'POST',
        body: JSON.stringify({itemIds})
      });
      setSelectedImport(updated);
      setSelectedItemIds([]);
      setEditingDraft(null);
      if (expandedSections.imports) await loadImports();
      setNotice('Selected rows excluded. They remain in the report but will not become current prices.');
    } catch (exception) {
      setError(exception.message || 'Could not exclude the selected rows.');
    } finally {
      setSaving(false);
    }
  }

  async function includeSelectedRows() {
    if (!selectedImport || selectedItemIds.length === 0) return;
    const itemIds = draftRows.filter(item => selectedItemIds.includes(item.id)
      && item.reviewStatus !== 'READY').map(item => item.id);
    if (itemIds.length === 0) return;
    if (!window.confirm(`Include ${itemIds.length} selected rows and mark them ready for confirmation?`)) return;
    setError('');
    setSaving(true);
    try {
      const updated = await request(`imports/${selectedImport.id}/items/include`, {
        method: 'POST',
        body: JSON.stringify({itemIds})
      });
      setSelectedImport(updated);
      setSelectedItemIds([]);
      setEditingDraft(null);
      if (expandedSections.imports) await loadImports();
      setNotice('Selected rows marked ready for confirmation.');
    } catch (exception) {
      setError(exception.message || 'Could not include the selected rows.');
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
      await refreshOpenImportsAndAudit();
      await refreshCurrentSearch();
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
      if (expandedSections.imports) await loadImports();
      setNotice('Price-list review cancelled.');
    } catch (exception) {
      setError(exception.message || 'Could not cancel this import.');
    }
  }

  async function deleteCompany(company) {
    if (!window.confirm(
      `Permanently delete ${company.companyName} and all of its price-list imports, price rows, current prices, history, and audit records? This cannot be undone.`
    )) return;
    setError('');
    setNotice('');
    setDeletingCompanyId(company.id);
    try {
      await request(`companies/${company.id}`, {method: 'DELETE'});
      setCompanies(current => current.filter(item => item.id !== company.id));
      setImports(current => current.filter(item => item.companyName !== company.companyName));
      setAudit(current => current.filter(item => item.companyName !== company.companyName));
      if (expandedSections['add-price']) {
        try {
          await loadTechnicalNames();
        } catch (exception) {
          setError(`Deleted ${company.companyName}, but product-name suggestions could not be refreshed: ${exception.message}`);
        }
      }
      if (selectedImport?.companyName === company.companyName) {
        setSelectedImport(null);
        setSelectedItemIds([]);
        setEditingDraft(null);
      }
      if (history?.item.companyName === company.companyName) setHistory(null);
      if (commentsModal?.item.companyName === company.companyName) setCommentsModal(null);
      if (inventoryPrice?.companyName === company.companyName) setInventoryPrice(null);
      if (editingCurrent?.companyName === company.companyName) setEditingCurrent(null);

      const nextCompanyFilter = String(company.id) === companyFilter ? '' : companyFilter;
      if (nextCompanyFilter !== companyFilter) setCompanyFilter(nextCompanyFilter);
      setUnitFilter('');
      setResults([]);
      setNotice(`Deleted ${company.companyName} and all associated price-list data.`);
      if (expandedSections.search) {
        try {
          await refreshCurrentSearch(nextCompanyFilter);
        } catch (exception) {
          setError(`Deleted ${company.companyName}, but the search results could not be refreshed: ${exception.message}`);
        }
      }
    } catch (exception) {
      setError(exception.message || `Could not delete ${company.companyName}.`);
    } finally {
      setDeletingCompanyId(null);
    }
  }

  async function searchPrices(event) {
    event.preventDefault();
    setError('');
    setHistory(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (companyFilter) params.set('companyId', companyFilter);
      setResults(await request(`items?${params}`));
      setSearchedFilters({search, companyId: companyFilter});
      setUnitFilter('');
    } catch (exception) {
      setError(exception.message || 'Could not search current prices.');
    }
  }

  async function exportSearchExcel() {
    setExportingExcel(true);
    setError('');
    try {
      const params = new URLSearchParams();
      const filters = searchedFilters || {search, companyId: companyFilter};
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.companyId) params.set('companyId', filters.companyId);
      if (unitFilter) {
        const separator = unitFilter.indexOf(' ');
        if (separator < 1) throw new Error('Could not read the selected equivalent unit filter.');
        params.set('matchUnitSize', unitFilter.slice(0, separator));
        params.set('matchUnit', unitFilter.slice(separator + 1));
      }
      const response = await fetch(`${API}/items/export.xlsx?${params}`, {credentials: 'include'});
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const errorBody = contentType.includes('application/json')
          ? await response.json() : await response.text();
        throw new Error(typeof errorBody === 'string'
          ? errorBody : errorBody.message || errorBody.detail || 'Could not export search results.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'company-price-search.xlsx';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exception) {
      setError(exception.message || 'Could not export search results to Excel.');
    } finally {
      setExportingExcel(false);
    }
  }

  function exportSearchPdf() {
    const rows = visiblePriceResults.slice(0, 500);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('The PDF export window was blocked. Allow pop-ups for this site and try again.');
      return;
    }
    const filters = searchedFilters || {search, companyId: companyFilter};
    const companyName = companies.find(company => String(company.id) === filters.companyId)?.companyName
      || 'All companies';
    const tableRows = rows.map(item => `<tr>
      <td>${escapeHtml(item.companyName)}</td>
      <td>${escapeHtml(item.tradeName || '—')}</td>
      <td>${escapeHtml(item.technicalName || '—')}</td>
      <td>${escapeHtml(`${item.unitSize} ${item.unit}`)}</td>
      <td>${escapeHtml(matchUnitLabel(item))}</td>
      <td class="number">${escapeHtml(money(item.priceExGstPerUnit))}</td>
      <td class="number">${escapeHtml(item.gstPercent == null ? '—' : `${item.gstPercent}%`)}</td>
      <td class="number">${escapeHtml(money(item.priceInclGstPerUnit))}</td>
      <td class="number">${escapeHtml(money(item.mrpPerUnit))}</td>
      <td>${escapeHtml(dateLabel(item.effectiveDate))}</td>
    </tr>`).join('');
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>Company price search</title>
      <style>
        @page{size:landscape;margin:10mm}
        body{font:10px Arial,sans-serif;color:#17323d}
        h1{font-size:18px;margin:0 0 5px}
        p{font-size:10px;margin:3px 0 12px;color:#52666c}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        th,td{border:1px solid #cbd8d4;padding:5px;text-align:left;overflow-wrap:anywhere}
        th{background:#e8f1ed}
        td.number{text-align:right;white-space:nowrap}
        tr{break-inside:avoid}
        thead{display:table-header-group}
      </style></head><body>
      <h1>Company price search</h1>
      <p>Product: ${escapeHtml(filters.search.trim() || 'All products')} · Company: ${escapeHtml(companyName)} · Unit: ${escapeHtml(unitFilter || 'All units')}</p>
      <p>${rows.length} result${rows.length === 1 ? '' : 's'} · Generated ${escapeHtml(new Date().toLocaleString())}</p>
      <table><thead><tr><th>Company</th><th>Trade name</th><th>Technical name</th><th>Unit</th>
      <th>Equivalent size</th><th>Ex-GST</th><th>GST</th><th>Incl-GST</th><th>MRP</th>
      <th>Effective</th></tr></thead><tbody>${tableRows}</tbody></table>
      <script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
  }

  async function openHistory(item) {
    setError('');
    try {
      setHistory({item, rows: await request(`items/${item.id}/history`)});
    } catch (exception) {
      setError(exception.message || 'Could not load price history.');
    }
  }

  async function openComments(item) {
    setError('');
    setCommentsModal({item, comments: null, loading: true});
    try {
      const data = await request(`items/${item.id}/comments`);
      setCommentsModal(current => current?.item.id === item.id
        ? {...current, comments: data.comments, loading: false} : current);
    } catch (exception) {
      setCommentsModal(current => current?.item.id === item.id ? null : current);
      setError(exception.message || 'Could not load comments.');
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
      const refreshes = [];
      if (expandedSections.search) refreshes.push(refreshCurrentSearch());
      if (expandedSections.audit) refreshes.push(loadAudit());
      await Promise.all(refreshes);
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
  const selectedDraftRows = draftRows.filter(item => selectedItemIds.includes(item.id));
  const selectedNotReadyCount = selectedDraftRows.filter(item => item.reviewStatus !== 'READY').length;
  const selectedIncludedCount = selectedDraftRows.filter(item => item.reviewStatus !== 'EXCLUDED').length;
  const unitOptions = [...new Set(results.map(matchUnitLabel))]
    .sort((left, right) => left.localeCompare(right, undefined, {numeric: true}));
  const visiblePriceResults = unitFilter
    ? results.filter(item => matchUnitLabel(item) === unitFilter)
    : results;
  const selectableDraftRows = visibleDraftRows;
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

    {canManage && <CollapsiblePriceSection id="add-price" title="Add one product price"
      description="Add a price directly for an existing or new company. New prices become current without an audit entry; replacing a matching current price keeps it in history and records the change. Price ex-GST and incl-GST calculate each other when GST is entered, and both remain editable."
      expanded={Boolean(expandedSections['add-price'])} loading={Boolean(loadingSections['add-price'])}
      onToggle={() => toggleSection('add-price')}>
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
    </CollapsiblePriceSection>}

    <CollapsiblePriceSection id="prepare" title="Prepare a price list"
      description="Use the standard template directly, or provide your supplier PDF/image/spreadsheet to an AI tool with the prompt below. Check all extracted unit prices before importing."
      expanded={Boolean(expandedSections.prepare)} loading={Boolean(loadingSections.prepare)}
      onToggle={() => toggleSection('prepare')}>
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
    </CollapsiblePriceSection>

    <CollapsiblePriceSection id="imports" title="Price-list imports"
      description="Rows in review are drafts; they do not affect current-price search until the whole report is confirmed."
      expanded={Boolean(expandedSections.imports)} loading={Boolean(loadingSections.imports)}
      onToggle={() => toggleSection('imports')}>
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
    </CollapsiblePriceSection>

    {canManage && <CollapsiblePriceSection id="delete-company" title="Delete by company price list"
      description="Permanently remove a company and its imports, price rows, current prices, history, and audit records."
      expanded={Boolean(expandedSections['delete-company'])} loading={Boolean(loadingSections['delete-company'])}
      onToggle={() => toggleSection('delete-company')}>
      {companies.length === 0 ? <p className="admin-help">No companies to delete.</p> : <div className="dealer-price-list-imports">
        {companies.map(company => <article key={company.id} className="dealer-price-list-import">
          <strong>{company.companyName}</strong>
          <span>All price-list data for this company</span>
          <button type="button" className="admin-delete"
            disabled={deletingCompanyId !== null || saving}
            onClick={() => deleteCompany(company)}>
            {deletingCompanyId === company.id ? 'Deleting…' : 'Delete company'}
          </button>
        </article>)}
      </div>}
    </CollapsiblePriceSection>}

    {selectedImport && expandedSections.imports && <section ref={reviewSectionRef} className="dealer-price-list-card price-list-section-import-review" tabIndex="-1">
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
            {selectedIncludedCount > 0 && <button type="button" className="admin-delete" disabled={saving} onClick={excludeSelectedRows}>
              {saving ? 'Excluding…' : `Exclude selected (${selectedIncludedCount})`}
            </button>}
            {selectedNotReadyCount > 0 && <button type="button" className="quiet-light-button" disabled={saving} onClick={includeSelectedRows}>
              {saving ? 'Including…' : `Include selected (${selectedNotReadyCount})`}
            </button>}
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
            {canManage && <td><input aria-label={`Select ${item.tradeName || item.technicalName || `row ${item.id}`} for bulk action`}
              type="checkbox" disabled={saving}
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

    <CollapsiblePriceSection id="search" title="Search current prices"
      description="Search by trade or technical name, then filter by company or unit size. Results show the latest confirmed price per company and equivalent unit size (for example, 500 ml and 0.5 Ltr match)."
      expanded={Boolean(expandedSections.search)} loading={Boolean(loadingSections.search)}
      onToggle={() => toggleSection('search')}>
      <form className="dealer-price-list-search" onSubmit={searchPrices}>
        <input aria-label="Search trade or technical name" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product name or technical name"/>
        <label>Company
          <select aria-label="Filter by company" value={companyFilter} onChange={event => setCompanyFilter(event.target.value)}>
            <option value="">All companies</option>
            {companies.map(company => <option key={company.id} value={company.id}>{company.companyName}</option>)}
          </select>
        </label>
        <label>Unit size
          <select aria-label="Filter by unit size" value={unitFilter} onChange={event => setUnitFilter(event.target.value)}>
            <option value="">All units</option>
            {unitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
        <button className="primary-button">Search</button>
      </form>
      {visiblePriceResults.length > 0 && <>
        <div className="dealer-price-list-export-toolbar">
          <span>Export includes up to 500 matching rows; Actions are omitted.</span>
          <div className="dealer-price-list-tools">
            <button type="button" className="quiet-light-button" disabled={exportingExcel}
              onClick={exportSearchExcel}>
              {exportingExcel ? 'Preparing Excel…' : 'Export Excel'}
            </button>
            <button type="button" className="quiet-light-button" onClick={exportSearchPdf}>Export PDF</button>
          </div>
        </div>
        <div className="dealer-price-list-grid-wrap dealer-price-list-desktop-results"><table className="dealer-price-list-table">
        <thead><tr><th>Company</th><th>Trade name</th><th>Technical name</th><th>Unit</th><th>Equivalent size</th><th>Ex-GST</th><th>GST</th><th>Incl-GST</th><th>MRP</th><th>Effective</th><th>Actions</th></tr></thead>
        <tbody>{visiblePriceResults.map(item => <tr key={item.id}>
          <td>{item.companyName}</td><td>{item.tradeName || '—'}</td><td>{item.technicalName || '—'}</td>
          <td>{item.unitSize} {item.unit}</td><td>{Number(item.matchUnitSize)} {item.matchUnit}</td>
          <td>{money(item.priceExGstPerUnit)}</td>
          <td>{item.gstPercent == null ? '—' : `${item.gstPercent}%`}</td>
          <td><strong>{money(item.priceInclGstPerUnit)}</strong></td><td>{money(item.mrpPerUnit)}</td>
          <td>{dateLabel(item.effectiveDate)}</td><td className="dealer-price-list-actions">
            <button type="button" onClick={() => openHistory(item)}>History</button>
            <button type="button" onClick={() => openComments(item)}>Comments</button>
            {canManage && <button type="button" onClick={() => startRevision(item)}>Edit</button>}
            {canCreateInventoryProduct && <button type="button" disabled={saving}
              onClick={() => startCreateInventoryProduct(item)}>Add to products</button>}
          </td>
        </tr>)}</tbody>
      </table></div>
        <div className="dealer-price-list-mobile-results">
          {visiblePriceResults.map(item => <article key={item.id} className="dealer-price-list-result-card">
            <header className="dealer-price-list-result-heading">
              <div>
                <strong className="dealer-price-list-result-company">{item.companyName}</strong>
                <span className="dealer-price-list-result-product">{item.tradeName || item.technicalName || 'Unnamed product'}</span>
                {item.tradeName && item.technicalName && <span className="dealer-price-list-result-technical">{item.technicalName}</span>}
              </div>
              <div className="dealer-price-list-result-price">
                <span>Incl. GST</span>
                <strong>{money(item.priceInclGstPerUnit)}</strong>
              </div>
            </header>
            <dl className="dealer-price-list-result-details">
              <div><dt>Unit</dt><dd>{item.unitSize} {item.unit}</dd></div>
              <div><dt>Equivalent</dt><dd>{Number(item.matchUnitSize)} {item.matchUnit}</dd></div>
              <div><dt>Ex-GST</dt><dd>{money(item.priceExGstPerUnit)}</dd></div>
              <div><dt>GST</dt><dd>{item.gstPercent == null ? '—' : `${item.gstPercent}%`}</dd></div>
              <div><dt>MRP</dt><dd>{money(item.mrpPerUnit)}</dd></div>
              <div><dt>Effective</dt><dd>{dateLabel(item.effectiveDate)}</dd></div>
            </dl>
            <div className="dealer-price-list-result-actions">
              <button type="button" onClick={() => openHistory(item)}>History</button>
              <button type="button" onClick={() => openComments(item)}>Comments</button>
              {canManage && <button type="button" onClick={() => startRevision(item)}>Edit</button>}
              {canCreateInventoryProduct && <button type="button" disabled={saving}
                onClick={() => startCreateInventoryProduct(item)}>Add to products</button>}
            </div>
          </article>)}
        </div>
      </>}
      {(search.trim() || companyFilter) && results.length === 0 && <p className="admin-help">No current prices match these filters.</p>}
      {results.length > 0 && visiblePriceResults.length === 0 && <p className="admin-help">No current prices match this unit size.</p>}

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
    </CollapsiblePriceSection>

    {commentsModal && <div className="dealer-price-list-modal-backdrop">
      <section className="dealer-price-list-comments-modal" role="dialog" aria-modal="true"
        aria-labelledby="dealer-price-list-comments-title">
        <h2 id="dealer-price-list-comments-title">
          Comments · {commentsModal.item.tradeName || commentsModal.item.technicalName || 'Price item'}
        </h2>
        <p>{commentsModal.loading ? 'Loading comments…' : commentsModal.comments || 'No comments available.'}</p>
        <button type="button" className="quiet-light-button" onClick={() => setCommentsModal(null)}>Close</button>
      </section>
    </div>}

    <CollapsiblePriceSection id="audit" title="Recent audit activity"
      description="Imports and confirmed price changes for this dealership."
      expanded={Boolean(expandedSections.audit)} loading={Boolean(loadingSections.audit)}
      onToggle={() => toggleSection('audit')}>
      <div className="dealer-price-list-tools"><button type="button" onClick={() => loadAudit().catch(exception => setError(exception.message))}>Refresh</button></div>
      {audit.length === 0 ? <p className="admin-help">No confirmed price-list activity yet.</p> : <div className="dealer-price-list-audit">
        {audit.slice(0, 30).map(entry => <article key={entry.id}>
          <strong>{entry.eventType.replaceAll('_', ' ')} · {entry.companyName}</strong>
          <span>{entry.technicalName || entry.tradeName || 'Unnamed product'} · {entry.unitSize} {entry.unit}</span>
          <span>{entry.recordedBy} · {new Date(entry.recordedAt).toLocaleString()}</span>
          {entry.reason && <p>{entry.reason}</p>}
          <details><summary>Changed fields</summary><pre>{JSON.stringify(JSON.parse(entry.changedFields), null, 2)}</pre></details>
        </article>)}
      </div>}
    </CollapsiblePriceSection>
  </main>;
}
