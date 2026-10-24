import React, {useId, useState} from 'react';

export default function SearchableProductSelect({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus = false,
  onRemoveShortcut
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const selectedLabel = options.find(option => option.value === value)?.label || '';
  const filteredOptions = options.filter(option => option.label.toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase()));
  const results = [
    ...filteredOptions,
    ...(value ? [{value: '', label: 'Clear selection', clear: true}] : [])
  ];
  const activeResult = results[activeIndex];

  function choose(option) {
    onChange(option.value);
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  function handleKeyDown(event) {
    if (event.key === 'Backspace' && event.ctrlKey && value && !query && onRemoveShortcut) {
      event.preventDefault();
      onRemoveShortcut();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => Math.max(0, Math.min(index + 1, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (activeResult) choose(activeResult);
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

  return <div className="searchable-product-select">
    <input
      type="text"
      role="combobox"
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && activeResult ? `${listId}-option-${activeIndex}` : undefined}
      autoComplete="off"
      title={value ? 'Search products; press Ctrl+Backspace to remove this row' : undefined}
      placeholder={open ? 'Type to search products…' : placeholder}
      value={open ? query : selectedLabel}
      autoFocus={autoFocus}
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
    {open && <div className="searchable-product-options" id={listId} role="listbox">
      {results.length
        ? results.map((option, index) => <div
          id={`${listId}-option-${index}`}
          className={`searchable-product-option ${index === activeIndex ? 'active' : ''} ${option.clear ? 'clear-option' : ''}`}
          key={option.clear ? 'clear' : option.value}
          role="option"
          aria-selected={option.value === value}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(option)}
        >{option.label}</div>)
        : <div className="searchable-product-empty">No matching products</div>}
    </div>}
  </div>;
}
