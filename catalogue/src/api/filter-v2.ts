// Draft contract revision 2026-11-09.1. Shared with Claude; no UI dependencies.
export class FilterInputError extends Error { status = 400; }
const categories = ['watch', 'jewellery', 'accessory'];
const typeScope: Record<string, string> = {watch:'watch',ring:'jewellery',necklace:'jewellery',earrings:'jewellery',bracelet:'jewellery',cufflinks:'jewellery',strap:'accessory',clasp:'accessory',bracelet_element:'accessory'};
const enums: Record<string, string[]> = {
  types:Object.keys(typeScope), genders:['men','women','unisex'],
  materials:['white_gold','yellow_gold','rose_gold','gold','platinum','silver','steel','titanium','ceramic','carbon','aluminium','rubber','leather'],
  stone_types:['diamond','lab_diamond','sapphire','emerald','ruby','rubellite','tsavorite','tanzanite','topaz','amethyst','pearl','mother_of_pearl','opal','turquoise','malachite','lapis','onyx','agate','crystal'],
  movements:['automatic','quartz','manual'],
};
const arrayKeys = ['types','brands','materials','stone_types','movements','sizes','genders'];
const allowed = [...arrayKeys,'category','collections','availability','stone_presence','case_diameters_mm','case_unspecified','price_min_uzs','price_max_uzs','q','incomplete'];
function fail(field: string): never { throw new FilterInputError(`Invalid ${field}.`); }
function object(v: unknown, field: string): Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(field);
  return v as Record<string, any>;
}
function text(v: unknown, field: string, max = 120): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f]/u.test(v)) fail(field);
  return v.trim();
}
function choice(v: unknown, values: string[], field: string): string {
  if (typeof v !== 'string' || !values.includes(v)) fail(field);
  return v;
}
export function normaliseFilterRequest(input: unknown) {
  const b = object(input, 'request');
  for (const k of Object.keys(b)) if (!['action','filter_version','token','filters','sort','limit','offset'].includes(k)) fail(k);
  if (b.filter_version !== 2) fail('filter_version');
  choice(b.action, ['list','facets'], 'action');
  const raw = object(b.filters === undefined ? {} : b.filters, 'filters');
  for (const k of Object.keys(raw)) if (!allowed.includes(k)) fail(`filters.${k}`);
  const f: Record<string, any> = {};
  for (const k of arrayKeys) {
    const arr = raw[k] === undefined ? [] : raw[k];
    if (!Array.isArray(arr) || arr.length > 100) fail(k);
    f[k] = [...new Set(arr.map(v => {
      const s = text(v, k);
      if (enums[k] && !enums[k].includes(s)) fail(k);
      if (k === 'sizes' && !/^sz_[a-f0-9]{32}$/.test(s)) fail(k);
      return s;
    }))].sort();
  }
  f.category = raw.category == null ? null : choice(raw.category, categories, 'category');
  f.availability = choice(raw.availability === undefined ? 'all' : raw.availability, ['all','boutique','transit','out'], 'availability');
  f.stone_presence = raw.stone_presence == null ? null : choice(raw.stone_presence,['with_stones','without_stones','unspecified'],'stone_presence');
  if (f.stone_types.length && f.stone_presence && f.stone_presence !== 'with_stones') fail('stone_presence');
  const col = raw.collections === undefined ? [] : raw.collections;
  if (!Array.isArray(col) || col.length > 100) fail('collections');
  f.collections = [...new Map(col.map(v => {
    const c = object(v,'collections');
    if (Object.keys(c).some(k => !['brand','collection'].includes(k))) fail('collections');
    const pair = {brand:text(c.brand,'collection.brand'),collection:text(c.collection,'collection.collection')};
    return [JSON.stringify(pair),pair];
  })).values()].sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const cases = raw.case_diameters_mm === undefined ? [] : raw.case_diameters_mm;
  if (!Array.isArray(cases) || cases.length > 100 || cases.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 10 || x > 70 || Math.abs(x*1000-Math.round(x*1000)) > 1e-8)) fail('case_diameters_mm');
  f.case_diameters_mm = [...new Set(cases)].sort((a,b)=>a-b);
  for (const k of ['case_unspecified','incomplete']) {
    if (raw[k] !== undefined && typeof raw[k] !== 'boolean') fail(k);
    f[k] = raw[k] ?? false;
  }
  for (const k of ['price_min_uzs','price_max_uzs']) {
    const n = raw[k] ?? null;
    if (n !== null && (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)) fail(k);
    f[k] = n;
  }
  if (f.price_min_uzs !== null && f.price_max_uzs !== null && f.price_min_uzs > f.price_max_uzs) fail('price range');
  if (raw.q !== undefined && typeof raw.q !== 'string') fail('q');
  f.q = raw.q?.trim() ?? '';
  if (f.q.length > 200 || /[\u0000-\u001f]/u.test(f.q)) fail('q');
  const adjustments: {field:string;reason:string;removed:unknown}[] = [];
  const remove = (key:string, values:unknown, replacement:unknown, reason:string) => {
    adjustments.push({field:key,reason,removed:values}); f[key]=replacement;
  };
  if (f.category) {
    const valid = f.types.filter((v:string)=>typeScope[v]===f.category);
    if (valid.length!==f.types.length) remove('types',f.types.filter((v:string)=>!valid.includes(v)),valid,'incompatible_category');
  }
  if ((f.category && f.category!=='watch') || (f.types.length && !f.types.includes('watch'))) {
    for (const k of ['movements','case_diameters_mm']) if (f[k].length) remove(k,f[k],[],'not_watches');
    if (f.case_unspecified) remove('case_unspecified',true,false,'not_watches');
  }
  if (f.sizes.length && ((f.category && f.category!=='jewellery') || (f.types.length && !f.types.some((t:string)=>['ring','necklace','bracelet'].includes(t))))) {
    remove('sizes',f.sizes,[],'incompatible_type');
  }
  const compatibleCollections = f.collections.filter((c:any)=>!f.brands.length || f.brands.includes(c.brand));
  if (compatibleCollections.length!==f.collections.length) remove('collections',f.collections.filter((c:any)=>!compatibleCollections.includes(c)),compatibleCollections,'excluded_brand');
  // Size keys are opaque. Server resolves their product type; never parse them here.
  const sort = choice(b.sort === undefined ? 'newest' : b.sort,['newest','brand','price_asc','price_desc','reference','completeness'],'sort');
  function integer(k:string, fallback:number, min:number,max:number) {
    const n = b[k] === undefined ? fallback : b[k];
    if (typeof n!=='number' || !Number.isSafeInteger(n) || n<min || n>max) fail(k);
    return n;
  }
  return {action:b.action,filter_version:2,filters:f,adjustments,sort,limit:integer('limit',60,1,200),offset:integer('offset',0,0,100000)};
}
