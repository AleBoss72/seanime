/** WeebCentral manga provider for Seanime. */
class Provider {
  constructor(){ this.baseUrl='https://weebcentral.com'; this.fetchLimit=32; }
  getSettings(){ return {supportsMultiScanlator:false,supportsMultiLanguage:false}; }

  async search(opts){
    const q=this._norm((opts&&opts.query)||'');
    const u=this.baseUrl+'/search/data?text='+encodeURIComponent(q)+'&limit='+this.fetchLimit+'&offset=0&display_mode='+encodeURIComponent('Full Display');
    const h=await this._get(u), out=[], seen=new Set();
    for(const a of this._anchors(h).filter(x=>/\/series\/[A-Za-z0-9_-]+/i.test(x.href))){
      const id=this._id(a.href,'series'); if(!id||seen.has(id)) continue;
      const title=this._title(a.html); if(!title) continue;
      let image=this._attrTag(a.html,'source','srcset');
      if(image) image=image.split(',')[0].trim().split(/\s+/)[0].replace(/small/g,'normal'); else image=this._attrTag(a.html,'img','src');
      seen.add(id); out.push({id:id,title:title,synonyms:[],image:image?this._abs(this._dec(image)):undefined});
    }
    return out;
  }

  async findChapters(mangaId){
    if(!mangaId) return [];
    const h=await this._get(this.baseUrl+'/series/'+encodeURIComponent(mangaId)+'/full-chapter-list');
    const out=[], seen=new Set();
    for(const a of this._anchors(h).filter(x=>/\/chapters\/[A-Za-z0-9_-]+/i.test(x.href))){
      const id=this._id(a.href,'chapters'); if(!id||seen.has(id)) continue; seen.add(id);
      let name=this._txt(a.html,[/<span[^>]*class=[\"'][^\"']*\bflex\b[^\"']*[\"'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i,/<span[^>]*>([\s\S]*?)<\/span>/i]);
      if(!name) name=this._strip(a.html); name=this._dec(name).replace(/\s+/g,' ').trim();
      const num=this._num(name,out.length+1);
      const dt=this._attrTag(a.html,'time','datetime')||undefined;
      const official=/<img[^>]+src=[\"'][^\"']*official[^\"']*[\"']/i.test(a.html);
      out.push({id:id,url:this._abs(a.href),title:name||('Chapter '+num),chapter:String(num),index:0,scanlator:official?'Official':undefined,language:'en',updatedAt:dt});
    }
    out.sort((a,b)=>{const x=parseFloat(a.chapter),y=parseFloat(b.chapter); if(Number.isFinite(x)&&Number.isFinite(y)&&x!==y)return x-y; return a.title.localeCompare(b.title,undefined,{numeric:true});});
    out.forEach((c,i)=>c.index=i); return out;
  }

  async findChapterPages(chapterId){
    if(!chapterId) return [];
    const chapterUrl=this.baseUrl+'/chapters/'+encodeURIComponent(chapterId);
    const h=await this._get(chapterUrl+'/images?is_prev=False&reading_style=long_strip');
    let s=h, m=h.match(/<section[^>]*x-data=[\"'][^\"']*scroll[^\"']*[\"'][^>]*>([\s\S]*?)<\/section>/i); if(m)s=m[1];
    const out=[],seen=new Set(),re=/<img\b[^>]*>/gi; let z;
    while((z=re.exec(s))!==null){ const t=z[0], raw=this._attr(t,'src')||this._attr(t,'data-src')||this._attr(t,'data-lazy-src'); if(!raw)continue;
      const u=this._abs(this._dec(raw.trim())); if(!/^https?:\/\//i.test(u)||seen.has(u))continue; seen.add(u);
      out.push({url:u,index:out.length,headers:{Referer:chapterUrl,Accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'}});
    }
    if(out.length===0){ const sr=/\bsrcset=[\"']([^\"']+)[\"']/gi; while((z=sr.exec(s))!==null){
      const c=z[1].split(',').map(x=>x.trim().split(/\s+/)[0]).filter(Boolean), raw=c[c.length-1]; if(!raw)continue;
      const u=this._abs(this._dec(raw)); if(!/^https?:\/\//i.test(u)||seen.has(u))continue; seen.add(u);
      out.push({url:u,index:out.length,headers:{Referer:chapterUrl,Accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'}});
    }} return out;
  }

  async _get(url){ const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}}); if(!r.ok)throw new Error('WeebCentral HTTP '+r.status+' '+url); return await r.text(); }
  _anchors(h){const o=[],r=/<a\b([^>]*)href=[\"']([^\"']+)[\"']([^>]*)>([\s\S]*?)<\/a>/gi;let m;while((m=r.exec(h))!==null)o.push({href:this._dec(m[2]),html:m[4]});return o;}
  _title(h){const d=[],r=/<div\b([^>]*)>([\s\S]*?)<\/div>/gi;let m;while((m=r.exec(h))!==null){const t=this._dec(this._strip(m[2])).replace(/\s+/g,' ').trim();if(t)d.push({c:/\bclass\s*=/i.test(m[1]||''),t:t});}const n=d.filter(x=>!x.c);return n.length?n[n.length-1].t:(d.length?d[d.length-1].t:this._dec(this._strip(h)).replace(/\s+/g,' ').trim());}
  _id(u,s){const m=this._abs(u).match(new RegExp('/'+s+'/([^/?#]+)','i'));return m?decodeURIComponent(m[1]):'';}
  _num(n,f){for(const r of [/(?:chapter|ch\.?)\s*#?\s*(\d+(?:\.\d+)?)/i,/#\s*(\d+(?:\.\d+)?)/,/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/]){const m=n.match(r);if(m)return m[1];}return String(f);}
  _txt(h,rs){for(const r of rs){const m=h.match(r);if(m&&m[1])return this._strip(m[1]);}return '';}
  _attrTag(h,t,a){const m=h.match(new RegExp('<'+t+'\\b[^>]*>','i'));return m?this._attr(m[0],a):'';}
  _attr(t,n){const e=n.replace(/[.*+?^$()|[\]\\]/g,'\\$&'),m=t.match(new RegExp('\\b'+e+'\\s*=\\s*[\"\']([^\"\']*)[\"\']','i'));return m?m[1]:'';}
  _strip(h){return String(h||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ');}
  _dec(v){return String(v||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'\"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#x2F;/gi,'/').replace(/&#47;/gi,'/').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));}
  _abs(u){if(!u)return '';if(/^https?:\/\//i.test(u))return u;if(u.startsWith('//'))return 'https:'+u;return this.baseUrl+(u.startsWith('/')?'':'/')+u;}
  _norm(q){return String(q).replace(/[!#:(),-]/g,' ').replace(/\s+/g,' ').trim();}
}
