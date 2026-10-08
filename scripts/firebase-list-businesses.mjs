import { operatorOptions, operator, payload } from './lib/firebase-operator.mjs';
const options=operatorOptions(), api=operator(options);
for(const doc of await api.all(api.docs+'/hf_businesses')) {
  const b=payload(doc);
  if(b._archived !== true) console.log(JSON.stringify({business_id:doc.name.split('/').at(-1), name:b.name, owner_email:b.owner_email, payment_contacts_schema:b.payment_contacts_schema || 0, workflow_schema:b.workflow_schema || 0, finance_schema:b.finance_schema || 0, locked:b._migration_state === 'in_progress'}));
}
