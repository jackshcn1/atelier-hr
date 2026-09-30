# Petpooja Report Mapping Reference

This document maps each variable pay metric to its source Petpooja report and data structure.

## Report Sources

### 1. Captain Performance Report
- **URL**: https://billing.petpooja.com/custom_reports/view_report/27
- **Report ID**: #27
- **Metrics**:
  - `cap_sales` - Individual captain sales (per employee)
  - `hlp_team_sales` - Total team sales for service helpers
- **Data Structure**:
  - Column A: Captain Name
  - Column D: Total (₹)
- **Parser**: `parseCaptainPerformance()`

### 2. Pax Sales Report
- **URL**: https://billing.petpooja.com/custom_reports/view_report/61
- **Report ID**: #61
- **Metrics**:
  - `cap_pax_avg` - Average per cover (APC) per captain
- **Data Structure**:
  - Captain Name, Pax count, Sales amount
- **Parser**: `parsePaxSales()`

### 3. Item Report (Counter & Delivery Sales)
- **URL**: https://billing.petpooja.com/custom_reports/view_report/65
- **Report ID**: #65
- **Metrics**:
  - `b2b_counter_sales` - Counter sales total
  - `acc_delivery_sales` - Delivery sales (Swiggy + Zomato)
- **Data Structure**:
  - Item Name, Category, Area (Swiggy/Zomato), Final Total
- **Parsers**: `parseCounterSales()`, `parseDeliverySales()`
- **Logic**:
  - Counter: Categories in predefined list (Quick Bites, Birthday Cakes, etc.)
  - Delivery: Area contains "Swiggy" or "Zomato"

### 4. Corporate GSTN Summary
- **URL**: https://billing.petpooja.com/reports/all_restaurant_orders/all
- **Report Type**: Standard Petpooja report
- **Metrics**:
  - `b2b_rev` - Total B2B revenue in period
  - `b2b_clients` - Count of new B2B clients (first-time GSTINs)
- **Data Structure**:
  - GSTIN, Customer Name, Created Date, Grand Total
- **Parser**: `parseB2bGstOrders()`
- **Special Logic**: 
  - Pulls 100 days of history (T-99 days)
  - Identifies "new" clients as GSTINs not seen before current period

### 5. Due Payment Report
- **URL**: https://billing.petpooja.com/custom_reports/view_report/73
- **Report ID**: #73
- **Metrics**:
  - `b2b_credit` - Pass/Fail for credit recovery (1 = pass, 0 = fail)
- **Data Structure**:
  - Invoice details, Due Date, Remaining Amount
- **Parser**: `parseCreditRecovery()`
- **Special Logic**:
  - Pulls from March 04, 2026 to catch aged invoices
  - Fails if any invoice >30 days overdue

### 6. Kitchen Prep Time Report
- **URL**: https://billing.petpooja.com/custom_reports/view_report/78
- **Report ID**: #78
- **Requires**: Base Menu export (for category mapping)
- **Metrics**:
  - `kit_prep_time` - Average preparation time in minutes
- **Data Structure (KOT Report)**:
  - KOT ID, Item Name, Preparation Time, Punch Time
- **Data Structure (Base Menu)**:
  - Column A: Item Name
  - Column I: Category (in zip backup format)
  - Column B: Category, Column C: Item Name (in manual upload format)
- **Parser**: `parseKitchenPrepTime()`
- **Special Logic**:
  - Only counts items in approved kitchen categories (14 categories)
  - Filters: Appetizer, Arabic, Burgers, Chinese, Combos, Grills, Indian, Indian Breads, Kothu Parotta, Pastas, Pizza, Salads, Sandwiches, Soups

### 7. Wastage Report
- **URL**: https://inventory.petpooja.com/inventories/wastage_list/
- **Module**: Petpooja Inventory
- **Metrics**:
  - `kit_wastage` - Total wastage amount in ₹
- **Data Structure**:
  - Date, Status, Amount (₹)
- **Parser**: `parseWastage()`
- **Special Logic**:
  - Excludes rows where Status = "Cancelled"
  - Requires "Export All" for complete data

### 8. Purchase Returns
- **URL**: https://inventory.petpooja.com/inventories/purchase_return_list/
- **Module**: Petpooja Inventory
- **Metrics**:
  - `b2b_returns` - Total purchase returns in ₹
- **Data Structure**:
  - Debit Note No., Debit Note Date, Status, Total (₹)
- **Parser**: `parsePurchaseReturns()`
- **Special Logic**:
  - Excludes rows where Status = "Cancelled"
  - Requires "Export All" for complete data

## Base Menu Export
- **URL**: https://menu.petpooja.com/menus/menu_item_list_new
- **Download Process**:
  1. Click "Quick Actions" button
  2. Select "Download Base Menu [Backup]"
  3. Click "Select All" for categories
  4. Click "Save" → Downloads zip file
  5. Extract "items_*.csv" from zip
- **Update Frequency**: Every 15 days (menu changes infrequently)
- **Storage**: Cached in `.claude/base-menu-cache/` folder
- **Used By**: Kitchen Prep Time Report only

## Variable Pay Schemes Mapped to Reports

### Service Captains
- `cap_sales` ← Captain Performance Report (#27)
- `cap_pax_avg` ← Pax Sales Report (#61)

### Service Helpers
- `hlp_team_sales` ← Captain Performance Report (#27)

### Kitchen Team
- `kit_prep_time` ← KOT Prep Time Report (#78) + Base Menu
- `kit_wastage` ← Wastage Report (Inventory)

### B2B Counter Team
- `b2b_counter_sales` ← Item Report (#65)
- `b2b_rev` ← Corporate GSTN Summary
- `b2b_clients` ← Corporate GSTN Summary
- `b2b_credit` ← Due Payment Report (#73)
- `b2b_returns` ← Purchase Returns (Inventory)

### Accounting Team
- `acc_delivery_sales` ← Item Report (#65)

## Data Retention

All metrics are stored in `variable_metric_inputs` table with:
- `period_id` - Links to 20th-19th pay cycle
- `metric_id` - The metric key
- `employee_id` - NULL for team metrics, specific for individual
- `actual_value` - The numeric value
- `source_type` - Always "petpooja"
- `source_filename` - Report name
- `source_detail` - JSON with breakdown data
- `updated_at` - Last sync timestamp

## Date Range Logic

- **Standard Reports**: Current payroll cycle (20th of previous month to 19th of current month)
- **Corporate GSTN**: T-99 days to identify new clients
- **Due Payment**: From March 04, 2026 to catch all aged invoices
- **Base Menu**: Cached for 15 days, refreshed automatically

## Future Expansion

This data can be used for:
- Monthly P&L reports
- Department performance dashboards
- Inventory cost tracking
- Customer acquisition metrics
- Service quality analytics
- Menu engineering analysis
- Predictive staffing models
