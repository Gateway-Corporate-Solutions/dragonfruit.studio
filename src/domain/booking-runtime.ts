/** Shared by editor previews and both framework exports. */
export const BOOKING_BROWSER_SOURCE = String.raw`
const bookingStates = new WeakMap();
function renderBookings(widget, slots, reserve) {
 const content=widget.querySelector('[data-commerce-content]');
 const options=JSON.parse(widget.dataset.bookingOptions||'{}');
 const zone=options.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
 const key=value=>{const p=dayFormat.formatToParts(new Date(value));return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');};
 const date=key=>new Date(key+'T12:00:00Z');
 const dateLabel=k=>date(k).toLocaleDateString(undefined,{timeZone:'UTC',weekday:'long',year:'numeric',month:'long',day:'numeric'});
 const time=value=>new Date(value).toLocaleTimeString(undefined,{timeZone:zone,hour:'numeric',minute:'2-digit'});
 const upcoming=slots.filter(s=>Date.parse(s.start)>Date.now()).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(label,fn,cls)=>{const n=el('button',label,cls);n.type='button';n.addEventListener('click',fn);return n;};
 const bookingLink=s=>{
  if(s.bookingUrl){const link=el('a','Book session ↗','df-booking-link');link.href=s.bookingUrl;link.target='_blank';link.rel='noopener noreferrer';return link;}
  const form=el('form',undefined,'df-booking-form'),status=el('p');status.setAttribute('role','status');
  const field=(labelText,name,type,max)=>{const label=el('label',labelText),input=el(type==='textarea'?'textarea':'input');input.name=name;if(type!=='textarea')input.type=type;input.maxLength=max;input.required=name!=='notes';if(name!=='notes')input.autocomplete=name;label.append(input);form.append(label);return input;};
  const name=field('Name','name','text',200),email=field('Email','email','email',254),notes=field('Notes','notes','textarea',3000);
  const submit=el('button','Book appointment');submit.type='submit';form.append(submit,status);let pending;
  form.addEventListener('submit',async event=>{event.preventDefault();if(submit.disabled)return;submit.disabled=true;
   const values={slotId:s.id,name:name.value.trim(),email:email.value,notes:notes.value};
   if(pending&&JSON.stringify(pending.values)!==JSON.stringify(values)){status.textContent='Retry with the original details to check your reservation before making changes.';submit.disabled=false;return;}
   if(!pending)pending={id:crypto.randomUUID(),values};
    try{status.textContent='Booking appointment…';const result=await reserve({...values,id:pending.id},widget);status.textContent=result.preview?'Preview only. No appointment was reserved.':'Appointment confirmed.';
    if(result.preview){submit.disabled=false;return;}
    const link=el('a','Add to calendar','df-booking-link');link.download='appointment.ics';link.href='data:text/calendar;charset=utf-8,'+encodeURIComponent(result.calendar);form.append(link);name.disabled=email.disabled=notes.disabled=true;submit.remove();
    if(!result.notificationSent){const retry=button('Retry business notification',async()=>{retry.disabled=true;try{const next=await reserve({...pending.values,id:pending.id},widget);status.textContent=next.notificationSent?'Appointment confirmed. Business notified.':'Appointment confirmed. Business notification is delayed.';if(next.notificationSent)retry.remove();}catch(error){status.textContent=error.message;}finally{retry.disabled=false;}});form.append(retry);status.textContent='Appointment confirmed. Business notification is delayed.';}
   }catch(error){status.textContent=error.message;if(error.conflict)pending=undefined;submit.disabled=false;}
  });return form;
 };
 const range=s=>{const n=el('time',time(s.start)+' – '+time(s.end));n.dateTime=s.start;return n;};
 const details=s=>{const body=el('div',undefined,'df-booking-details');body.append(el('p',dateLabel(key(s.start))+(key(s.start)!==key(s.end)?' – '+dateLabel(key(s.end)):'')),range(s),bookingLink(s));return body;};
 content.replaceChildren();
 if(widget.dataset.commerce==='schedule'){
  const list=el('div',undefined,'df-agenda');let last='';
  upcoming.forEach(s=>{const day=key(s.start);if(day!==last){list.append(el('h3',dateLabel(day),'df-agenda-date'));last=day;}
   const row=el('details',undefined,'df-agenda-entry');row.open=options.expanded===true;
   const summary=el('summary');summary.append(range(s),el('span',s.title));row.append(summary,details(s));list.append(row);
  });
  if(!upcoming.length)list.append(el('p','No upcoming sessions.'));
  content.append(el('p','Times shown in '+zone.replaceAll('_',' '),'df-booking-zone'),list);return;
 }
 const today=key(Date.now());let state=bookingStates.get(widget);
 if(!state){state={month:today.slice(0,7),selected:today};bookingStates.set(widget,state);}
 const first=date(state.month+'-01'),year=first.getUTCFullYear(),month=first.getUTCMonth();
 const count=new Date(Date.UTC(year,month+1,0)).getUTCDate();
 const forDay=k=>upcoming.filter(s=>key(s.start)<=k&&key(new Date(Date.parse(s.end)-1))>=k);
 const refresh=focus=>{renderBookings(widget,slots,reserve);if(focus)widget.querySelector(focus)?.focus();};
 const select=(k,focus=true)=>{state.selected=k;state.month=k.slice(0,7);refresh(focus?'[data-date="'+k+'"]':null);};
 const navigate=delta=>{const d=new Date(Date.UTC(year,month+delta,1,12));state.month=d.toISOString().slice(0,7);state.selected=state.month+'-01';refresh('[data-month-step="'+delta+'"]');};
 const toolbar=el('div',undefined,'df-calendar-toolbar');
 const prev=button('‹',()=>navigate(-1));prev.setAttribute('aria-label','Previous month');prev.dataset.monthStep='-1';
 const next=button('›',()=>navigate(1));next.setAttribute('aria-label','Next month');next.dataset.monthStep='1';
 const title=el('h3',first.toLocaleDateString(undefined,{timeZone:'UTC',month:'long',year:'numeric'}));title.setAttribute('aria-live','polite');
 const todayButton=button('Today',()=>{select(today,false);widget.querySelector('[data-today]')?.focus();});todayButton.dataset.today='';
 toolbar.append(prev,title,next,todayButton);
 const layout=el('div',undefined,'df-calendar-layout');if(options.detailsPosition==='below')layout.dataset.details='below';
 const monthPanel=el('div',undefined,'df-calendar-month');
 const table=el('table',undefined,'df-calendar-grid');table.setAttribute('aria-label',title.textContent);
 const head=el('thead'),headRow=el('tr'),weekStart=options.weekStartsOn===1?1:0;
 for(let i=0;i<7;i++){const d=new Date(Date.UTC(2026,10,1+((i+weekStart)%7),12));const th=el('th');th.scope='col';const abbr=el('abbr',d.toLocaleDateString(undefined,{timeZone:'UTC',weekday:'short'}));abbr.title=d.toLocaleDateString(undefined,{timeZone:'UTC',weekday:'long'});th.append(abbr);headRow.append(th);}
 head.append(headRow);table.append(head);
 const body=el('tbody'),offset=(first.getUTCDay()-weekStart+7)%7;
 const total=Math.ceil((offset+count)/7)*7;
 let row;
 for(let i=0;i<total;i++){
  if(i%7===0){row=el('tr');body.append(row);}
  const cell=el('td'),day=i-offset+1;
  if(day>=1&&day<=count){const k=state.month+'-'+String(day).padStart(2,'0'),events=forDay(k);
   const b=button('',()=>select(k),'df-calendar-day');b.dataset.date=k;b.tabIndex=state.selected===k?0:-1;
   b.setAttribute('aria-label',dateLabel(k)+', '+events.length+(events.length===1?' event':' events'));b.setAttribute('aria-pressed',String(state.selected===k));
   if(k===today)b.setAttribute('aria-current','date');
   b.append(el('span',String(day),'df-calendar-number'));
   if(events.length){const marker=el('span',String(events.length),'df-calendar-marker');marker.setAttribute('aria-hidden','true');b.append(marker);}
   b.addEventListener('keydown',event=>{let jump={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(event.key==='Home')jump=-((date(k).getUTCDay()-weekStart+7)%7);if(event.key==='End')jump=6-((date(k).getUTCDay()-weekStart+7)%7);if(jump===undefined)return;event.preventDefault();const d=date(k);d.setUTCDate(d.getUTCDate()+jump);select(d.toISOString().slice(0,10));});
   cell.append(b);
  }
  row.append(cell);
 }
 table.append(body);monthPanel.append(toolbar,table,el('p','Marked dates have events. Select a date to see sessions.','df-calendar-hint'));
 const panel=el('section',undefined,'df-calendar-events');panel.setAttribute('aria-label','Selected date events');
 const heading=el('h3',dateLabel(state.selected));heading.setAttribute('aria-live','polite');panel.append(heading);
 const events=forDay(state.selected);panel.append(el('p',events.length+(events.length===1?' session':' sessions'),'df-calendar-count'));
 if(!events.length)panel.append(el('p','No sessions on this date. Select a marked date or browse another month.'));
 events.forEach(s=>{const card=el('div',undefined,'df-calendar-event');card.append(el('h4',s.title),details(s));panel.append(card);});
 layout.append(monthPanel,panel);content.append(layout,el('p','Times shown in '+zone.replaceAll('_',' '),'df-booking-zone'));
}
`;

