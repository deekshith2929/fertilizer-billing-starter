# Agri Dealer Hub — Simple Product Guide

This guide explains **Agri Dealer Hub** in everyday language. It is meant for salespeople, dealers, and anyone who needs to understand or demonstrate the product **without technical knowledge**.

**Product name:** Agri Dealer Hub  
**Who it is for:** Fertilizer and agri-input dealers in India who need GST billing, customer and company accounts, stock reports, and company price lists.

---

## 1. What this product is

Agri Dealer Hub is a web application for a fertilizer / pesticide dealership.

A dealer can:

- Prepare a GST bill (cash or credit) and print or save it as PDF
- Keep a product list with GST-inclusive selling prices
- Prepare fertilizer and pesticide stock reports for a date range
- Track money owed to companies / suppliers
- Track farmer / customer balances and saved invoices
- Upload or enter company price lists and compare current prices
- Create staff logins for the same dealership

Each dealer’s data is kept separate. One shop cannot see another shop’s customers, products, or ledgers.

---

## 2. How to open it

| Place | Address |
|---|---|
| Live website (demo / hosted app) | https://fertilizerdealersinventory.netlify.app |
| Local demo on a computer (if the team has started it) | http://localhost:5173 |
| Support contact shown on the login screen | Puvvadi Deekshith — puvvadideekshith2@gmail.com |

Sign in with **Username** and **Password**. After login, the top of the page shows the person who is signed in and, when applicable, the dealership name. Use **Logout** when finished.

A session stays signed in for about **30 minutes** of inactivity.

---

## 3. Demo login (starter data)

The product ships with **one ready demo account**. Extra dealer or staff accounts are created from the Admin screen.

| Item | Value | Notes |
|---|---|---|
| Username | `admin` | Built-in demo login |
| Password | `admin123` | Development / demo password. Change or disable it before real customer use. |
| Display name | Demo Admin | Shown after login |
| Role | Admin | Platform administrator |
| Assigned dealership | None | Admin is not tied to one shop |
| What this login can open | **Admin only** | Create dealers and users. It does **not** open Billing, Products, Stock, Ledgers, or Price Lists. |

**How to demo the working shop screens**

1. Sign in as `admin` / `admin123`.
2. Create a dealer (shop).
3. Create a user with role **Dealer**, assigned to that shop, and set a password of at least 8 characters.
4. Log out, then sign in with the new dealer username and password.
5. Billing, Products, Stock Report, ledgers, and Company Price Lists will then be available.

There is **no second seeded shop login**. Dealer and employee passwords exist only after someone creates those users.

---

## 4. Demo shop already present in starter data

The starter database includes one sample dealership and three sample products. They appear after a dealer user is created for this shop.

### Sample dealership

| Field | Demo value |
|---|---|
| Dealer code | DEMO-001 |
| Legal name | Nataraja Fertilizers |
| Display name on bills | NATARAJA FERTILIZERS |
| Address | Main Road, Nandyal, Andhra Pradesh, 518501 |
| State | Andhra Pradesh (state code 37) |
| GSTIN | 37ABCDE1234F1Z5 |
| AGL / PL numbers | Not filled in the sample |

### Sample products (illustrative prices, not live market rates)

| Product code | Product name | Brand | Pack size | GST | Default price incl. GST |
|---|---|---|---|---|---|
| DAP-50 | DAP 50KG | Demo Brand | 50 kg | 5% | ₹1,245.00 |
| UREA-45 | UREA 45KG | Demo Brand | 45 kg | 5% | ₹266.00 |
| MOP-50 | MOP 50KG | Demo Brand | 50 kg | 5% | ₹1,700.00 |

---

## 5. Who can do what (roles)

There are three kinds of login.

| Role | Typical person | What they see | What they can manage |
|---|---|---|---|
| **Admin** | Software owner / head office | Admin screen only | Create dealerships, create any kind of user, reset passwords, deactivate accounts. Can pick a dealer on some screens when they have extra access. |
| **Dealer** | Shop owner / operator | All working screens + Admin | Day-to-day shop work, plus creating and managing **employees of that shop only**. Company Price Lists is available to this role. |
| **Employee** | Counter staff | Working screens, not Admin | Billing, products, stock report, company ledger, customer ledger. Cannot create users. Cannot open Company Price Lists in the default setup. |

Removing a user **deactivates** the login. Old bills and ledger records are kept; the person can no longer sign in.

Passwords are stored securely. The screen never shows a saved password. New or reset passwords must be at least **8 characters**.

---

## 6. Screens at a glance

