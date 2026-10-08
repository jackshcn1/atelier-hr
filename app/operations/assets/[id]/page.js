'use client';
export default function FullAssetRecord({ params }) {
  const asset = {
    id: params.id,
    name: 'Hoshizaki 2 Door Undercounter',
    category: 'Kitchen Equipment',
    quantity: 1,
    type: 'Kitchen Equipment',
    purchaseDate: '2025-05-10',
    condition: 'Good',
    brand: 'Hoshizaki',
    model: '2 Door Undercounter Chiller',
    serialNumber: 'HSZ-2045-882',
    vendor: 'Kitchen Supply Co.',
    warrantyPeriodMonths: 24,
    warrantyTill: '2027-05-10',
    extendedWarranty: false,
    buyingPrice: 4200,
    location: 'Kitchen',
    assignedEmployee: null,
    invoiceUrl: '#',
    notes: 'Installed behind main prep station.',
    status: 'available',
  };

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-4xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="btn-secondary text-xs px-3 py-1.5">← Home</a>
          <a href="/operations" className="text-[#8b6f4e] text-sm hover:underline">Operations</a>
          <span className="text-[#8b6f4e] text-sm">/</span>
          <a href="/operations/assets" className="text-[#8b6f4e] text-sm hover:underline">Assets</a>
          <span className="text-[#8b6f4e] text-sm">/</span>
          <span className="text-[#6b635c] text-sm">{asset.name}</span>
        </div>
        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">{asset.name}</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">Category: {asset.category} · Serial: {asset.serialNumber}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm lg:col-span-2">
            <div className="panel-body p-8 lg:p-10">
              <h2 className="font-serif text-xl mb-6">Asset Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                <Field label="Asset Name" value={asset.name} />
                <Field label="Quantity" value={String(asset.quantity)} />
                <Field label="Type" value={asset.type} />
                <Field label="Purchase Date" value={asset.purchaseDate} />
                <Field label="Brand" value={asset.brand} />
                <Field label="Model Name" value={asset.model} />
                <Field label="Serial Number" value={asset.serialNumber} />
                <Field label="Vendor" value={asset.vendor} />
                <Field label="Condition" value={asset.condition} />
                <Field label="Status" value={asset.status} />
                <Field label="Warranty Period" value={`${asset.warrantyPeriodMonths} months`} />
                <Field label="Warranty Available Till" value={asset.warrantyTill} />
                <Field label="Extended Warranty" value={asset.extendedWarranty ? 'Yes' : 'No'} />
                <Field label="Buying Price" value={`₹${asset.buyingPrice.toLocaleString()}`} />
                <Field label="Asset Location" value={asset.location} />
                <Field label="Assigned Employee" value={asset.assignedEmployee || 'Not assigned'} />
                <Field label="Notes" value={asset.notes} full />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
              <div className="panel-body p-8">
                <h3 className="font-serif text-lg mb-3">Invoice</h3>
                <a href={asset.invoiceUrl} className="btn-secondary text-xs px-3 py-1.5">View Invoice PDF</a>
              </div>
            </div>
            <div className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
              <div className="panel-body p-8">
                <h3 className="font-serif text-lg mb-3">Quick Actions</h3>
                <div className="flex flex-col gap-2">
                  <a href="/operations/assets" className="btn-primary text-xs text-center">Back to Assets List</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, full }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-[#8b6f4e] font-medium mb-1">{label}</p>
      <p className="text-sm text-[#1e1812] font-medium">{value}</p>
    </div>
  );
}
