import { GqlRecord } from './GqlTypes';
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { ApolloClient, NormalizedCacheObject } from '@apollo/client/core';
import gql from 'graphql-tag';
import { TypePolicies } from '@apollo/client/core';
import { t } from 'src/qiksar/Translator/Translator';

import { fromJSON, toJSON } from 'flatted';
import EntityField from './EntityField';
import fieldType from './fieldType';
import EntitySchema from './EntitySchema';
import { GqlRecords } from './GqlTypes';
import ITableColumn from './ITableColumn';
import fetchMode from './fetchMode';
import JsonTools from './JsonTools';

export const defaultFetchMode: fetchMode = 'heavy';

/**
 * Provide GQL query building capabilities and automatic localisation and token expansion
 */
export default class Query {
  //#region properties

  private _offset: number;
  private _limit: number | undefined;
  private _sort_by: string;
  private _asc: boolean;
  private _schema: EntitySchema;
  private _where: string | undefined;
  private _fetch_mode: fetchMode;
  private _auto_fetch: boolean;
  private _auto_translate = true;

  private static _apollo: ApolloClient<NormalizedCacheObject>;

  /**
   * Global Apollo client used by all queries
   */
  public static set Apollo(client: ApolloClient<NormalizedCacheObject>) {
    Query._apollo = client;
  }

  /**
   * Global Apollo client used by all queries
   */
  public static get Apollo(): ApolloClient<NormalizedCacheObject> {
    if (!Query._apollo) throw `${typeof Query}: Apollo client not specified`;

    return Query._apollo;
  }

  //#endregion

  //#region static members

  // Static array of all views
  private static _views: Array<Query> = [];

  /**
   * Build type policies that inform the behviour of the cache
   */
  static get ApolloTypePolicies(): TypePolicies {
    const tp = {} as GqlRecord;

    this._views.map((v) => {
      tp[v.Schema.EntityName] = { keyFields: [v.Schema.Key] };
    });

    //console.log(JSON.stringify(tp));

    return tp as TypePolicies;
  }

  /**
   * Return the view for the specified entity
   *
   * @param entityName Name of that source entity
   * @returns The required view
   */
  static GetView(entityName: string): Query {
    const views = Query._views.filter(
      (v) => v.Schema.EntityName === entityName
    );

    if (views.length == 0)
      throw `!!!! FATAL ERROR: Schema for entity type ${entityName} has not been registered`;

    return views[0];
  }

  //#endregion

  //#region Getters/Setters

  get Schema(): EntitySchema {
    return this._schema;
  }
  get IsEnum(): boolean {
    return this.Schema.IsEnum;
  }

  set Limit(limit: number | undefined) {
    this._limit = limit;
  }
  get Limit(): number | undefined {
    return this._limit;
  }

  set Offset(offset: number) {
    this._offset = offset;
  }
  get Offset(): number {
    return this._offset;
  }

  set SortBy(sort_by: string) {
    this._sort_by = sort_by;
  }
  get SortBy(): string {
    return this._sort_by;
  }

  set Asc(asc: boolean) {
    this._asc = asc;
  }
  get Asc() {
    return this._asc;
  }

  get AutoFetch() {
    return this.IsEnum || this._auto_fetch;
  }

  set AutoTranslate(trn: boolean) {
    this._auto_translate = trn;
  }
  get AutoTranslate() {
    return this._auto_translate;
  }

  //#endregion

  //#region select fields by editable status or data type

  get EditableFields(): Record<string, EntityField> {
    const fields = {} as Record<string, EntityField>;

    this.Schema.Fields.filter((f) => {
      return f.IsRelation || (!f.IsKey && !f.IsAlias);
    }).map((f) => (fields[f.Name] = f));

    return fields;
  }

  FieldsOfType(t: fieldType): Array<EntityField> {
    return this.Schema.Fields.filter((f: EntityField) => {
      return f.Type === t;
    });
  }

  get TableColumns(): ITableColumn[] {
    const columns: ITableColumn[] = [];

    this.Schema.Fields
    .filter((f) => f.IsOnGrid && !f.IsRelation)
    .map((f) => {
      columns.push({
        name: f.Name,
        label: t(f.Label),
        field: f.Name,
        sortable: f.IsSortable,
        align: f.Type == 'number' ? 'right' : 'left',
      });
    });

    return columns;
  }

  //#endregion

  //#region constructor

  constructor(
    schema: EntitySchema,
    autoFetch = false,
    sort_by: string | undefined = undefined,
    asc = true,
    limit: number | undefined = undefined
  ) {
    this._schema = schema;
    this._sort_by = sort_by ?? schema.Key;
    this._asc = asc;
    this._limit = limit;
    this._offset = 0;
    this._where = undefined;
    this._fetch_mode = defaultFetchMode;
    this._auto_fetch = autoFetch;

    Query._views.push(this);
  }