| Menu name | Who usually uses it | What it is for | Saved for later? |
|---|---|---|---|
| **Billing** | Dealer, Employee | Make a GST cash or credit bill, preview, print / PDF | **Not saved** unless you choose a customer and click **Save bill to customer** |
| **Products** | Dealer, Employee | Shop’s own product list and selling prices | Yes |
| **Stock Report** | Dealer, Employee | Fertilizer or pesticide stock statement for a date range | Report is prepared and printed; **not stored as a permanent stock book** |
| **Company / Dealer Ledger** | Dealer, Employee | Money payable to or advance with companies / suppliers | Yes |
| **Farmer / Customer Ledger** | Dealer, Employee | Farmer accounts, payments, saved invoices | Yes |
| **Company Price Lists** | Dealer only | Company rate lists, search, history | Yes (confirmed prices). Original uploaded file is not kept |
| **Admin** | Admin; Dealer (own staff only) | Dealerships and user accounts | Yes |

---

## 7. Billing (GST calculator)

**Purpose:** Make a bill quickly at the counter.

**Typical flow**

1. Choose whether this is a **runtime bill** (preview/print only) or a **customer bill**.
2. For a customer bill, search the farmer by name or phone. Add the farmer first in Farmer / Customer Ledger if they are not in the list.
3. Choose **Cash Bill** or **Credit Bill**.
4. Optionally enter the customer’s **2-digit state code**. If left blank, the shop’s state is used. Same-state bills show CGST + SGST; other-state bills show IGST.
5. Search products, enter **price including GST** (the catalogue price appears automatically and can be changed for this bill only), and enter **number of packs**.
6. Quantity in kg/ltr is calculated from pack size × packs.
7. Click **Calculate bill**. A tax invoice preview appears on the right.
8. Use **Print / Save PDF** for a paper or PDF copy.
9. If a customer was selected, click **Save bill to customer** to store it on that farmer’s account.

**Useful extras**

| Feature | What it means for the user |
|---|---|
| Other / enter manually… | Bill a product that is not in the catalogue. Name, pack size, GST, and price are for this bill only. They are **not** added to the product list. |
| Duplicate row (+) | Copy a line to sell more of the same item. |
| Remove row (×) | Drop a line from the bill. |
| Cash vs credit when saved | Credit increases the farmer’s amount due. Cash is kept in invoice history and settled in the same step, so the balance does not rise. |

Tax and place-of-supply rules in this starter are **simplified**. Do not treat generated GST figures as certified tax advice until a tax reviewer has signed them off.

---

## 8. Products

**Purpose:** Maintain this shop’s selling catalogue.

Each product can have:

| Field | Meaning |
|---|---|
| Product code | Short shop code (example: DAP-50) |
| Product name | Name printed on bills |
| Brand | Optional brand |
| HSN code | Tax classification code |
| Category | Used on stock reports (Fertilizer or Pesticide) |
| Pack size | Kg or litre per pack |
| GST % | Tax rate |
| Default price incl. GST | Usual counter price |

Products can be created, edited, switched off, and restored. Switching off hides them from new bills but does not wipe history. Dealer users only see their own shop. Admins, when they have access, can pick a shop.

A company price from **Company Price Lists** can also be added into this product list when the user has permission.

---

## 9. Stock Report

**Purpose:** Prepare a printable fertilizer or pesticide stock statement for inspectors or shop records.

| Step | What the user does |
|---|---|
| 1 | Choose Fertilizer or Pesticide |
| 2 | Choose From / To dates (there is a **Today** shortcut and reuse of the last dates) |
| 3 | Add products from the catalogue, or type a one-off product for this report only |
| 4 | Enter opening stock, receipts, and sales |
| 5 | Closing stock is calculated: opening + receipts − sales |
| 6 | Optionally attach stamp / signature images (JPG, PNG, or WebP) for the printout |
| 7 | Print / Save PDF |

**Important for sales conversations:** this is a **report you fill in**, not an automatic warehouse that counts every bag from billing. Figures are not stored as a permanent stock ledger. The last report can be recalled in the same browser session for convenience. Stamp images are used only for printing and are not uploaded to the server.

If the dealer has entered an **AGL** number (fertilizer licence) or **PL** number (pesticide licence) on the shop record, that number can appear on the matching report header.

---

## 10. Company / Dealer Ledger (suppliers)

**Purpose:** Track what the shop owes companies, without mixing this with stock.

| Action | Meaning |
|---|---|
| Add supplier | Name, code, contact, phone, email, address |
| Opening balance | Starting payable or advance |
| Purchase / invoice | Amount the shop owes for a purchase |
| Payment | Amount paid to the company |
| Edit entry | Correct a mistake. Previous and new values, who changed it, and when are kept |
| Statement | Filter by date and print |
| Document helper | Optional: read a photo/PDF of a bill in the browser to **suggest** date, amount, and reference. Always check before saving. File size limit 10 MB; PDFs use the first 5 pages. The file is not sent to the server |

This ledger **does not change stock**.

---

## 11. Farmer / Customer Ledger

