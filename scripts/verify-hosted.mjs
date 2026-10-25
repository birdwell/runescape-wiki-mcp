import { writeFile } from 'node:fs/promises';
const endpoint = process.env.MCP_ENDPOINT ?? 'https://runescape-wiki-mcp.fly.dev/mcp';
const checks = [];
let requestId = 0;
async function rpc(method, params = {}, modern = false) {
  const protocol = '2026-07-28';
  const headers = {'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
  if (modern) {
    headers['MCP-Protocol-Version'] = protocol; headers['Mcp-Method'] = method;
    if (params.name) headers['Mcp-Name'] = params.name;
    params = {...params, _meta:{'io.modelcontextprotocol/protocolVersion':protocol,'io.modelcontextprotocol/clientInfo':{name:'hosted-verification',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}};
  }
  const response = await fetch(endpoint, {method:'POST', headers, body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}), signal:AbortSignal.timeout(45000)});
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0,200)}`);
  const data = response.headers.get('content-type')?.includes('text/event-stream') ? JSON.parse(body.split('\n').find(line=>line.startsWith('data:')).slice(5)) : JSON.parse(body);
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}
async function call(name, args, expectedError = false, modern = false) {
  const result = await rpc('tools/call', {name,arguments:args}, modern);
  const text = result.content?.filter(p=>p.type==='text').map(p=>p.text).join('\n') ?? '';
  const summary = {tool:name,args,protocol:modern?'2026-07-28':'legacy',expectedError,ok:expectedError ? result.isError === true : !result.isError,textPreview:text.slice(0,250),structuredKeys:Object.keys(result.structuredContent??{})};
  checks.push(summary); console.log(JSON.stringify(summary));
  if(!summary.ok) throw new Error(`${name}: ${text.slice(0,300)}`);
  return result;
}
try {
 const listed = await rpc('tools/list');
 await writeFile('/tmp/rs-production-tools.json', JSON.stringify({serverName:'RuneScape Wiki',tools:listed.tools},null,2));
 if (listed.tools.length !== 14 || !listed.tools.some(t=>t.name==='search_wiki')) throw new Error('Expected 14 tools including search_wiki');
 console.log('Production exposes all 14 tools.');
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
 const canonicalResults = new Map();
 for (const [name,args] of [
  ['get_item_details',{itemId}], ['get_price_series',{itemId}], ['summarize_price_history',{itemId,days:7}],
  ['compare_item_prices',{itemIds:[itemId]}], ['estimate_flip',{itemId,buyPrice:1000,sellPrice:1200,quantity:2}],
  ['get_all_categories',{}], ['get_category_info',{category:24}], ['browse_items',{category:24,alpha:'a',page:1}],
  ['get_ge_info',{}], ['get_player_stats',{username:'Zezima',gameMode:'normal'}],
  ['get_player_stats',{username:'Gecu',gameMode:'ironman'}], ['get_player_stats',{username:'J oris',gameMode:'hardcore'}]
 ]) {
  const result = await call(name,args);
  canonicalResults.set(name,result);
  if(name === 'get_price_series') graphResult=result;
  if(name === 'get_ge_info') geInfoResult=result;
 }
 for (const [alias,canonical,args] of [
  ['get_item_price','get_item_details',{itemId}],
  ['get_item_graph','get_price_series',{itemId}],
  ['compare_items','compare_item_prices',{itemIds:[itemId]}]
 ]) {
  const result=await call(alias,args);
  if(JSON.stringify(Object.keys(result.structuredContent??{}).sort())!==JSON.stringify(Object.keys(canonicalResults.get(canonical).structuredContent??{}).sort())) throw new Error(`Legacy alias ${alias} changed result shape`);
 }
 const modernAlias=await call('get_item_price',{itemId},false,true);
 if(modernAlias.structuredContent?.item?.id!==itemId) throw new Error('Modern protocol legacy alias failed');
 const secondLookup=await call('lookup_item',{query:'Dragon bones',limit:1});
 const secondId=secondLookup.structuredContent?.matches?.[0]?.id;
 if(!Number.isInteger(secondId)||secondId<0) throw new Error('Second metadata ID not resolved');
 const metadataBatch=await call('get_item_details',{itemIds:[itemId,secondId]});
 if(metadataBatch.structuredContent.succeeded!==2||metadataBatch.structuredContent.failed!==0||
    metadataBatch.structuredContent.results.some((row,i)=>row.query!==[itemId,secondId][i]||row.data.item.id!==row.query||new URL(row.data.item.wikiUrl).searchParams.get('id')!==String(row.query)||!row.data.item.description||!row.data.item.type)) throw new Error('Catalogue metadata batch failed');
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
 const filtered=await call('get_price_series',{itemId,from:day,to:day});
 const keys=Object.keys(filtered.structuredContent.daily);
 if(!keys.length||keys.some(key=>new Date(Number(key)).toISOString().slice(0,10)!==day)) throw new Error('UTC date filter failed');
 const raw=await call('get_price_series',{itemId,source:'weirdgloop'});
 const samples=raw.structuredContent?.samples;
 if(raw.structuredContent?.source!=='weirdgloop'||raw.structuredContent.itemId!==itemId||!samples?.length||samples.some((point,i)=>!Number.isSafeInteger(point.timestamp)||!Number.isFinite(point.price)||(i>0&&point.timestamp<samples[i-1].timestamp))) throw new Error('Raw Weirdgloop observations failed');
 const rawDay=new Date(samples[0].timestamp).toISOString().slice(0,10);
 const rawFiltered=await call('get_price_series',{itemId,source:'weirdgloop',from:rawDay,to:rawDay});
 if(!rawFiltered.structuredContent.samples.length||rawFiltered.structuredContent.samples.some(point=>new Date(point.timestamp).toISOString().slice(0,10)!==rawDay)) throw new Error('Weirdgloop UTC filter failed');
 const namespaces=await call('search_wiki',{query:'prefix:Category:Weapons',limit:3});
 if(!namespaces.structuredContent.results.some(hit=>hit.title.startsWith('Category:'))||namespaces.structuredContent.results.some(hit=>hit.contentStatus!=='link_only'||hit.snippet!=='')) throw new Error('Wiki namespace references failed');
 const scenario=await call('estimate_flip',{itemId,buyPrice:1000,sellPrice:1200,quantity:2,buyLimitRemaining:1,fillTimeMinutes:30});
 const execution=scenario.structuredContent.executionScenario;
 if(execution.quantityWithinBuyLimit!==1||execution.quantityOverBuyLimit!==1||execution.netProfitWithinBuyLimit!==176||execution.assumedNetProfitPerHour!==704) throw new Error('Execution scenario math failed');
 const categories = checks.find(check=>check.tool==='get_all_categories');
 if (!categories?.structuredKeys.includes('categories')) throw new Error('Missing structured categories');
 const enriched=await call('get_item_details',{itemId,includeLiveData:true});
 const live=enriched.structuredContent.item.liveTrades;
 const facts=enriched.structuredContent.item.wikiFacts;
 if(!live||(!Number.isFinite(live.high)&&!Number.isFinite(live.low))||!Number.isFinite(Date.parse(live.fetchedAt))||!live.sourceUrl.startsWith('https://prices.runescape.wiki/rs/item/')||!facts||!Number.isInteger(facts.buyLimit)||!Number.isInteger(facts.highAlchemy)||!enriched.structuredContent.item.current) throw new Error('RS3 live enrichment failed');
 for(const field of ['highTime','lowTime']) if(live[field]!==null&&(!Number.isSafeInteger(live[field])||live[field]<1e9||live[field]>1e11)) throw new Error('Trade timestamps must use Unix seconds');
 const enrichedBatch=await call('get_item_details',{itemIds:[itemId,secondId],includeLiveData:true});
 if(enrichedBatch.structuredContent.succeeded!==2||enrichedBatch.structuredContent.results.some(row=>!row.data.item.liveTrades||!row.data.item.wikiFacts||new URL(row.data.item.liveTrades.sourceUrl).pathname!==`/rs/item/${row.query}`)) throw new Error('RS3 enriched batch failed');
 const monster=await call('get_wiki_entity_facts',{page:'Abyssal demon',kind:'monster',limit:3});
 if(!monster.structuredContent.records.some(row=>row.stats?.combatLevel>0&&row.stats?.lifePoints>0)||monster.structuredContent.attribution.license!==null) throw new Error('Structured monster facts failed');
 const quest=await call('get_wiki_entity_facts',{page:"Cook's Assistant",kind:'quest'});
 if(!quest.structuredContent.records.some(row=>row.isMembers===false&&row.difficulty==='Novice'&&/^\d{4}-\d{2}-\d{2}$/.test(row.releaseDate))) throw new Error('Structured quest facts failed');
 for (const duplicateArgs of [{itemIds:[itemId,itemId]},{names:['Abyssal whip','Abyssal whip']}]) {
  const invalid=await call('compare_item_prices',duplicateArgs,true);
  if(!invalid.content?.some(part=>part.text?.includes('unique entries'))) throw new Error('Comparison uniqueness contract failed');
 }
 const invalidTitle=await call('get_wiki_page_content',{page:'https://runescape.wiki/w/Abyssal_whip'},true);
 if(!invalidTitle.content?.some(part=>part.text?.includes('wiki title'))) throw new Error('Invalid URL title did not return actionable validation');
 const card=await fetch(endpoint+'/server-card').then(r=>r.json());
 console.log('Server card:',card.name,card.version);
} catch(e) { console.error(e); process.exitCode=1; }
await writeFile('/tmp/rs-production-verification.json',JSON.stringify({endpoint,checkedAt:new Date().toISOString(),checks},null,2));