  //#endregion

  //#region query builder

  /**
   * Build a GQL query
   *
   * @param where GQL where clause
   * @param fetch_mode Fetch mode, which can filter the columns returned, thus reducing the size of the returned data set
   * @param sortBy Optional custom sort clause
   * @param limit Limit number of records returned
   * @returns
   */
  private BuildQuery(
    where: string | undefined,
    fetch_mode: fetchMode = defaultFetchMode,
    sortBy: string | undefined = undefined,
    limit: number | undefined = undefined
  ) {
    const entityStack: string[] = [];

    limit = limit ?? this.Limit;

    const query =
      `query {
		${this.Schema.EntityName} 
		(` +
      (limit ? `limit: ${limit},` : '') +
      `
			${this.BuildOrderBy(sortBy ?? this.SortBy, this.Asc)},
			offset: ${this.Offset},
			${this.BuildWhere(where)}
		)  
		{
			${this.Schema.Columns(fetch_mode, entityStack)}
		}
	}`;

    console.log('*** GRAPHQL QUERY');
    console.log(query);

    const q = gql(query);

    const doc = {
      query: q,
    };

    return doc;
  }

  /**
   * Build a GQL where clause
   * @param where Optional where clause, permits dynamic query building where this clause may or may not be required
   * @returns where clause as a string
   */
  private BuildWhere(where: string | undefined): string {
    const where_statement = (where ?? '').trim();
    return where_statement.length > 0 ? `where: { ${where_statement} }, ` : '';
  }

  /**
   * Build the order_by clause
   *
   * @param column_name Name of a column on the entity
   * @param custom_sort Custom formatted sort clause
   * @param sort_ascending Sort in ascending order (default=true), or descending order when false
   * @returns order_by clause as a string
   */
  private BuildOrderBy(
    column_name: string | undefined,
    sort_ascending = true
  ): string {
    const sort_option = column_name
      ? `order_by: {${column_name}: ${sort_ascending ? 'asc' : 'desc'}}`
      : '';

    return sort_option;
  }

  //#endregion

  //#region Transformer

  /**
   * Transform an input record using a specified transformation. The transformation is simply a JSON object,
   * where the key specifies the target field name in the output record, and the value is a list of fields which are
   * concatenated to create the value for the field.
   *
   * @param row
   * @param transform
   * @returns
   */
  public Transform(row: GqlRecord, transform: GqlRecord): GqlRecord {
    const output = {} as GqlRecord;

    Object.keys(transform).map((k) => {
      let val = '';
      const fields = transform[k] as string;

      fields.split(' ').map((f) => (val += (row[f.trim()] as string) + ' '));

      output[k] = val.trim();
    });

    return output;
  }

  //#endregion

  //#region Row / Alias processing

  private SetRows(result: GqlRecord, store: any, translate: boolean) {
    // Get the data object which contains the rows of data
    const rows = JsonTools.ExtractFromPath<GqlRecords>(result, [
      'data',
      this.Schema.EntityName,
    ]);

    // Process the rows with translation and insertion of attributes to entites from related entities
    store.Rows = this.ProcessAllRows(rows, translate);

    // Update status
    store.SetBusy(false);
    store.SetLoaded(store.Rows.length > 0);

    //const first = store.Rows[0] as GqlRecord;
    //console.log('----------------------------------------------------')
    //console.log(JSON.stringify(first))
    //console.log('----------------------------------------------------')
  }

  // Process all rows to apply aliasing
  private ProcessAllRows(rows: GqlRecords, translate: boolean): GqlRecords {
    if (!rows) return [];

    const output: GqlRecords = [];
    rows.map((r) => output.push(this.ProcessRow(r, translate)));

    return output;
  }

  // process rows read from the database, includes flattened, translated (locale) and JSON formats
  private ProcessRow(row: GqlRecord, translate: boolean): GqlRecord {
    const output: GqlRecord = { ...row };

    // import flattened objects from json
    this.FieldsOfType('json').map((json_field) => {
      output[json_field.Name] = fromJSON(row[json_field.Name]);
    });

    // process flattened fields, where values are pulled up to the current object from
    // related objects
    this.FieldsOfType('alias').map((alias_field: EntityField) => {
      let alias_value = '';

      if (alias_field && alias_field.ObjectColumns) {
        alias_field.ObjectColumns.split(' ').map((a) => {
          const val = this.GetAliasValue(output, a);
          if (val) alias_value += val + ' ';
        });

        output[alias_field.Name] = alias_value.trim();
      }
    });

    // attempt to translate all text fields
    if (translate) {
      this.Schema.LocaleFields.map((f) => {
        if (output[f.Name]) {
          const val = output[f.Name] as string;
          if (val.length != 0) output[f.Name] = t(val, true);
        }
      });
    }
    return output;
  }

