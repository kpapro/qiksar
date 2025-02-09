import EntityField, {
  hiddenFieldOptions,
  defaultIntFieldOptions,
} from './EntityField';
import fieldOptions from './fieldOptions';
import IFieldDefinition from './IFieldDefinition';
import { GqlRecord } from './GqlTypes';
import Query, { defaultFetchMode } from './Query';
import fetchMode from './fetchMode';
import IFetchDefinition from './IFetchDefinition';
import IFlattenDefinition from './IFlattenDefinition';
import IUseEnumDefinition from './IUseEnumDefinition';
import IEnumDefinition from './IEnumDefinition';
import ICreateSchemaDefinition from './ICreateSchemaDefinition';

/**
 * Describes the structure of a GraphQL object, including its fields, field types and relationships to other GraphQL objects.
 */
export default class EntitySchema {
  //#region Properties

  private _description: string;
  private _entityType: string;
  private _fields: Array<EntityField>;
  private _key: string;
  private _is_enum: boolean;
  private _includes: IFetchDefinition[];
  private _transformers: Record<string, GqlRecord>;

  //#endregion

  //#region Static members

  /**
   * Internal array of schema
   */
  private static _schemas: Array<EntitySchema> = [];

  /**
   * Global list of registered schemas
   */
  static get Schemas(): Array<EntitySchema> {
    return this._schemas;
  }

  //#endregion

  //#region Transformation

  CreateTransform(name: string, transform: GqlRecord): EntitySchema {
    this._transformers[name] = transform;

    return this;
  }

  GetTransform(name: string): GqlRecord {
    const transform = this._transformers[name];

    if (!transform) throw `Transform '${name}' has not be registered`;

    return transform;
  }

  //#endregion

  //#region Getters / Setters

  /**
   * Default caption applied when the schema is displayed
   */
  get Label(): string {
    return this._description;
  }

  /**
   * Name of the entity
   */
  get EntityName(): string {
    return this._entityType;
  }

  /**
   * List of fields
   */
  get Fields(): EntityField[] {
    return this._fields;
  }

  /**
   * Name of unique key field
   */
  get Key(): string {
    return this._key;
  }

  /**
   * Indicates if the schema is an enumeration
   */
  get IsEnum(): boolean {
    return this._is_enum;
  }

  get LocaleFields(): EntityField[] {
    return this._fields.filter((f) => f.IsLocale);
  }

  //#endregion

  /**
   * Construct new object
   *
   * @param entityName Unique name for the schema
   * @param keyField Name of the field which is the unique database ID
   * @param label Default label
   * @param isEnum Indicates if the table is an enumeration type, which enables it to be quickly used for dropdown selections
   */
  constructor(
    entityName: string,
    keyField: string,
    label: string,
    isEnum = false
  ) {
    this._entityType = entityName.toLowerCase();
    this._key = keyField;
    this._description = label;
    this._fields = new Array<EntityField>();
    this._is_enum = isEnum;
    this._includes = [];
    this._transformers = {};
  }

  /**
   * Resolve references between schema
   */
  static ResolveReferences(): void {
    this._schemas.map((s) => s.ResolveConnections());
  }

  /**
   * Get the schema for a specified entity
   * @param entityName Name of the entity
   * @returns The schema, or null if the schema does not exist
   */
  static GetSchemaForEntity(entityName: string): EntitySchema | null {
    entityName = entityName.toLowerCase();

    const schemas = this._schemas.filter(
      (s: EntitySchema) => s.EntityName === entityName
    );

    return schemas.length > 0 ? schemas[0] : null;
  }

  /**
   * Create a schema
   *
   * @param definition Create schema details
   * @returns Schema
   */
  static Create(definition: ICreateSchemaDefinition): EntitySchema {
    const entityName = definition.entityName.toLowerCase();

    const schema: EntitySchema = new EntitySchema(
      entityName,
      definition.keyField,
      definition.label ?? entityName
    );

    if (this.GetSchemaForEntity(entityName))
      throw `ERROR: Schema has already been registered for entity type${schema.EntityName}`;

    this._schemas.push(schema);

    return schema.SetKey(definition.keyField);
  }

