export const BOOKING_SERVER_SOURCE = String.raw`
const bookingEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const bookingOverlap = (a,b) => Date.parse(a.start)<Date.parse(b.end)&&Date.parse(a.end)>Date.parse(b.start);
const bookingLimits = new Map();
async function bookingStorage(env) {
 const fs=await import('node:fs/promises'),path=await import('node:path');
 const filename=path.resolve(env('BOOKINGS_FILE')||'.dragonfruit/bookings.json');
 await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
 const read=async()=>{try{const records=JSON.parse(await fs.readFile(filename,'utf8'));if(!Array.isArray(records)||records.some(r=>!r||typeof r.id!=='string'||!Number.isFinite(Date.parse(r.start))||!(Date.parse(r.end)>Date.parse(r.start))))throw new Error('Invalid booking storage');return records;}catch(error){if(error.code==='ENOENT')return [];throw error;}};
 const write=async records=>{const temporary=filename+'.'+crypto.randomUUID()+'.tmp';try{const file=await fs.open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(records));await file.sync();}finally{await file.close();}await fs.rename(temporary,filename);}finally{await fs.unlink(temporary).catch(()=>{});}};
 const lock=async()=>{for(let attempt=0;attempt<50;attempt++){try{const file=await fs.open(filename+'.lock','wx',0o600);return async()=>{await file.close();await fs.unlink(filename+'.lock');};}catch(error){if(error.code!=='EEXIST')throw error;await new Promise(resolve=>setTimeout(resolve,10));}}throw new Error('Booking storage busy');};
 return {read,write,lock};
}
function bookingCalendar(record) {
 const escape=value=>String(value).replace(/\\/g,'\\\\').replace(/\r?\n|\r/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 const date=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const fold=line=>{let result='',length=0;for(const character of line){const size=new TextEncoder().encode(character).length;if(length+size>75){result+='\r\n ';length=1;}result+=character;length+=size;}return result;};
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//dragonfruit//Bookings//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT','UID:'+record.id+'@dragonfruit','DTSTAMP:'+date(record.createdAt),'DTSTART:'+date(record.start),'DTEND:'+date(record.end),'SUMMARY:'+escape(record.title),'DESCRIPTION:'+escape('Customer: '+record.name+'\nEmail: '+record.email+(record.notes?'\nNotes: '+record.notes:'')),'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
async function bookingNotification(record,env,send,to) {
 const calendar=bookingCalendar(record);
 const google=new URL('https://calendar.google.com/calendar/render');google.search=new URLSearchParams({action:'TEMPLATE',text:record.title,dates:[record.start,record.end].map(value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')).join('/'),details:'Customer: '+record.name+'\nEmail: '+record.email+(record.notes?'\nNotes: '+record.notes:'')}).toString();
 const text=[record.title,'Start: '+record.start,'End: '+record.end,'Customer: '+record.name,'Email: '+record.email,'Notes: '+record.notes,'Add to Google Calendar: '+google.href,'Or open the attached appointment.ics calendar event.'].join('\n');
 const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':'booking/'+record.id},body:JSON.stringify({from:env('BOOKINGS_EMAIL_FROM'),to:[to],reply_to:record.email,subject:'Appointment: '+record.title,text,attachments:[{filename:'appointment.ics',content:btoa(String.fromCharCode(...new TextEncoder().encode(calendar)))}]}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Booking notification unavailable');
}
export async function handleBooking(request,website,env,send=fetch) {
 const url=new URL(request.url),config=website.commerce||{slots:[]};
 const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method==='GET'&&url.pathname==='/api/commerce/schedule'){
  try{const records=await (await bookingStorage(env)).read();return json({slots:config.slots.filter(slot=>Date.parse(slot.start)>Date.now()&&(slot.bookingUrl||!records.some(record=>bookingOverlap(slot,record))))});}catch{return json({error:'Booking availability is temporarily unavailable'},503);}
 }
 if(request.method!=='POST')return json({error:'Use POST'},405);
 let origin;try{origin=new URL(env('PUBLIC_ORIGIN')||url.origin).origin;}catch{return json({error:'Configure PUBLIC_ORIGIN'},503);}
 if(request.headers.get('origin')!==origin)return json({error:'Origin rejected'},403);
 if(!(request.headers.get('content-type')||'').startsWith('application/json'))return json({error:'Use JSON'},415);
 const now=Date.now();for(const [key,value] of bookingLimits)if(now-value.time>60000)bookingLimits.delete(key);const bucket=bookingLimits.get(origin)||{time:now,count:0};bookingLimits.set(origin,bucket);if(++bucket.count>120)return json({error:'Too many booking requests. Try again shortly.'},429);
 const recipient=env('BOOKINGS_EMAIL_TO')||config.businessEmail;
 if(!bookingEmail(recipient)||!env('RESEND_API_KEY')||!env('BOOKINGS_EMAIL_FROM'))return json({error:'Booking notifications are not configured'},503);
 let body;
 try{const reader=request.body?.getReader();if(!reader)return json({error:'Appointment details required'},400);let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return json({error:'Appointment details too large'},413);}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid appointment details'},400);}
 if(!body||typeof body.id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(body.id)||typeof body.slotId!=='string'||typeof body.name!=='string'||!body.name.trim()||body.name.length>200||/[\r\n]/.test(body.name)||!bookingEmail(body.email)||typeof body.notes!=='string'||body.notes.length>3000)return json({error:'Enter your name, email, and valid appointment details'},400);
 let release;
 try{
  const storage=await bookingStorage(env);release=await storage.lock();const records=await storage.read();
  let record=records.find(record=>record.id===body.id);
  if(record&&(record.slotId!==body.slotId||record.name!==body.name.trim()||record.email!==body.email||record.notes!==body.notes))return json({error:'Booking request does not match the original appointment'},409);
  if(!record){
   const slot=config.slots.find(slot=>slot.id===body.slotId&&!slot.bookingUrl);
   if(!slot||Date.parse(slot.start)<=Date.now())return json({error:'This appointment is no longer available'},409);
   if(records.some(record=>bookingOverlap(slot,record)))return json({error:'This time has already been booked. Choose another appointment.'},409);
   record={id:body.id,slotId:slot.id,title:slot.title,start:slot.start,end:slot.end,name:body.name.trim(),email:body.email,notes:body.notes,createdAt:new Date().toISOString(),notified:false};records.push(record);await storage.write(records);
  }
  if(!record.notified){try{await bookingNotification(record,env,send,recipient);record.notified=true;await storage.write(records);}catch{}}
  return json({confirmed:true,notificationSent:record.notified,calendar:bookingCalendar(record),appointment:{id:record.id,title:record.title,start:record.start,end:record.end}},201);
 }catch{return json({error:'Booking storage is temporarily unavailable. Retry the same request.'},503);}finally{if(release)await release();}
}
`;