  // Process rows ready to be written to database
  // Note - the primary key field will be deliberately removed as this can never be updated
  private PrepareRowForSave(row: GqlRecord): GqlRecord {
    const output: GqlRecord = { ...row };

    // import flattened objects from json
    this.FieldsOfType('json').map((json_field) => {
      output[json_field.Name] = toJSON(row[json_field.Name]);
    });

    return output;
  }

  // Get the value of an alias, which is an attribute of a nested object, e.g. customer.address.zipcode
  private GetAliasValue(source: GqlRecord, alias: string): string | null {
    if (!alias || alias.length == 0) throw `Invalid alias: ${alias}`;

    const value = JsonTools.ExtractFromPath<string>(source, alias.split('.'));
    return value;
  }

  // Convert objects for use in GraphQL statements
  private Stringify(data: GqlRecord, addComma = false): string {
    if (!data) return '';

    let output = '';
    Object.keys(data).map(
      (k) => (output += `${k}: "${data[k] as string}" ${addComma ? ', ' : ''}`)
    );
    return output;
  }

  //#endregion

  //#region FETCH

  /**
   * Fetch all rows from a table and place in a store. The query can be executed asynchronously and the store busy flag will indicate when the query has completed.
   *
   * @param store Pinia store
   * @param translate Optionally translate to locale and expand tokens
   * @param limit Limit the number of records returned
   * @returns Data records which were also placed into the store
   */
  async FetchAll(
    store: any,
    translate: boolean | undefined,
    limit: number | undefined = undefined
  ): Promise<GqlRecords> {
    //console.log('>> FetchAll')
    store.SetBusy(true);

    const doc = this.BuildQuery(undefined, undefined, undefined, limit);

    const r = await Query.Apollo.query(doc).catch((e) => {
      //console.log('<< EXCEPTION! FetchAll')

      throw `FetchAll - Exception ${e as string}`;
    });

    this.SetRows(r, store, translate ?? this._auto_translate);

    store.SetBusy(false);
    store.SetLoaded(store.Rows.length > 0);

    //console.log('<< FetchAll')

    return store.Rows;
  }

  /**
   * Fetch records
   *
   * @param where A GQL where clause which is automatically wrapped in an outer container, e.g. where: { where_clause }
   * @param fetch_mode Option
   * @param store
   * @param translate
   * @param orderBy
   * @param limit
   * @returns
   */
  async FetchWhere(
    where: string | undefined,
    fetch_mode: fetchMode | undefined,
    store: any,
    translate: boolean | undefined,
    orderBy: string | undefined = undefined,
    limit: number | undefined = undefined
  ): Promise<GqlRecords> {
    //console.log('>> FetchWhere')

    // Optionally use the previous where clause and fetch mode
    // This is useful when calling FetchPrevious to repeat excution of a previous query
    if (!where) where = this._where;
    if (!fetch_mode) fetch_mode = this._fetch_mode;

    store.SetBusy(true);
    const doc = this.BuildQuery(where, fetch_mode, orderBy, limit);

    const r = await Query.Apollo.query(doc).catch((e) => {
      throw `FetchWhere - Exception ${e as string}`;
    });

    this.SetRows(r, store, translate ?? this._auto_translate);

    this._where = where;
    this._fetch_mode = fetch_mode;

    store.SetBusy(false);
    store.SetLoaded(store.Rows.length > 0);

    //console.log('<< FetchWhere')

    return store.Rows;
  }

  /**
   * Fetch a single record by its unique ID
   *
   * @param id Unique ID of the record
   * @param fetch_mode Fetch mode
   * @param store Pinia Store
   * @param translate Optionally trigger translation
   * @returns Data record, with optional translations and token expansion
   */
  async FetchById(
    id: string,
    fetch_mode = defaultFetchMode,
    store: any,
    translate = true
  ): Promise<GqlRecord> {
    //console.log('>> FetchById')

    store.SetBusy(true);

    const entityStack: string[] = [];
    const query_name = `${this.Schema.EntityName}_by_pk`;

    const query = `{
			${query_name} (${this.Schema.Key}: "${id}")
			{
				${this.Schema.Columns(fetch_mode, entityStack)}
			}
		}
		`;

    const doc = { query: gql(query) };

    const r = await Query.Apollo.query(doc).catch((e) => {
      throw `FetchById - Exception ${e as string}`;
    });

    const raw_record = r.data[query_name] as GqlRecord;
    const record = this.ProcessRow(raw_record, translate);

    if (record) {
      store.CurrentRecord = record;
      store.SetLoaded(true);
    } else {
      store.CurrentRecord = {};
      store.SetLoaded(false);
    }

    store.SetBusy(false);

    //console.log('<< FetchById')

    return store.CurrentRecord;
  }