  /**
   * Create a schema for an enumeration
   *
   * @param entityName Name of the entity type
   * @param label Default label
   * @returns Schema
   */
  static CreateEnum(definition: IEnumDefinition): EntitySchema {
    const key = 'id';
    const entityName = definition.entityName.toLowerCase();

    const schema: EntitySchema = new EntitySchema(
      entityName,
      key,
      definition.label ?? entityName,
      true
    );

    if (this.GetSchemaForEntity(entityName))
      throw `!!!! FATAL ERROR: Schema has already been registered for entity type${schema.EntityName}`;

    this._schemas.push(schema);

    return schema
      .SetKey(key, ['sortable'])
      .AddField({ column: 'name', label: 'Label' })
      .AddField({ column: 'comment', label: 'Description' })
      .CreateTransform('selector', {
        id: 'id',
        label: 'name',
        comment: 'comment',
      });
  }

  /**
   * Get columns, including from nested entities, to support building of a GraphQL query
   *
   * @param fetch_mode Fetch mode enables easy filtering of columns to prevent overfetch
   * @param entityStack Track entities as columns added to the output
   * @returns Text representation of columns to be included in GraphQL query
   */
  Columns(fetch_mode: fetchMode, entityStack: string[]): string {
    let columns = '';
    let fields = this.Fields;

    switch (fetch_mode) {
      case 'grid':
        fields = fields.filter((f) => f.IsKey || f.IsOnGrid);
        break;

      case 'light':
        fields = fields.filter((f) => f.IsKey || !f.IsHeavy);
        break;

      case 'heavy':
        // all fields are returned
        break;
    }

    fields.map((f) => (columns += this.FieldToGql(f, entityStack) + ' '));

    return columns;
  }

  /**
   * Return GraphQL fragment representing a field in a query
   *
   * @param field Field definition
   * @param entityStack Track entities being processed to form the GraphQL statement for the field
   * @returns Text representation of the field as a GraphQL fragment
   */
  FieldToGql(field: EntityField, entityStack: string[]): string {
    if ('arr obj alias'.indexOf(field.Type) == -1) return field.Name;

    if (
      (field.Type == 'arr' || field.Type == 'obj') &&
      entityStack.filter((e) => e === field.ObjectName).length == 0
    ) {
      return this.RelatedObjectToGql(field, entityStack);
    }

    return '';
  }

  /**
   * Return GraphQL fragment representing a related GraphQL object
   *
   * @param field Field definition
   * @param entityStack Track entities being processed to form the GraphQL statement for the field
   * @returns Text representation of the field as a GraphQL fragment
   */
  RelatedObjectToGql(field: EntityField, entityStack: string[]): string {
    if (!field.ObjectSchema)
      throw `Schema reference is missing on ${this.EntityName}.${field.Name}`;

    if (!field.ObjectName)
      throw `Fieldname of object must be specified on field ${JSON.stringify(
        field
      )}`;

    let field_definition = null;

    entityStack.push(field.ObjectSchema);

    const refSchema = EntitySchema.GetSchemaForEntity(field.ObjectSchema);

    if (!refSchema)
      throw `!!!! FATAL ERROR: Entity ${this.EntityName} references unknown schema ${field.ObjectName}`;

    // when a referenced object is required the object's key is required in addition to the object
    // and it's nominated fields. e.g. role_id role {name comment}
    // role_id can then be edited in the UI and updated
    const related_object_key = field.KeyColumnName ?? '';
    // fetch only the nominated columns, or if none are nominated, fetch all
    if (field.ObjectColumns)
      field_definition = `${related_object_key} ${field.ObjectName} { ${field.ObjectColumns} }`;
    else
      field_definition = `${related_object_key} ${
        field.ObjectName
      } { ${refSchema.Columns(defaultFetchMode, entityStack)} }`;

    const index = entityStack.indexOf(field.ObjectName);

    if (index > 0) entityStack.splice(index, 1);

    return field_definition;
  }