**Purpose:** Keep farmer accounts and saved bills.

| Action | Meaning |
|---|---|
| Add customer | Name, phone, email, address, GSTIN, state code |
| Opening balance | Starting amount due or farmer advance |
| Payment | Money received |
| Adjustment | Manual correction |
| Saved invoices | Bills saved from Billing |
| Edit invoice | Change quantity, price, or remove a returned line. A **reason is mandatory**. Balance is updated by the difference. History of the change is kept |
| Statement / invoice print | Date filter and print |

Search customers by name or phone when making a bill.

---

## 12. Company Price Lists

**Purpose:** Keep manufacturer / company rate lists so the shop can look up and compare current prices.

**Who can open it:** Dealer role (shop owner), not employees in the default setup.

| What you can do | Plain meaning |
|---|---|
| Upload Excel or CSV | Load a filled standard template, review each row, exclude bad rows, then confirm |
| Confirm as current prices | Makes those rates the live comparison prices |
| Confirm as history | Keeps the list without changing today’s prices |
| Add one price by hand | Enter company, product names, unit, GST, ex-GST and incl-GST prices |
| Search current prices | Find by trade / technical name, company, pack size |
| Export | Excel or print-ready PDF of search results (up to 500 rows) |
| Add to products | Copy a current price into the shop product list |
| History / comments | See earlier prices and notes |
| Delete a company | Removes that company’s lists for this shop (asks for confirmation) |

PDF or image price circulars must be converted to the Excel/CSV template first. Uploaded file contents are read once and not stored; the file name is remembered so the same file is not imported twice.

When a current price is replaced, the old price stays in history and a reason is recorded.

---

## 13. Admin

**Purpose:** Set up shops and people.

| Admin can | Dealer (shop owner) can |
|---|---|
| Create a dealership (name, address, GSTIN, optional AGL and PL numbers) | See their own shop |
| Create Admin, Dealer, or Employee users | Create **Employee** users for their shop only |
| Reset any user’s password | Reset employee passwords in their shop |
| Deactivate accounts | Deactivate employees in their shop |
| Create extra Admin accounts (not tied to a shop) | Cannot create Admins or users in another shop |

---

## 14. What is remembered vs what is only on screen

Use this table when a customer asks “Will this be in the system tomorrow?”

| Activity | Remembered? |
|---|---|
| Shop, users, products, default prices | Yes |
| Bill calculated but not saved to a farmer | No — preview / print only |
| Bill saved to a farmer | Yes — invoice + account balance |
| One-off product typed only on a bill | Not added to the product list; kept on the invoice only if the bill is saved |
| Stock report numbers | No permanent stock book |
| Supplier purchases and payments | Yes, with edit history |
| Farmer payments and invoices | Yes, with invoice edit history |
| Confirmed company prices | Yes, with history when a price is replaced |
| Original Excel file of a price list | No — only a fingerprint of the file so duplicates can be blocked |
| Photo/PDF used to fill a supplier entry | No — processed on the computer only |
| Stamp / signature on stock report | No — print only |

---

## 15. Honest limits (say this in a sales conversation)

This is a **working starter / demonstration product**, not a finished certified ERP.

| Topic | What to tell the customer |
|---|---|
| Demo password | `admin` / `admin123` is a known demo login. It must be changed for real use. |
| GST | Tax split is simplified. A tax professional should review before live GST filing. |
| Stock | Stock Report is a filled statement, not automatic inventory from every bill. |
| Company ledger | Tracks money with suppliers; it does not update stock. |
| Price lists | Excel/CSV template is supported. Supplier PDFs need conversion first. |
| OCR (reading a paper bill) | Helps fill fields; always check the numbers. |
| Admin demo | The seeded admin login only opens Admin until a dealer user is created. |
| Real-world rollout | Passwords, shop data, and tax rules must be set for that customer before go-live. |

---

## 16. Quick demo script (about 10 minutes)

1. Open the website and sign in as `admin` / `admin123`.
2. Create a dealer (use the sample Nataraja details if you want a realistic header on bills).
3. Create a **Dealer** user for that shop and note the password.
4. Log out. Sign in as the dealer.
5. Open **Products** and show DAP / Urea / MOP (if using the sample shop) or add one product.
6. Open **Farmer / Customer Ledger**, add a farmer, then go to **Billing**, select that farmer, add 2 bags of a product, calculate, print, and save the bill.
7. Return to the farmer ledger and show the invoice and balance (credit vs cash).
8. Open **Stock Report**, pick Fertilizer, enter opening / receipt / sales, print.
9. Open **Company / Dealer Ledger**, add a company and a purchase.
10. Open **Company Price Lists**, add one manual price or show search (if a list is already loaded).

That walkthrough covers the product a salesperson needs to explain: **bill, account, stock paper, supplier account, company rates, and staff logins**.
