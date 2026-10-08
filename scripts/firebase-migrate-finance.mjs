import { build } from 'esbuild';
import { operatorOptions } from './lib/firebase-operator.mjs';
import { runMigration } from './lib/firebase-migration-runner.mjs';
const options=operatorOptions();
const bundle=await build({entryPoints:['src/firebaseFinanceMigration.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {financeMigrationPlan}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
await runMigration(options,'finance-v3',b=>{
 if(b.payment_contacts_schema !== 1 || b.workflow_schema !== 2) throw Error('Zuerst Phasen 1 und 2 vollständig migrieren.');
},['records','finance','payment_contacts','visit_guards','locks','members','billing','catalogue'],(data,b)=>{
 const p=financeMigrationPlan(data,b);
 return {markers:{finance_schema:3},targets:{records:p.records.map(value=>({id:value._table+'~'+value.id,value})),finance:p.finance.map(value=>({id:value.treatment_id,value})),members:p.members.map(value=>({id:value.user_id,value})),catalogue:p.catalogue.map(value=>({id:'main',value}))}};
});