export const BOOKING_CSS = String.raw`
.df-commerce[data-commerce="calendar"],.df-commerce[data-commerce="schedule"]{width:100%;min-width:0;box-sizing:border-box;container-type:inline-size;grid-column:1/-1}
.df-commerce[data-commerce="calendar"]{min-height:520px}
.df-commerce .df-booking-zone,.df-commerce .df-calendar-hint{font-size:11pt;line-height:1.5;margin:12px 0;color:#4d6355}
.df-commerce .df-booking-link{display:inline-block;color:#294c38;font-weight:600;padding:8px 0;overflow-wrap:anywhere}
.df-booking-form{display:grid;gap:8px;margin-top:12px;min-width:0}
.df-booking-form label{display:grid;gap:4px}
.df-booking-form input,.df-booking-form textarea{box-sizing:border-box;width:100%;min-width:0;font:inherit;padding:8px;border:1px solid #b5c7b8;border-radius:4px}
.df-booking-form button{justify-self:start;max-width:100%;white-space:normal}
.df-booking-form [role="status"]{overflow-wrap:anywhere}
.df-agenda-date{font-size:11pt;margin:18px 0 8px}
.df-agenda-entry{border:1px solid #b5c7b8;border-radius:8px;background:#fff;margin:6px 0;overflow:hidden}
.df-agenda-entry summary{cursor:pointer;display:flex;align-items:center;gap:12px;padding:10px 12px;list-style:none;font-size:11pt}
.df-agenda-entry summary::-webkit-details-marker{display:none}
.df-agenda-entry summary::after{content:'+';margin-left:auto;font-size:18px;flex-shrink:0}
.df-agenda-entry[open] summary::after{content:'−'}
.df-agenda-entry summary time{flex-shrink:0;font-variant-numeric:tabular-nums}
.df-agenda-entry summary span{overflow-wrap:anywhere}
.df-booking-details{padding:0 12px 12px;font-size:11pt}
.df-commerce .df-booking-details p{margin:4px 0;line-height:1.5}
.df-booking-details time{display:block}
.df-calendar-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start}
.df-calendar-month,.df-calendar-events{min-width:0}
.df-calendar-toolbar{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:4px;margin:16px 0 12px}
.df-calendar-toolbar h3{font-size:clamp(11pt,3cqi,20px);text-align:center;margin:0;overflow-wrap:anywhere}
.df-commerce .df-calendar-toolbar button{margin:0;padding:8px;min-width:36px;min-height:40px;font-size:11pt}
.df-calendar-grid{border-collapse:separate;border-spacing:3px;width:100%;table-layout:fixed;font-size:11pt}
.df-calendar-grid th{font-size:11pt;padding:8px 0;font-weight:600;text-align:center}
.df-calendar-grid abbr{text-decoration:none}
.df-calendar-grid td{padding:0;vertical-align:top}
.df-commerce .df-calendar-day{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;min-height:60px;margin:0;padding:5px 0;border:1px solid #c2d0c4;border-radius:8px;background:#fff;color:#243c30;font-size:11pt}
.df-commerce .df-calendar-day[aria-current="date"]{border:2px solid #294c38;font-weight:700}
.df-commerce .df-calendar-day[aria-pressed="true"]{background:#294c38;color:#fff}
.df-calendar-marker{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:#dce9c8;color:#213a2a;min-width:20px;padding:0 4px;font-size:11pt;line-height:20px}
.df-calendar-events{max-height:520px;overflow:auto;overscroll-behavior:contain;border:1px solid #b5c7b8;background:#fff;border-radius:10px;padding:16px}
.df-calendar-events h3{font-size:16px;margin:0;overflow-wrap:anywhere}
.df-commerce .df-calendar-count{margin:8px 0;font-size:11pt}
.df-calendar-event{border-top:1px solid #d3dfd4;padding-top:12px;margin-top:12px;overflow-wrap:anywhere}
.df-calendar-event h4{font-size:11pt;margin:0 0 8px}
.df-calendar-event .df-booking-details{padding:0}
@container (min-width:700px){.df-calendar-layout:not([data-details="below"]){grid-template-columns:minmax(0,1.6fr) minmax(240px,1fr)}.df-commerce .df-calendar-day{min-height:68px}}
@container (max-width:360px){.df-calendar-toolbar{grid-template-columns:auto minmax(0,1fr) auto}.df-calendar-toolbar [data-today]{grid-column:1/-1}.df-calendar-grid{border-spacing:2px}.df-commerce .df-calendar-day{min-height:54px}.df-agenda-entry summary{flex-wrap:wrap;gap:4px 10px}.df-agenda-entry summary span{flex:1 1 100%;order:1}.df-calendar-events{padding:12px}}
`;
