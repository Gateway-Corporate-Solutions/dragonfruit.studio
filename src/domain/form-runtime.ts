/** Shared server implementation shipped verbatim to Fresh and React exports. No browser secrets. */
export const FORM_SERVER_SOURCE = String.raw`
const windows = new Map();
const reply = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handleForm(request, website, getEnv, options={}) {
  if (request.method !== 'POST') return reply({error:'Method not allowed'},405);
  const url = new URL(request.url), origin = request.headers.get('origin');
  if (origin !== (getEnv('PUBLIC_ORIGIN') || url.origin)) return reply({error:'Origin not allowed'},403);
  const match = url.pathname.match(/^\/api\/forms\/([a-z][a-z0-9-]*)\/([a-zA-Z][a-zA-Z0-9_-]*)$/);
  const page = match && website.pages.find(p => p.id===match[1]);
  const flatten = nodes => nodes.flatMap(n => [n,...flatten(n.children)]);
  const form = page && flatten(page.nodes).find(n => n.id===match[2] && n.tag==='form');
  if (!form) return reply({error:'Form not found'},404);
  const config = website.apis?.find(a => a.id===form.layer.apiId);
  if (!config) return reply({error:'Connect this form to an API in dragonfruit before exporting.'},422);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'Use application/json'},415);
  let data;
  try {
    const reader=request.body?.getReader();if(!reader)return reply({error:'Missing submission'},400);
    const parts=[];let size=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>32768){await reader.cancel();return reply({error:'Submission is too large'},413);}parts.push(chunk.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    data=JSON.parse(new TextDecoder().decode(bytes));
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error();
  } catch {return reply({error:'Invalid JSON submission'},400);}
  if(data.__df_hp)return reply({error:'Submission rejected'},400);
  const values={};
  for(const field of form.layer.fields){
    const raw=data[field.name];if(raw!==undefined&&typeof raw!=='string')return reply({error:'Invalid field: '+field.label},400);
    const value=(raw||'').trim();
    if(value.length>6000||(field.required&&!value)||(field.type==='checkbox'&&field.required&&value!=='true'))return reply({error:'Check '+field.label},400);
    if(value&&field.type==='email'&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value))return reply({error:'Enter a valid email address'},400);
    if(value&&field.type==='number'&&!Number.isFinite(Number(value)))return reply({error:'Enter a number for '+field.label},400);
    values[field.name]=value;
  }
  const email=values[config.emailField];
  if((config.provider==='mailchimp'||config.provider==='resend')&&(!email||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))return reply({error:'Map an email field in the API editor'},422);
  if(config.provider==='mailchimp'){
    if(!form.layer.fields.some(f=>f.name===config.consentField&&f.type==='checkbox')||values[config.consentField]!=='true')return reply({error:'Newsletter signup requires consent'},400);
    for(const field of Object.values(config.mergeFields))if(!form.layer.fields.some(f=>f.name===field))return reply({error:'A mapped Mailchimp field is missing'},422);
  }
  if(options.dryRun||config.provider==='preview')return reply({ok:true,preview:true,provider:config.provider,fields:Object.keys(values),message:'Validated locally; no data sent or saved.'});
  const needed=[config.credentialEnv];
  if(config.provider==='resend')needed.push(config.fromEnv,config.toEnv);
  if(config.provider==='mailchimp')needed.push(config.audienceEnv);
  if(config.provider==='webhook'){needed.length=0;needed.push(config.urlEnv);}
  if(needed.some(name=>!getEnv(name)))return reply({error:'Integration needs server environment variables. Check the exported README.'},503);
  const key=page.id+'/'+form.id,now=Date.now();
  let window=windows.get(key);if(!window||now-window.start>=60000){window={start:now,count:0};windows.set(key,window);}
  if(++window.count>config.rateLimit)return reply({error:'Too many submissions. Try again in a minute.'},429);
  let endpoint, payload, headers={'Content-Type':'application/json'};
  if(config.provider==='resend'){
    endpoint='https://api.resend.com/emails';headers.Authorization='Bearer '+getEnv(config.credentialEnv);
    payload={from:getEnv(config.fromEnv),to:getEnv(config.toEnv).split(',').map(s=>s.trim()),reply_to:email,subject:config.subject,text:Object.entries(values).map(([k,v])=>k+': '+v).join('\n\n')};
  } else if(config.provider==='mailchimp'){
    const token=getEnv(config.credentialEnv),dc=token.split('-').pop();
    if(!/^us[0-9]{1,3}$/.test(dc))return reply({error:'Check the Mailchimp API key data-center suffix'},503);
    endpoint='https://'+dc+'.api.mailchimp.com/3.0/lists/'+encodeURIComponent(getEnv(config.audienceEnv))+'/members';headers.Authorization='Bearer '+token;
    payload={email_address:email,status:'pending',merge_fields:Object.fromEntries(Object.entries(config.mergeFields).map(([tag,field])=>[tag,values[field]]))};
  } else {
    endpoint=getEnv(config.urlEnv);
    try {const target=new URL(endpoint);if(target.protocol!=='https:'||target.username||target.password||target.hash)throw Error();}catch{return reply({error:'Configure an HTTPS webhook URL'},503);}
    if(getEnv(config.credentialEnv))headers.Authorization='Bearer '+getEnv(config.credentialEnv);
    payload={form:form.id,page:page.path,fields:values};
  }
  try {
    const response=await (options.fetcher||fetch)(endpoint,{method:'POST',headers,body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.body)await response.body.cancel();
    if(!response.ok)return reply({error:'The integration rejected the submission. Check server configuration and provider logs.'},502);
    return reply({ok:true});
  } catch {return reply({error:'The integration is unavailable. Try again later.'},502);}
}
`;