  /**
   * Add a field definition to the schema
   * @param fieldDefinition Field definition
   * @returns The schema for fluent API style calls
   */
  AddField(fieldDefinition: IFieldDefinition): EntitySchema {
    this._fields.push(new EntityField(fieldDefinition));
    return this;
  }

  /**
   * Set the unique ID field for the schema
   * @param fieldName Name of the key field
   * @param fo Field options
   * @returns The schema for fluent API style calls
   */
  private SetKey(
    fieldName: string,
    fo: fieldOptions[] = hiddenFieldOptions
  ): EntitySchema {
    this._key = fieldName;
    
    return this.AddField({
      column: fieldName,
      label: 'ID',
      type: 'id',
      options: fo,
    });
  }

  /**
   * Connect another schema as an Enumeration
   *
   * @param schemaName Name of the schema
   * @param source_id_column Key field on the parent which connects to the child record ID
   * @param preferred_join_name The field name on the parent used to refer to the enumeration
   * @returns The schema for fluent API style calls
   */
  UseEnum(definition: IUseEnumDefinition): EntitySchema {
    const view = Query.GetView(definition.schemaName);
    const entity_type = view.Schema.EntityName;
    const label = definition.label ?? view.Schema.Label;

    return this.Fetch({
      label: definition.label ?? view.Schema.Label,
      target_schema: entity_type,
      source_key: definition.source_id_column,
      source_object: definition.preferred_join_name,
      columns: 'id name comment',
    }).Flatten({
      field_paths: `${definition.preferred_join_name}.name`,
      label: label,
      options: defaultIntFieldOptions,
      column_name: entity_type
    });
  }

  /**
   * Fetch a related record, so that fields can be imported into the parent record, as though they were columns in the same table
   *
   * @param schemaName Name of the child schema
   * @param key_column_name Name of key field on the parent that specifies the ID of the child record
   * @param ref_column_name Name of the child record to fetch
   * @param required_columns List of columns to fetch from the child
   * @returns The schema for fluent API style calls
   */
  Fetch(include: IFetchDefinition): EntitySchema {
    this._includes.push(include);

    return this;
  }

  /**
   * Resolve connections between this schema and others
   */
  private ResolveConnections() {
    this._includes.map((i: IFetchDefinition) => {

      const view = Query.GetView(i.target_schema);

      const fieldDefinition = {
        label: i.label ?? view.Schema.Label,
        column: i.target_schema,
        type: 'obj',
        options: ['ongrid', 'EntityEditSelect'],
        object_schema: i.target_schema,
        key_column_name: i.source_key,
        ref_column_name: i.columns,
        schema: i.target_schema,
        object_name: i.source_object,
        object_columns: i.columns,
      } as IFieldDefinition;

      this.AddField(fieldDefinition);
    });
  }

  /**
   * TODO - review the purpose and functionality of this method
   * Add a relationship to a child schema, where there are multiple records at the child end
   *
   * @param schemaName Name of the child schema
   * @param ref_type Name of the field on the parent used to refer to the child schema
   * @param ref_columns Columns fetched from the child object
   * @returns The schema for fluent API style calls
   */
  AddArray(
    schemaName: string,
    ref_type: string,
    ref_columns: string
  ): EntitySchema {
    const view = Query.GetView(schemaName);

    const def = {
      column: schemaName,
      label: view.Schema.Label,
      type: 'arr',
      object_schema: ref_type,
      object_columns: ref_columns,
    } as IFieldDefinition;

    return this.AddField(def);
  }

  /**
   * Merge columns into the current object from child objects
   *
   * @param definition Definition of the columns to merge in from the source object
   * @returns The schema for fluent API style calls
   */
  Flatten(definition: IFlattenDefinition): EntitySchema {

    const def = {
      label: definition.label,
      column: definition.column_name,
      type: 'alias',
      object_columns: definition.field_paths,
      options: definition.options,
    } as IFieldDefinition;

    return this.AddField(def);
  }
}
