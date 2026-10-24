import React, {useEffect, useState} from 'react';

const API = 'http://localhost:8080/api';
const money = v => new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR'}).format(Number(v || 0));
export default function App() {
    const [user, setUser] = useState(null), [products, setProducts] = useState([]), [rows, setRows] = useState([{
        id: 1,
        productId: '',
        price: '',
        bags: '1'
    }]), [next, setNext] = useState(2), [bill, setBill] = useState(null), [type, setType] = useState('CASH'), [destination, setDestination] = useState(''), [error, setError] = useState(''), [u, setU] = useState('admin'), [pw, setPw] = useState('admin123');
    useEffect(() => {
        if (user) fetch(`${API}/products?dealerId=${user.dealerId}`).then(r => r.json()).then(setProducts).catch(() => setError('Could not load products. Check backend/database.'))
    }, [user]);
    const upd = (id, p) => setRows(a => a.map(x => x.id === id ? {...x, ...p} : x));

    async function login(e) {
        e.preventDefault();
        try {
            let r = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username: u, password: pw})
            }), d = await r.json();
            if (!r.ok) throw Error('Login failed');
            setUser(d)
        } catch (e) {
            setError(e.message)
        }
    }

    async function calc() {
        try {
            setError('');
            let items = rows.filter(x => x.productId && Number(x.bags) > 0).map(x => ({
                productId: +x.productId,
                priceInclGst: +x.price,
                bags: +x.bags
            }));
            if (!items.length) throw Error('Select at least one product.');
            let r = await fetch(`${API}/billing/calculate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    dealerId: user.dealerId,
                    items,
                    billType: type,
                    destinationStateCode: destination || undefined
                })
            }), d = await r.json();
            if (!r.ok) throw Error(d.message || 'Calculation failed');
            setBill(d)
        } catch (e) {
            setError(e.message)
        }
    }

    if (!user) return <main className="login">
        <form onSubmit={login}><h1>Fertilizer Billing</h1><p>Local demo login</p><label>Username<input value={u}
                                                                                                       onChange={e => setU(e.target.value)}/></label><label>Password<input
            type="password" value={pw} onChange={e => setPw(e.target.value)}/></label>{error &&
            <p className="err">{error}</p>}
            <button>Login</button>
            <small>admin / admin123</small></form>
    </main>;
    return <>
        <header><h2>Fertilizer Billing</h2><span>{user.dealerName} · {user.fullName}</span>
            <button onClick={() => setUser(null)}>Logout</button>
        </header>
        <nav><b>Billing</b><span>Stock Report (later)</span><span>Company / Dealer Ledger (later)</span><span>Farmer / Customer Ledger (later)</span>
        </nav>
        <main className="grid">
            <section className="card"><h1>GST Billing Calculator</h1><p>Products and default prices are loaded from the
                backend.</p>
                <div className="row"><label>Bill type<select value={type} onChange={e => setType(e.target.value)}>
                    <option value="CASH">Cash Bill</option>
                    <option value="CREDIT">Credit Bill</option>
                </select></label><label>Destination state code<input value={destination}
                                                                     onChange={e => setDestination(e.target.value)}
                                                                     placeholder="Default: dealer state"/></label></div>
                <div className="itemsHead"><h3>Items</h3>
                    <button onClick={() => {
                        setRows(a => [...a, {id: next, productId: '', price: '', bags: '1'}]);
                        setNext(n => n + 1)
                    }}>+ Add item
                    </button>
                </div>
                {rows.map((x, i) => {
                    let p = products.find(p => String(p.id) === x.productId);
                    return <div className="item" key={x.id}>
                        <div className="itemsHead"><b>Item {i + 1}</b>
                            <button
                                onClick={() => setRows(a => a.length > 1 ? a.filter(r => r.id !== x.id) : a)}>Remove
                            </button>
                        </div>
                        <label>Product<select value={x.productId} onChange={e => {
                            let p = products.find(p => String(p.id) === e.target.value);
                            upd(x.id, {
                                productId: e.target.value,
                                price: p ? String(p.defaultPriceInclGst) : '',
                                bags: '1'
                            })
                        }}>
                            <option value="">Select product</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.productName}</option>)}
                        </select></label>
                        <div className="row three"><label>Price incl. GST<input type="number" step=".01" value={x.price}
                                                                                onChange={e => upd(x.id, {price: e.target.value})}/></label><label>Bags<input
                            type="number" min="1" value={x.bags}
                            onChange={e => upd(x.id, {bags: e.target.value})}/></label><label>Weight kg<input readOnly
                                                                                                              value={p ? Number(p.bagSizeKg * x.bags) : ''}/></label>
                        </div>
                        {p && <small>HSN {p.hsnCode} · {p.gstRate}% GST · {p.bagSizeKg} kg/bag</small>}</div>
                })}{error && <p className="err">{error}</p>}
                <button className="go" onClick={calc}>Calculate bill</button>
                <small>Price overrides apply only to this bill. Nothing is saved as an invoice.</small></section>
            <section className="card"><h2>Bill preview</h2>{!bill ?
                <p className="muted">Select products and calculate to preview the bill.</p> :
                <article id="bill"><h2>TAX INVOICE</h2><h2>{bill.dealer.display_name || 'Dealer'}</h2>
                    <p>{[bill.dealer.address_line1, bill.dealer.address_line2, bill.dealer.city, bill.dealer.state_name, bill.dealer.pincode].filter(Boolean).join(', ')}</p>
                    <p>GSTIN: {bill.dealer.gstin || '—'}</p>
                    <p>{bill.billType} · {new Date(bill.generatedAt).toLocaleDateString('en-IN')}</p>
                    <table>
                        <thead>
                        <tr>
                            <th>Product / HSN</th>
                            <th>Bags</th>
                            <th>Qty kg</th>
                            <th>Rate</th>
                            <th>Taxable</th>
                            <th>Amount</th>
                        </tr>
                        </thead>
                        <tbody>{bill.items.map((x, i) => <tr key={i}>
                            <td>{x.productName}<small>{x.hsnCode}</small></td>
                            <td>{x.bags}</td>
                            <td>{x.quantityKg}</td>
                            <td>{money(x.rateInclGst)}</td>
                            <td>{money(x.taxableAmount)}</td>
                            <td>{money(x.amountInclGst)}</td>
                        </tr>)}</tbody>
                    </table>
                    <p>Taxable value: <b>{money(bill.taxableTotal)}</b></p>{bill.taxType === 'IGST' ?
                        <p>IGST: {money(bill.igstTotal)}</p> : <><p>CGST: {money(bill.cgstTotal)}</p>
                            <p>SGST: {money(bill.sgstTotal)}</p></>}<h2>Total: {money(bill.grandTotal)}</h2><p
                        className="muted">Runtime-only preview. No bill is stored.</p>
                    <button onClick={() => window.print()}>Print / Save PDF</button>
                </article>}</section>
        </main>
    </>
}
