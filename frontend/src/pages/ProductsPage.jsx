import React, {useEffect, useState} from 'react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';
const blankProduct = {
  productCode: '', productName: '', brand: '', hsnCode: '',
  bagSizeKg: '', gstRate: '5', defaultPriceInclGst: ''
};

async function request(path, options = {}) {
  const response = await fetch(`${API}/product-management/${path}`, {
    ...options,
    credentials: 'include',
    headers: {...options.headers, ...(options.body ? {'Content-Type': 'application/json'} : {})}
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.detail || 'Product request failed.');
  return data;
}

async function loadAdminDealers() {
  const response = await fetch(`${API}/admin/dealers`, {credentials: 'include'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.detail || 'Could not load dealers.');
  return data;
}

export default function ProductsPage({user}) {
  const [dealers, setDealers] = useState([]);
  const [dealerId, setDealerId] = useState(String(user.dealerId));
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blankProduct);
  const [editingId, setEditingId] = useState(null);
  const [priceDrafts, setPriceDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadProducts(selectedDealerId = dealerId) {
    const query = new URLSearchParams({dealerId: selectedDealerId});
    const data = await request(`products?${query.toString()}`);
    setProducts(data);
    setPriceDrafts(Object.fromEntries(data.map(product => [
      product.id, product.defaultPriceInclGst == null ? '' : String(product.defaultPriceInclGst)
    ])));
  }

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      try {
        const dealerList = user.role === 'ADMIN'
          ? await loadAdminDealers()
          : [{id: user.dealerId, dealerCode: '', displayName: user.dealerName}];
        if (!mounted) return;
        setDealers(dealerList);
        const initialDealerId = String(dealerList.find(dealer => String(dealer.id) === dealerId)?.id
          || dealerList[0]?.id || user.dealerId);
        setDealerId(initialDealerId);
        const query = new URLSearchParams({dealerId: initialDealerId});
        const productList = await request(`products?${query.toString()}`);
        if (!mounted) return;
        setProducts(productList);
        setPriceDrafts(Object.fromEntries(productList.map(product => [
          product.id, product.defaultPriceInclGst == null ? '' : String(product.defaultPriceInclGst)
        ])));
      } catch (e) {
        if (mounted) setError(e.message || 'Could not load product management data.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    initialize();
    return () => { mounted = false; };
  }, [user]);

  async function changeDealer(value) {
    setDealerId(value);
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await loadProducts(value);
      setForm(blankProduct);
      setEditingId(null);
    } catch (e) {
      setError(e.message || 'Could not load products.');
    } finally {
      setLoading(false);
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        bagSizeKg: Number(form.bagSizeKg),
        gstRate: Number(form.gstRate),
        defaultPriceInclGst: Number(form.defaultPriceInclGst)
      };
      if (editingId == null) {
        await request('products', {
          method: 'POST',
          body: JSON.stringify({...payload, dealerId: Number(dealerId)})
        });
        setNotice('Product created with its dealer price.');
      } else {
        await request(`products/${editingId}?dealerId=${encodeURIComponent(dealerId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setNotice('Product details and price updated.');
      }
      setForm(blankProduct);
      setEditingId(null);
      await loadProducts();
    } catch (e) {
      setError(e.message || 'Could not save product.');
    } finally {
      setSaving(false);
    }
  }

  function startEditing(product) {
    setEditingId(product.id);
    setForm({
      productCode: product.productCode,
      productName: product.productName,
      brand: product.brand || '',
      hsnCode: product.hsnCode,
      bagSizeKg: String(product.bagSizeKg),
      gstRate: String(product.gstRate),
      defaultPriceInclGst: priceDrafts[product.id] ?? ''
    });
    setError('');
    setNotice('');
  }

  async function savePrice(product) {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await request(`products/${product.id}/price?dealerId=${encodeURIComponent(dealerId)}`, {
        method: 'PUT',
        body: JSON.stringify({defaultPriceInclGst: Number(priceDrafts[product.id])})
      });
      await loadProducts();
      setNotice(`Price updated for ${product.productName}.`);
    } catch (e) {
      setError(e.message || 'Could not update price.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Deactivate "${product.productName}"? It will no longer appear in bills.`)) return;
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await request(`products/${product.id}?dealerId=${encodeURIComponent(dealerId)}`, {method: 'DELETE'});
      await loadProducts();
      setNotice(`${product.productName} deactivated.`);
      if (editingId === product.id) {
        setEditingId(null);
        setForm(blankProduct);
      }
    } catch (e) {
      setError(e.message || 'Could not deactivate product.');
    } finally {
      setSaving(false);
    }
  }

  async function restoreProduct(product) {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await request(`products/${product.id}/restore?dealerId=${encodeURIComponent(dealerId)}`, {method: 'PUT'});
      await loadProducts();
      setNotice(`${product.productName} restored.`);
    } catch (e) {
      setError(e.message || 'Could not restore product.');
    } finally {
      setSaving(false);
    }
  }

  return <main className="product-management-layout">
    <header className="admin-heading">
      <span className="eyebrow">PRODUCT MANAGEMENT</span>
      <h1>Products and prices</h1>
      <p>Manage this dealer’s product catalog and default GST-inclusive prices.</p>
    </header>
    {user.role === 'ADMIN' && <label className="product-dealer-select">Dealer<select value={dealerId} onChange={e => changeDealer(e.target.value)}>{dealers.map(dealer => <option key={dealer.id} value={dealer.id}>{dealer.displayName}{dealer.dealerCode ? ` (${dealer.dealerCode})` : ''}</option>)}</select></label>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status">{notice}</p>}

    <section className="admin-card">
      <h2>{editingId == null ? 'Add product' : 'Edit product'}</h2>
      <form className="admin-form product-form" onSubmit={saveProduct}>
        <label>Product code<input required maxLength="60" value={form.productCode} onChange={e => setForm({...form, productCode: e.target.value})}/></label>
        <label>Product name<input required maxLength="200" value={form.productName} onChange={e => setForm({...form, productName: e.target.value})}/></label>
        <label>Brand<input maxLength="120" value={form.brand} onChange={e => setForm({...form, brand: e.target.value})}/></label>
        <label>HSN code<input required maxLength="20" value={form.hsnCode} onChange={e => setForm({...form, hsnCode: e.target.value})}/></label>
        <label>Bag weight (kg)<input required type="number" min="0.001" step="0.001" value={form.bagSizeKg} onChange={e => setForm({...form, bagSizeKg: e.target.value})}/></label>
        <label>GST rate (%)<input required type="number" min="0" max="100" step="0.01" value={form.gstRate} onChange={e => setForm({...form, gstRate: e.target.value})}/></label>
        <label>Default price incl. GST (₹)<input required type="number" min="0.01" step="0.01" value={form.defaultPriceInclGst} onChange={e => setForm({...form, defaultPriceInclGst: e.target.value})}/></label>
        <div className="product-form-actions"><button className="primary-button" disabled={saving || loading}>{saving ? 'Saving…' : editingId == null ? 'Create product' : 'Save changes'}</button>{editingId != null && <button className="quiet-light-button" type="button" disabled={saving} onClick={() => {setEditingId(null); setForm(blankProduct);}}>Cancel</button>}</div>
      </form>
    </section>

    <section className="admin-card">
      <div className="admin-list-heading"><div><h2>Product catalog</h2><p>Deleted products are deactivated and retained in the database.</p></div><span>{products.length} products</span></div>
      {loading ? <p className="admin-help">Loading products…</p> : products.length === 0 ? <p className="admin-help">No products yet. Add a product above.</p> : <div className="admin-table-wrap">
        <table className="admin-table product-table"><thead><tr><th>Code / Product</th><th>HSN</th><th>Bag (kg)</th><th>GST</th><th>Default price (₹)</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{products.map(product => <tr key={product.id}>
            <td><strong>{product.productCode}</strong><br/>{product.productName}{product.brand && <small className="product-brand">{product.brand}</small>}</td>
            <td>{product.hsnCode}</td><td>{product.bagSizeKg}</td><td>{product.gstRate}%</td>
            <td><form className="product-price-form" onSubmit={e => {e.preventDefault(); savePrice(product);}}>
              <input aria-label={`Default price for ${product.productName}`} type="number" min="0.01" step="0.01" required disabled={!product.active || saving} value={priceDrafts[product.id] ?? ''} onChange={e => setPriceDrafts({...priceDrafts, [product.id]: e.target.value})}/>
              <button type="submit" disabled={!product.active || saving}>Save price</button>
            </form></td>
            <td><span className={product.active ? 'admin-active' : 'admin-inactive'}>{product.active ? 'Active' : 'Inactive'}</span></td>
            <td className="product-actions">{product.active ? <><button type="button" disabled={saving} onClick={() => startEditing(product)}>Edit</button><button className="admin-delete" type="button" disabled={saving} onClick={() => deleteProduct(product)}>Delete</button></> : <button type="button" disabled={saving} onClick={() => restoreProduct(product)}>Restore</button>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </main>;
}
