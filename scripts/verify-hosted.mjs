import { writeFile } from 'node:fs/promises';
const endpoint = process.env.MCP_ENDPOINT ?? 'https://runescape-wiki-mcp.fly.dev/mcp';
const checks = [];
let requestId = 0;
async function rpc(method, params = {}) {
  const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'}, body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}), signal:AbortSignal.timeout(45000)});
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0,200)}`);
  const data = response.headers.get('content-type')?.includes('text/event-stream') ? JSON.parse(body.split('\n').find(line=>line.startsWith('data:')).slice(5)) : JSON.parse(body);
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}
async function call(name, args) {
  const result = await rpc('tools/call', {name,arguments:args});
  const text = result.content?.filter(p=>p.type==='text').map(p=>p.text).join('\n') ?? '';
  const summary = {tool:name,args,ok:!result.isError,textPreview:text.slice(0,250),structuredKeys:Object.keys(result.structuredContent??{})};
  checks.push(summary); console.log(JSON.stringify(summary));
  if(result.isError) throw new Error(`${name}: ${text.slice(0,300)}`);
  return result;
}
try {
 const listed = await rpc('tools/list');
 await writeFile('/tmp/rs-production-tools.json', JSON.stringify({serverName:'RuneScape Wiki',tools:listed.tools},null,2));
 if (listed.tools.length !== 13 || !listed.tools.some(t=>t.name==='search_wiki')) throw new Error('Expected 13 tools including search_wiki');
 console.log('Production exposes all 13 tools.');
 const search = await call('search_wiki',{query:'Abyssal whip',limit:3});
 const hits = search.structuredContent?.results;
 if(!hits?.length) throw new Error('Wiki search returned no hits');
 const page = await call('get_wiki_page_content',{page:hits[0].title});
 if (!page.structuredContent?.title || page.structuredContent?.contentStatus !== 'link_only' || page.structuredContent?.text !== null) throw new Error('Expected unreviewed wiki content to remain link-only');
 if (hits.some(hit=>hit.snippet !== '' || hit.contentStatus !== 'link_only')) throw new Error('Search must not reproduce unreviewed snippets');
 const lookup = await call('lookup_item',{query:'Abyssal whip',limit:3});
 const itemId = lookup.structuredContent?.matches?.[0]?.id;
 if(!Number.isInteger(itemId) || itemId < 0) throw new Error('Item lookup did not resolve an ID');
 for (const [name,args] of [
  ['get_item_price',{itemId}], ['get_item_graph',{itemId}], ['summarize_price_history',{itemId,days:7}],
  ['compare_items',{itemIds:[itemId]}], ['estimate_flip',{itemId,buyPrice:1000,sellPrice:1200,quantity:2}],
  ['get_all_categories',{}], ['get_category_info',{category:24}], ['browse_items',{category:24,alpha:'a',page:1}],
  ['get_ge_info',{}], ['get_player_stats',{username:'Zezima',gameMode:'normal'}],
  ['get_player_stats',{username:'Gecu',gameMode:'ironman'}], ['get_player_stats',{username:'J oris',gameMode:'hardcore'}]
 ]) await call(name,args);
 const categories = checks.find(check=>check.tool==='get_all_categories');
 if (!categories?.structuredKeys.includes('categories')) throw new Error('Missing structured categories');
 const card=await fetch(endpoint+'/server-card').then(r=>r.json());
 console.log('Server card:',card.name,card.version);
} catch(e) { console.error(e); process.exitCode=1; }
await writeFile('/tmp/rs-production-verification.json',JSON.stringify({endpoint,checkedAt:new Date().toISOString(),checks},null,2));
