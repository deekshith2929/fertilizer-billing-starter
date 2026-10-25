import React, {useEffect, useState} from 'react';
import {API_BASE_URL} from '../api.js';

const API = API_BASE_URL;
const emptyDealer = {
  dealerCode: '', legalName: '', displayName: '', addressLine1: '', addressLine2: '',
  city: '', stateName: '', stateCode: '', pincode: '', gstin: '', phone: '', aglNo: '', plNo: ''
};
const emptyUser = {username: '', password: '', fullName: '', roleCode: 'DEALER', dealerId: ''};

async function request(path, options = {}) {
  const response = await fetch(`${API}/admin/${path}`, {
    ...options,
    credentials: 'include',
    headers: {...options.headers, ...(options.body ? {'Content-Type': 'application/json'} : {})}
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.detail || 'Admin request failed.');
  return data;
}

export default function AdminPage({user}) {
  const canManageDealers = user.permissions?.includes('DEALER_MANAGE') || false;
  const canManageUsers = user.permissions?.includes('USER_MANAGE') || false;
  const [dealers, setDealers] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [dealerForm, setDealerForm] = useState(emptyDealer);
  const [userForm, setUserForm] = useState(emptyUser);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({fullName: '', roleCode: ''});
  const [passwords, setPasswords] = useState({});
  const [dealerFilter, setDealerFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const visibleUsers = dealerFilter
    ? users.filter(item => String(item.dealerId) === dealerFilter)
    : users;

  async function loadData() {
    const [dealerList, userList, roleList] = await Promise.all([
      canManageDealers ? request('dealers') : Promise.resolve([]),
      canManageUsers ? request('users') : Promise.resolve([]),
      canManageUsers ? request('roles') : Promise.resolve([])
    ]);
    setDealers(dealerList);
    setUsers(userList);
    setRoles(roleList);
    setUserForm(current => ({
      ...current,
      dealerId: canManageDealers
        ? current.dealerId || String(dealerList[0]?.id || '')
        : String(user.dealerId || '')
    }));
  }

  useEffect(() => {
    let mounted = true;
    Promise.all([
      canManageDealers ? request('dealers') : Promise.resolve([]),
      canManageUsers ? request('users') : Promise.resolve([]),
      canManageUsers ? request('roles') : Promise.resolve([])
    ])
      .then(([dealerList, userList, roleList]) => {
        if (!mounted) return;
        setDealers(dealerList);
        setUsers(userList);
        setRoles(roleList);
        setUserForm(current => ({
          ...current,
          dealerId: canManageDealers
            ? current.dealerId || String(dealerList[0]?.id || '')
            : String(user.dealerId || '')
        }));
      })
      .catch(e => { if (mounted) setError(e.message || 'Could not load admin data.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [canManageDealers, canManageUsers, user.dealerId]);

  async function submit(event, action, successMessage) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await action();
      await loadData();
      setNotice(successMessage);
    } catch (e) {
      setError(e.message || 'Admin request failed.');
    } finally {
      setSaving(false);
    }
  }

  function createDealer(event) {
    return submit(event, async () => {
      await request('dealers', {method: 'POST', body: JSON.stringify(dealerForm)});
      setDealerForm(emptyDealer);
    }, 'Dealer created.');
  }

  function createUser(event) {
    return submit(event, async () => {
      await request('users', {
        method: 'POST',
        body: JSON.stringify({
          ...userForm,
          roleCode: canManageDealers ? userForm.roleCode : 'EMPLOYEE',
          dealerId: canManageDealers && userForm.roleCode !== 'ADMIN'
            ? Number(userForm.dealerId)
            : canManageDealers ? null : Number(user.dealerId)
        })
      });
      setUserForm(current => ({
        ...emptyUser,
        dealerId: canManageDealers
          ? current.dealerId || String(dealers[0]?.id || '')
          : String(user.dealerId)
      }));
    }, 'User created.');
  }

  function startEditingUser(target) {
    setEditingUserId(target.id);
    setEditUserForm({
      fullName: target.fullName,
      roleCode: target.role.split(',')[0].trim()
    });
    setError('');
    setNotice('');
  }

  function saveUserDetails(event, target) {
    return submit(event, async () => {
      await request(`users/${target.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: editUserForm.fullName,
          roleCode: canManageDealers ? editUserForm.roleCode : 'EMPLOYEE'
        })
      });
      setEditingUserId(null);
    }, `User ${target.username} updated.`);
  }

  function updatePassword(event, userId) {
    return submit(event, async () => {
      const password = passwords[userId] || '';
      await request(`users/${userId}/password`, {
        method: 'PUT',
        body: JSON.stringify({password})
      });
      setPasswords(current => ({...current, [userId]: ''}));
    }, 'Password updated.');
  }

  async function deleteUser(target) {
    if (!window.confirm(`Deactivate user "${target.username}"? They will no longer be able to log in.`)) return;
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await request(`users/${target.id}`, {method: 'DELETE'});
      await loadData();
      setNotice(`User ${target.username} deactivated.`);
    } catch (e) {
      setError(e.message || 'Could not deactivate user.');
    } finally {
      setSaving(false);
    }
  }

  return <main className="admin-layout">
    <header className="admin-heading">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>{canManageDealers && canManageUsers
        ? 'User and dealer management'
        : canManageUsers ? 'Dealership user management' : 'Dealer management'}</h1>
      <p>{canManageDealers
        ? canManageUsers
          ? 'Create dealer records and assign users. Update user details, passwords, or deactivate access here.'
          : 'Create and manage dealer records here.'
        : 'Create, update, or deactivate employee accounts for your dealership.'}</p>
    </header>
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status">{notice}</p>}
    <div className="admin-forms">
      {canManageDealers && <section className="admin-card">
        <h2>Add dealer</h2>
        <form className="admin-form" onSubmit={createDealer}>
          <label>Dealer code<input required maxLength="40" value={dealerForm.dealerCode} onChange={e => setDealerForm({...dealerForm, dealerCode: e.target.value})}/></label>
          <label>Legal name<input required maxLength="200" value={dealerForm.legalName} onChange={e => setDealerForm({...dealerForm, legalName: e.target.value})}/></label>
          <label>Display name<input required maxLength="200" value={dealerForm.displayName} onChange={e => setDealerForm({...dealerForm, displayName: e.target.value})}/></label>
          <label>Address line 1<input required maxLength="200" value={dealerForm.addressLine1} onChange={e => setDealerForm({...dealerForm, addressLine1: e.target.value})}/></label>
          <label>Address line 2<input maxLength="200" value={dealerForm.addressLine2} onChange={e => setDealerForm({...dealerForm, addressLine2: e.target.value})}/></label>
          <label>City<input required maxLength="100" value={dealerForm.city} onChange={e => setDealerForm({...dealerForm, city: e.target.value})}/></label>
          <label>State<input required maxLength="100" value={dealerForm.stateName} onChange={e => setDealerForm({...dealerForm, stateName: e.target.value})}/></label>
          <label>State code<input required pattern="[0-9]{2}" maxLength="2" value={dealerForm.stateCode} onChange={e => setDealerForm({...dealerForm, stateCode: e.target.value})}/></label>
          <label>Pincode<input maxLength="10" value={dealerForm.pincode} onChange={e => setDealerForm({...dealerForm, pincode: e.target.value})}/></label>
          <label>GSTIN<input maxLength="15" value={dealerForm.gstin} onChange={e => setDealerForm({...dealerForm, gstin: e.target.value})}/></label>
          <label>Phone<input maxLength="20" value={dealerForm.phone} onChange={e => setDealerForm({...dealerForm, phone: e.target.value})}/></label>
          <label>AGL No. (Fertilizer)<input maxLength="100" value={dealerForm.aglNo} onChange={e => setDealerForm({...dealerForm, aglNo: e.target.value})}/></label>
          <label>PL No. (Pesticide)<input maxLength="100" value={dealerForm.plNo} onChange={e => setDealerForm({...dealerForm, plNo: e.target.value})}/></label>
          <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Create dealer'}</button>
        </form>
      </section>}

      {canManageUsers && <section className="admin-card">
        <h2>Add user</h2>
        <form className="admin-form" onSubmit={createUser}>
          <label>Full name<input required maxLength="200" value={userForm.fullName} onChange={e => setUserForm({...userForm, fullName: e.target.value})}/></label>
          <label>Username<input required maxLength="80" autoComplete="off" value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})}/></label>
          <label>Initial password<input required type="password" minLength="8" maxLength="256" autoComplete="new-password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})}/></label>
          {canManageDealers
            ? <label>Role<select value={userForm.roleCode} onChange={e => setUserForm({...userForm, roleCode: e.target.value})}>{roles.map(role => <option key={role.roleCode} value={role.roleCode}>{role.displayName}</option>)}</select></label>
            : <label>Role<input value="Employee" readOnly/></label>}
          {canManageDealers && userForm.roleCode !== 'ADMIN' && <label>Dealer<select required value={userForm.dealerId} onChange={e => setUserForm({...userForm, dealerId: e.target.value})}><option value="">Choose dealer</option>{dealers.map(dealer => <option key={dealer.id} value={dealer.id}>{dealer.displayName} ({dealer.dealerCode})</option>)}</select></label>}
          <button className="primary-button" disabled={saving || (canManageDealers && userForm.roleCode !== 'ADMIN' && (!dealers.length || !userForm.dealerId))}>{saving ? 'Saving…' : 'Create user'}</button>
          {canManageDealers && userForm.roleCode !== 'ADMIN' && !dealers.length && <p className="admin-help">Create a dealer before adding a user.</p>}
        </form>
      </section>}
    </div>

    {canManageDealers && <section className="admin-card admin-dealer-list">
      <div className="admin-list-heading"><div><h2>Dealers</h2><p>Active dealers available for user assignments.</p></div><span>{dealers.length} active</span></div>
      {dealers.length === 0 ? <p className="admin-help">No dealers found. Add a dealer above.</p> : <div className="admin-table-wrap">
        <table className="admin-table"><thead><tr><th>Dealer code</th><th>Name</th><th>State</th><th>State code</th></tr></thead>
          <tbody>{dealers.map(dealer => <tr key={dealer.id}><td>{dealer.dealerCode}</td><td>{dealer.displayName}</td><td>{dealer.stateName}</td><td>{dealer.stateCode}</td></tr>)}</tbody>
        </table>
      </div>}
    </section>}

    {canManageUsers && <section className="admin-card admin-user-list">
      <div className="admin-list-heading"><div><h2>Users</h2><p>Removing a user deactivates their account and preserves existing records.</p></div><label className="admin-filter">{canManageDealers && <>Dealer<select value={dealerFilter} onChange={e => setDealerFilter(e.target.value)}><option value="">All dealers</option>{dealers.map(dealer => <option key={dealer.id} value={dealer.id}>{dealer.displayName}</option>)}</select></>}<span>{visibleUsers.length} users</span></label></div>
      {loading ? <p className="admin-help">Loading users…</p> : visibleUsers.length === 0 ? <p className="admin-help">No users found for this dealer.</p> : <div className="admin-table-wrap">
        <table className="admin-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th>{canManageDealers && <th>Dealer</th>}<th>Status</th><th>Update password</th><th>Actions</th></tr></thead>
          <tbody>{visibleUsers.map(item => <tr key={item.id}>
            <td>{editingUserId === item.id
              ? <input aria-label={`Name for ${item.username}`} required maxLength="200" value={editUserForm.fullName} onChange={e => setEditUserForm({...editUserForm, fullName: e.target.value})}/>
              : item.fullName}</td>
            <td>{item.username}</td>
            <td>{editingUserId === item.id && canManageDealers
              ? <select aria-label={`Role for ${item.username}`} value={editUserForm.roleCode} onChange={e => setEditUserForm({...editUserForm, roleCode: e.target.value})}>{roles.map(role => <option key={role.roleCode} value={role.roleCode}>{role.displayName}</option>)}</select>
              : item.role}</td>
            {canManageDealers && <td>{item.dealerName || '—'}</td>}
            <td><span className={item.active ? 'admin-active' : 'admin-inactive'}>{item.active ? 'Active' : 'Inactive'}</span></td>
            <td><form className="password-update" onSubmit={e => updatePassword(e, item.id)}>
              <input aria-label={`New password for ${item.username}`} type="password" minLength="8" maxLength="256" autoComplete="new-password" required disabled={!item.active || saving || (!canManageDealers && item.role !== 'EMPLOYEE')} value={passwords[item.id] || ''} onChange={e => setPasswords({...passwords, [item.id]: e.target.value})} placeholder="New password"/>
              <button type="submit" disabled={!item.active || saving || (!canManageDealers && item.role !== 'EMPLOYEE')}>Update</button>
            </form></td>
            <td>{editingUserId === item.id
              ? <div className="admin-user-actions"><button type="button" disabled={saving} onClick={e => saveUserDetails(e, item)}>Save</button><button type="button" disabled={saving} onClick={() => setEditingUserId(null)}>Cancel</button></div>
              : <div className="admin-user-actions"><button type="button" disabled={!item.active || saving || item.username === user.username || (!canManageDealers && item.role !== 'EMPLOYEE')} onClick={() => startEditingUser(item)}>Edit</button><button className="admin-delete" type="button" disabled={!item.active || saving || item.username === user.username || (!canManageDealers && item.role !== 'EMPLOYEE')} onClick={() => deleteUser(item)}>Deactivate</button></div>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>}
  </main>;
}