  /**
   * Repeat the previous fetch query using the stored where clause and fetch mode. It is is inferred that the method will automatically
   * use the previous sort column and limit the record count
   *
   * @param store Pinia store
   */
  async FetchPrevious(store: any): Promise<void> {
    //console.log('>> FetchPrevious')

    await this.FetchWhere(
      this._where,
      this._fetch_mode,
      store,
      true,
      this._sort_by,
      this.Limit
    );

    store.SetBusy(false);
    store.SetLoaded(store.Rows.length > 0);

    //console.log('<< FetchPrevious')
  }

  //#endregion

  //#region Insert, Update, Delete

  async Insert(
    data: GqlRecord,
    fetch_mode = defaultFetchMode,
    store: any
  ): Promise<GqlRecord> {
    data = this.PrepareRowForSave(data);

    // The user can not set the ID of an entity.
    // For enums, the ID is always the name
    if (this.Schema.IsEnum) data['id'] = data['name'];

    const mutation_name = `insert_${this.Schema.EntityName}`;
    const doc = `
            mutation {
                ${mutation_name} (
                    objects: [{ ${this.Stringify(data)} }]
                ) {
                    returning { ${this.Schema.Key}}
                }
            }`;

    const r: GqlRecord = await this.ExecuteMutation(doc, 'insert', store);
    const id = JsonTools.ExtractFromPath<string>(r, [
      'data',
      mutation_name,
      'returning',
      0,
      this.Schema.Key,
    ]);

    store.CurrentRecord = await this.FetchById(id, fetch_mode, store);
    store.SetBusy(false);

    return store.CurrentRecord;
  }

  // If id is missing, handle as an insert, else do an update
  async Update(data: GqlRecord, store: any): Promise<GqlRecord> {
    const id = data[this.Schema.Key] as string;
    if (!id)
      throw `Unable to get primary key from ${this.Schema.EntityName}:${this.Schema.Key} = "${id}"`;

    data = this.PrepareRowForSave(data);

    // Remove the primary key so that the mutation does not attempt to update it
    delete data[this.Schema.Key];

    let keys = '';
    Object.keys(data).map((k) => (keys += `${k} `));

    const mutation_name = `update_${this.Schema.EntityName}_by_pk`;
    const doc = `
            mutation {
                ${mutation_name} (
                    pk_columns: {
                        ${this.Schema.Key}: "${id}"
                        }, 
                    _set: {
                        ${this.Stringify(data, true)}
                        }
                    ) 
                    { ${this.Schema.Key} ${keys} }
            }`;

    const r = await this.ExecuteMutation(doc, 'update', store);

    store.SetBusy(false);
    store.SetLoaded(true);

    return r;
  }

  async DeleteById(id: string, store: any): Promise<GqlRecord> {
    if (!id)
      throw `Unable to get primary key from ${this.Schema.EntityName}:${this.Schema.Key}`;

    const mutation = `delete_${this.Schema.EntityName}_by_pk(${this.Schema.Key}: "${id}")`;
    const doc = `
            mutation {
            	${mutation} { ${this.Schema.Key} }
            }`;

    const res = await this.ExecuteMutation(doc, 'delete_id', store);

    store.CurrentRecord = {};
    store.SetBusy(false);
    store.SetLoaded(false);

    return res;
  }

  async DeleteWhere(where: string, store: any): Promise<GqlRecord> {
    const mutation_name = `delete_${this.Schema.EntityName}`;
    const doc = `
            mutation delete_${this.Schema.EntityName}_where {
            ${mutation_name} (where: { ${where} }
            ) {
                returning { ${this.Schema.Key} }
            }
        }`;

    const res = await this.ExecuteMutation(doc, 'delete_multi', store);

    store.CurrentRecord = {};
    store.SetBusy(false);
    store.SetLoaded(false);

    return res;
  }

  private async ExecuteMutation(
    mutation: string,
    operation: string,
    store: any
  ): Promise<GqlRecord> {
    //console.log('>> ExecuteMutation')

    // console.log('**** mutate input: ' + mutation);

    const doc = { mutation: gql(mutation) };
    store.SetBusy(true);

    const r = await Query.Apollo.mutate(doc).catch((e) => {
      throw `doMutation - Exception ${e as string}`;
    });

    //console.log('**** mutate output: ' + JSON.stringify(r));

    void this.FetchPrevious(store);

    //console.log('<< ExecuteMutation')

    return r as GqlRecord;
  }

  //#endregion
}
