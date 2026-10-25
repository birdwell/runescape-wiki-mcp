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
async function call(name, args, expectedError = false) {
  const result = await rpc('tools/call', {name,arguments:args});
  const text = result.content?.filter(p=>p.type==='text').map(p=>p.text).join('\n') ?? '';
  const summary = {tool:name,args,expectedError,ok:expectedError ? result.isError === true : !result.isError,textPreview:text.slice(0,250),structuredKeys:Object.keys(result.structuredContent??{})};
  checks.push(summary); console.log(JSON.stringify(summary));
  if(!summary.ok) throw new Error(`${name}: ${text.slice(0,300)}`);
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
 let graphResult, geInfoResult;
 for (const [name,args] of [
  ['get_item_price',{itemId}], ['get_item_graph',{itemId}], ['summarize_price_history',{itemId,days:7}],
  ['compare_items',{itemIds:[itemId]}], ['estimate_flip',{itemId,buyPrice:1000,sellPrice:1200,quantity:2}],
  ['get_all_categories',{}], ['get_category_info',{category:24}], ['browse_items',{category:24,alpha:'a',page:1}],
  ['get_ge_info',{}], ['get_player_stats',{username:'Zezima',gameMode:'normal'}],
  ['get_player_stats',{username:'Gecu',gameMode:'ironman'}], ['get_player_stats',{username:'J oris',gameMode:'hardcore'}]
 ]) {
  const result = await call(name,args);
  if(name === 'get_item_graph') graphResult=result;
  if(name === 'get_ge_info') geInfoResult=result;
 }
 const secondLookup=await call('lookup_item',{query:'Dragon bones',limit:1});
 const secondId=secondLookup.structuredContent?.matches?.[0]?.id;
 if(!Number.isInteger(secondId)||secondId<0) throw new Error('Second metadata ID not resolved');
 const metadataBatch=await call('get_item_price',{itemIds:[itemId,secondId]});
 if(metadataBatch.structuredContent.succeeded!==2||metadataBatch.structuredContent.failed!==0||
    metadataBatch.structuredContent.results.some((row,i)=>row.query!==[itemId,secondId][i]||row.data.item.id!==row.query||!row.data.item.description||!row.data.item.type)) throw new Error('Catalogue metadata batch failed');
 const secondWikiSearch=await call('search_wiki',{query:'Grand Exchange',limit:1});
 const secondWikiTitle=secondWikiSearch.structuredContent?.results?.[0]?.title;
 if(!secondWikiTitle) throw new Error('Second wiki title not resolved');
 const pages=[hits[0].title,secondWikiTitle];
 const wikiBatch=await call('get_wiki_page_content',{pages});
 if(wikiBatch.structuredContent.succeeded!==2||wikiBatch.structuredContent.failed!==0||
    wikiBatch.structuredContent.results.some((row,i)=>row.query!==pages[i]||row.data.contentStatus!=='link_only'||row.data.text!==null)) throw new Error('Guarded wiki batch failed');
 const info=geInfoResult.structuredContent;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(info.lastConfigUpdateDate)||!Number.isInteger(info.configurationAgeDays)||info.categoryCount!==44||info.priceFreshness!=='not_reported'||!Number.isFinite(Date.parse(info.fetchedAt))) throw new Error('GE configuration interpretation failed');
 const firstTimestamp=Object.keys(graphResult.structuredContent.daily).map(Number).sort((a,b)=>a-b)[0];
 const day=new Date(firstTimestamp).toISOString().slice(0,10);
 const filtered=await call('get_item_graph',{itemId,from:day,to:day});
 const keys=Object.keys(filtered.structuredContent.daily);
 if(!keys.length||keys.some(key=>new Date(Number(key)).toISOString().slice(0,10)!==day)) throw new Error('UTC date filter failed');
 const scenario=await call('estimate_flip',{itemId,buyPrice:1000,sellPrice:1200,quantity:2,buyLimitRemaining:1,fillTimeMinutes:30});
 const execution=scenario.structuredContent.executionScenario;
 if(execution.quantityWithinBuyLimit!==1||execution.quantityOverBuyLimit!==1||execution.netProfitWithinBuyLimit!==176||execution.assumedNetProfitPerHour!==704) throw new Error('Execution scenario math failed');
 const categories = checks.find(check=>check.tool==='get_all_categories');
 if (!categories?.structuredKeys.includes('categories')) throw new Error('Missing structured categories');
 const invalidTitle=await call('get_wiki_page_content',{page:'https://runescape.wiki/w/Abyssal_whip'},true);
 if(!invalidTitle.content?.some(part=>part.text?.includes('wiki title'))) throw new Error('Invalid URL title did not return actionable validation');
 const card=await fetch(endpoint+'/server-card').then(r=>r.json());
 console.log('Server card:',card.name,card.version);
} catch(e) { console.error(e); process.exitCode=1; }
await writeFile('/tmp/rs-production-verification.json',JSON.stringify({endpoint,checkedAt:new Date().toISOString(),checks},null,2));
