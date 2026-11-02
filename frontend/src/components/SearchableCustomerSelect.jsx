import React, {useId, useState} from 'react';

const customerLabel = customer =>
  `${customer.customerName}${customer.phone ? ` · ${customer.phone}` : ''}`;

export default function SearchableCustomerSelect({
  customers,
  value,
  onChange,
  ariaLabel,
  placeholder = 'Search customers by name or phone…',
  disabled = false
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const selectedCustomer = customers.find(customer => String(customer.id) === value);
  const selectedLabel = selectedCustomer ? customerLabel(selectedCustomer) : '';
  const filteredCustomers = customers.filter(customer =>
    `${customer.customerName} ${customer.phone || ''}`.toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
  const activeCustomer = filteredCustomers[activeIndex];

  function choose(customer) {
    onChange(String(customer.id));
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => filteredCustomers.length
        ? Math.min(index + 1, filteredCustomers.length - 1) : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (activeCustomer) choose(activeCustomer);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      setActiveIndex(0);
    }
  }

  function openOptions() {
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  }

  return <div className="searchable-customer-select">
    <input
      type="text"
      role="combobox"
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && activeCustomer ? `${listId}-option-${activeIndex}` : undefined}
      autoComplete="off"
      placeholder={open || !selectedLabel ? placeholder : undefined}
      value={open ? query : selectedLabel}
      disabled={disabled}
      onFocus={openOptions}
      onClick={() => { if (!open) openOptions(); }}
      onChange={event => {
        setQuery(event.target.value);
        setActiveIndex(0);
        setOpen(true);
      }}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        setOpen(false);
        setQuery('');
        setActiveIndex(0);
      }}
    />
    {open && <div className="searchable-customer-options" id={listId} role="listbox">
      {filteredCustomers.length
        ? filteredCustomers.map((customer, index) => <div
          id={`${listId}-option-${index}`}
          className={`searchable-customer-option ${index === activeIndex ? 'active' : ''}`}
          key={customer.id}
          role="option"
          aria-selected={String(customer.id) === value}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(customer)}
        >{customerLabel(customer)}</div>)
        : <div className="searchable-customer-empty">No matching customers</div>}
    </div>}
  </div>;
}
