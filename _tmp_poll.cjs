const { config } = require('dotenv'); const { resolve } = require('node:path'); const { Client } = require('pg');
config({ path: resolve(process.cwd(), 'apps/server/.env') }); config({ path: resolve(process.cwd(), '.env') });
const T='sourcing_1688_hot_product_daily_snapshots';
const DY=['谷子','咕卡','盲盒','数字油画','起泡胶','磁力片','拼豆','微缩模型'];
(async()=>{ const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
 for(let i=0;i<12;i++){
   const t=await c.query(`select count(*)::int n, count(distinct source_keyword)::int k from ${T} where business_date>=(current_date)`);
   const d=await c.query(`select count(distinct source_keyword)::int k, count(*)::int n from ${T} where business_date>=(current_date) and source_keyword=any($1)`,[DY]);
   console.log(`[${(i+1)*10}s] 오늘1688: ${t.rows[0].n}행/${t.rows[0].k}키워드 · 도우인: ${d.rows[0].k}키워드/${d.rows[0].n}행`);
   if(d.rows[0].k>0){ console.log('>>> 도우인 데이터 들어옴!'); break; }
   await new Promise(r=>setTimeout(r,10000));
 }
 await c.end();
})().catch(e=>console.log('ERR',e.message));
