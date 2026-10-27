import { BOOKING_BROWSER_SOURCE } from "./booking-runtime.ts";
import { BOOKING_SERVER_SOURCE } from "./booking-server.ts";
/** Shared exported server implementation: server prices are authoritative. */
export const COMMERCE_SERVER_SOURCE = BOOKING_SERVER_SOURCE + String.raw`
const limits = new Map();
export async function handleCommerce(request, website, env, send = fetch) {
 const url = new URL(request.url), c = website.commerce || {currency:'usd',provider:'preview',products:[],slots:[]};
 const json = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if (request.method === 'GET' && url.pathname === '/api/commerce/catalog') return json({currency:c.currency,products:c.products.filter(p=>p.active)});
 if (url.pathname === '/api/commerce/schedule' || url.pathname === '/api/commerce/book') return handleBooking(request,website,env,send);
 if (url.pathname !== '/api/commerce/checkout') return json({error:'Not found'},404);
 if (request.method !== 'POST') return json({error:'Use POST'},405);
 let origin; try { origin = new URL(env('PUBLIC_ORIGIN') || url.origin).origin; } catch { return json({error:'Configure PUBLIC_ORIGIN'},503); }
 if (request.headers.get('origin') !== origin) return json({error:'Origin rejected'},403);
 if (!(request.headers.get('content-type') || '').startsWith('application/json')) return json({error:'Use JSON'},415);
 const now=Date.now(); for(const [key,v] of limits) if(now-v.time>60000)limits.delete(key);
 const bucket=limits.get(origin)||{time:now,count:0}; if(++bucket.count>120)return json({error:'Too many checkout requests. Try again shortly.'},429);limits.set(origin,bucket);
 try {
  const reader=request.body?.getReader(); if(!reader)return json({error:'Cart required'},400);
  let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return json({error:'Cart too large'},413);}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const body=JSON.parse(new TextDecoder().decode(bytes)), items=body.items;
  if(!Array.isArray(items)||!items.length||items.length>50)return json({error:'Choose 1–50 products'},400);
  const seen=new Set(), lines=[];let total=0;
  for(const item of items){const p=c.products.find(p=>p.id===item.id&&p.active);if(!p||seen.has(p.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)return json({error:'Invalid product or quantity'},400);seen.add(p.id);total+=p.amount*item.quantity;lines.push({p,quantity:item.quantity});}
  if(c.provider==='preview')return json({preview:true,total,currency:c.currency});
  const key=env('STRIPE_SECRET_KEY');if(!key)return json({error:'Checkout is not configured'},503);
  const params=new URLSearchParams({mode:'payment',success_url:origin+'/?checkout=success&session_id={CHECKOUT_SESSION_ID}',cancel_url:origin+'/?checkout=cancelled'});
  lines.forEach(({p,quantity},i)=>{const base='line_items['+i+']';params.set(base+'[quantity]',String(quantity));params.set(base+'[price_data][currency]',c.currency);params.set(base+'[price_data][unit_amount]',String(p.amount));params.set(base+'[price_data][product_data][name]',p.name);});
  const response=await send('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(15000)});
  const session=await response.json();if(!response.ok||typeof session.url!=='string'||new URL(session.url).origin!=='https://checkout.stripe.com')return json({error:'Checkout provider unavailable'},502);
  return json({url:session.url});
 }catch{return json({error:'Could not create checkout. Check your cart and try again.'},400);}
}
`;
export const COMMERCE_BROWSER_SOURCE = BOOKING_BROWSER_SOURCE + String.raw`
function mountCommerce(root, api, preview, config) {
 let catalog=config?.products?.filter(p=>p.active)||[],currency=config?.currency||'usd',slots=config?.slots||[],cart=[];
 const storageKey='dragonfruit.cart.v1';
 try{const stored=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(stored))cart=stored.filter(i=>typeof i.id==='string'&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=99).slice(0,50);}catch{}
 const widgets=[...root.querySelectorAll('[data-commerce]')];if(!widgets.length)return;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const money=n=>new Intl.NumberFormat(undefined,{style:'currency',currency}).format(n/100);
 function save(){try{sessionStorage.setItem(storageKey,JSON.stringify(cart));}catch{}queueMicrotask(render);}
 function button(label,fn){const b=el('button',label);b.type='button';b.addEventListener('click',fn);return b;}
 async function reserve(details,sourceWidget){if(preview)return {preview:true};const response=await fetch('/api/commerce/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(details)});const result=await response.json();if(!response.ok){const error=new Error(result.error||'Booking unavailable. Retry to check your reservation.');error.conflict=response.status===409;throw error;}slots=slots.filter(slot=>Date.parse(slot.start)>=Date.parse(result.appointment.end)||Date.parse(slot.end)<=Date.parse(result.appointment.start));widgets.filter(widget=>widget.dataset.commerce==='calendar'||widget.dataset.commerce==='schedule').forEach(widget=>{if(widget!==sourceWidget)renderBookings(widget,slots,reserve);});return result;}
 async function checkout(widget){const status=widget.querySelector('[data-commerce-status]');if(widget.dataset.busy)return;widget.dataset.busy='true';
  try{if(!cart.length)throw new Error('Your cart is empty.');if(preview){status.textContent='Preview checkout — no payment is collected.';return;}status.textContent='Opening secure checkout…';const response=await fetch('/api/commerce/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:cart})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Checkout unavailable');if(result.preview){status.textContent='Preview checkout — no payment collected. Total: '+money(result.total);return;}if(new URL(result.url).origin!=='https://checkout.stripe.com')throw new Error('Invalid checkout URL');window.location.assign(result.url);}catch(error){status.textContent=error.message;}finally{delete widget.dataset.busy;}}
 function render(){widgets.forEach(widget=>{const content=widget.querySelector('[data-commerce-content]');content.replaceChildren();const kind=widget.dataset.commerce;
 if(kind==='shop'||kind==='product'){
  const products=catalog.filter(p=>kind==='shop'||p.id===widget.dataset.product);if(!products.length)content.append(el('p','No products available. Configure products in the Commerce API editor.'));
  products.forEach(p=>{const card=el('article');if(p.image){const img=el('img');img.src=p.image;img.alt=p.name;img.loading='lazy';card.append(img);}card.append(el('h3',p.name),el('p',p.description),el('p',money(p.amount)),button('Add to cart',()=>{const found=cart.find(i=>i.id===p.id);if(found)found.quantity=Math.min(99,found.quantity+1);else if(cart.length<50)cart.push({id:p.id,quantity:1});save();widget.querySelector('[data-commerce-status]').textContent=p.name+' added to cart.';}));content.append(card);});
 }else if(kind==='calendar'||kind==='schedule'){
    renderBookings(widget,slots,reserve);
 }else{
  let total=0;cart.forEach(i=>{const p=catalog.find(p=>p.id===i.id);if(!p)return;total+=p.amount*i.quantity;const row=el('article');const qty=el('input');qty.type='number';qty.min='1';qty.max='99';qty.value=i.quantity;qty.setAttribute('aria-label','Quantity for '+p.name);qty.addEventListener('change',()=>{const n=Number(qty.value);if(Number.isInteger(n)&&n>=1&&n<=99){i.quantity=n;save();}else qty.value=i.quantity;});row.append(el('h3',p.name),el('p',money(p.amount)),qty,button('Remove '+p.name,()=>{cart=cart.filter(x=>x!==i);save();}));content.append(row);});
  content.append(el('p',cart.length?'Subtotal: '+money(total):'Your cart is empty.'));const b=button('Secure checkout',()=>checkout(widget));b.disabled=!cart.length;content.append(b);
 }
 });}
 async function load(){try{const [a,b]=await Promise.all([fetch('/api/commerce/catalog'),fetch('/api/commerce/schedule')]);if(!a.ok||!b.ok)throw new Error();const products=await a.json(),schedule=await b.json();catalog=products.products;currency=products.currency;slots=schedule.slots;cart=cart.filter(i=>catalog.some(p=>p.id===i.id));render();}catch{widgets.forEach(w=>w.querySelector('[data-commerce-status]').textContent='Commerce API is unavailable. Try again shortly.');}}
 render();if(!preview)load();
}
`;
