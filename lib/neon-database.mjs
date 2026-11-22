import { neon } from '@neondatabase/serverless';

// A deliberately small server-only query adapter keeps the existing permission
// checks and response contracts shared with the Supabase implementation.
const tables = new Set(['profiles','projects','comments','bookmarks','notifications','reports','uploads']);
const ident = value => { if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw Error('Invalid SQL identifier'); return `"${value}"`; };
export function createNeonDatabase(connectionString, executor) {
  const sql = executor || neon(connectionString);
  return { sql, health: () => sql.query('SELECT 1'), from(table) {
    if (!tables.has(table)) throw Error('Unknown table');
    return new Query(sql,table);
  }};
}
class Query {
  constructor(sql,table) {Object.assign(this,{sql,table,operation:'select',columns:'*',filters:[],params:[],sorting:[],max:null,cardinality:null});}
  bind(v) {this.params.push(v);return `$${this.params.length}`;}
  select(columns='*',options={}) {this.columns=columns;this.options=options;this.returning=true;return this;}
  eq(k,v) {this.filters.push(`${ident(k)} = ${this.bind(v)}`);return this;}
  gte(k,v) {this.filters.push(`${ident(k)} >= ${this.bind(v)}`);return this;}
  is(k,v) {if(v!==null)throw Error('Unsupported filter');this.filters.push(`${ident(k)} IS NULL`);return this;}
  in(k,values) {this.filters.push(values.length?`${ident(k)} IN (${values.map(v=>this.bind(v)).join(',')})`:'FALSE');return this;}
  or(expression) {const parts=expression.split(',').map(part=>{const [k,op,...rest]=part.split('.');if(op!=='eq')throw Error('Unsupported OR');return `${ident(k)} = ${this.bind(rest.join('.'))}`;});this.filters.push(`(${parts.join(' OR ')})`);return this;}
  order(k,{ascending=true}={}) {this.sorting.push(`${ident(k)} ${ascending?'ASC':'DESC'}`);return this;}
  limit(n) {if(!Number.isInteger(n)||n<0||n>1000)throw Error('Invalid limit');this.max=n;return this;}
  maybeSingle() {this.cardinality='maybe';return this;}
  single() {this.cardinality='one';return this;}
  insert(data) {this.operation='insert';this.data=data;return this;}
  update(data) {this.operation='update';this.data=data;return this;}
  delete() {this.operation='delete';return this;}
  upsert(data,{onConflict='id'}={}) {this.insert(data);this.conflict=onConflict.split(',').map(ident).join(',');return this;}
  then(resolve,reject) {return this.execute().then(resolve,reject);}
  async execute() {
    try {
      const name=`public.${ident(this.table)}`;
      const where=this.filters.length?` WHERE ${this.filters.join(' AND ')}`:'';
      let statement;
      if(this.operation==='select') {
        // Relations are fixed, never constructed from browser input.
        const relations={
          'id,body,created_at,user_id,profiles(display_name)':`t.*, (SELECT jsonb_build_object('display_name',p.display_name) FROM public.profiles p WHERE p.id=t.user_id) AS profiles`,
          'projects(*)':`(SELECT to_jsonb(p) FROM public.projects p WHERE p.id=t.project_id) AS projects`,
          '*,projects(title),profiles(display_name)':`t.*, (SELECT jsonb_build_object('title',p.title) FROM public.projects p WHERE p.id=t.project_id) AS projects, (SELECT jsonb_build_object('display_name',p.display_name) FROM public.profiles p WHERE p.id=t.reporter_id) AS profiles`,
        };
        const columns=this.options?.count?'count(*)::int AS count':relations[this.columns] || (this.columns==='*'?'*':this.columns.split(',').map(ident).join(','));
        statement=`SELECT ${columns} FROM ${name} t${where}`;
        if(!this.options?.count) statement+=(this.sorting.length?` ORDER BY ${this.sorting.join(',')}`:'')+(this.max!==null?` LIMIT ${this.max}`:'');
      } else if(this.operation==='delete') statement=`DELETE FROM ${name}${where} RETURNING *`;
      else {
        const entries=Object.entries(this.data);
        if(this.operation==='update') statement=`UPDATE ${name} SET ${entries.map(([k,v])=>`${ident(k)}=${this.bind(v)}`).join(',')}${where} RETURNING *`;
        else statement=`INSERT INTO ${name} (${entries.map(([k])=>ident(k)).join(',')}) VALUES (${entries.map(([,v])=>this.bind(v)).join(',')})${this.conflict?` ON CONFLICT (${this.conflict}) DO NOTHING`:''} RETURNING *`;
      }
      const rows=await this.sql.query(statement,this.params);
      if(this.options?.count) return {data:null,count:rows[0].count,error:null};
      if(this.cardinality && (rows.length>1 || this.cardinality==='one'&&!rows.length)) throw Error('Unexpected cardinality');
      return {data:this.cardinality?(rows[0]||null):rows,error:null};
    } catch(e) {return {data:null,error:{code:e.code||'DATABASE_ERROR'}};}
  }
}
