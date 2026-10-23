const openEditEstimateModal = (q) => {
    setEditingEstimate(q);
    const parsed = q.estimated_delivery && q.estimated_delivery.startsWith('{') ? JSON.parse(q.estimated_delivery) : {};
    setEstDate(parsed.date || q.date || new Date().toISOString().split('T')[0]);
    setEstPoc(parsed.poc_id || q.poc_id || (job?.maintenance_pocs?.id || ''));
    const lineItems = parsed.line_items || q.line_items || '[]';
    const parsedLines = typeof lineItems === 'string' ? (lineItems.startsWith('{') ? JSON.parse(lineItems).line_items || [] : JSON.parse(lineItems || '[]')) : lineItems;
    setEstLines(Array.isArray(parsedLines) && parsedLines.length > 0 ? parsedLines : [{name:'',units:1,cost:0}]);
    setShowEstimateModal(true);
  }