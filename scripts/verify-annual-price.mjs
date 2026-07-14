import fs from 'fs';
const e = Object.fromEntries(fs.readFileSync('C:/Users/alaba/wovely/.env.local','utf8').split(/\r?\n/)
  .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
const r = await fetch('https://api.stripe.com/v1/checkout/sessions?limit=1&expand[]=data.line_items', {
  headers: { Authorization: 'Bearer ' + e.STRIPE_SECRET_KEY },
});
const j = await r.json();
const s = j.data[0];
const li = s.line_items.data[0];
console.log('SESSION      ', s.id);
console.log('MODE/STATUS  ', s.mode, '/', s.status);
console.log('AMOUNT_TOTAL ', s.amount_total, s.currency.toUpperCase(), '=> $' + (s.amount_total/100).toFixed(2));
console.log('PRICE_ID     ', li.price.id);
console.log('UNIT_AMOUNT  ', li.price.unit_amount, '=> $' + (li.price.unit_amount/100).toFixed(2));
console.log('INTERVAL     ', li.price.recurring.interval);
console.log('PRICE_ACTIVE ', li.price.active);
