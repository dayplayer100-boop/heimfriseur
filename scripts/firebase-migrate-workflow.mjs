import { build } from 'esbuild';
import { operatorOptions } from './lib/firebase-operator.mjs';
import { runMigration } from './lib/firebase-migration-runner.mjs';
const options=operatorOptions();
const bundle=await build({entryPoints:['src/firebaseMigrationPlan.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const { workflowMigrationPlan }=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
await runMigration(options,'workflow-v2',b=>{
  if(b.payment_contacts_schema !== 1) throw Error('Zuerst Phase 1 vollständig migrieren.');
},['records','finance','payment_contacts','visit_guards','locks','members','billing','catalogue'], data=>{
  const p=workflowMigrationPlan(data.records,data.finance,data.payment_contacts);
  return {markers:{workflow_schema:2},targets:{
    records:p.rows.map(value=>({id:value._table+'~'+value.id,value})),
    finance:p.money.map(value=>({id:value.treatment_id,value})),
    payment_contacts:p.protectedContacts.map(value=>({id:value.id,value})),
    visit_guards:[...p.guards].map(([id,value])=>({id,value})),
    locks:[...p.locks].map(([id,value])=>({id,value})),
  }};
});
