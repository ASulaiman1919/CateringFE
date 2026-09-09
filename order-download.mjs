export function downloadOrder({ requestId, reference, createdAt }) {
  const form = document.createElement('form');
  form.method = 'POST'; form.action = '/api/order-summary'; form.target = '_blank'; form.hidden = true;
  const fields = requestId ? { requestId } : { reference, createdAt };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
  }
  document.body.append(form); form.submit(); form.remove();
}
