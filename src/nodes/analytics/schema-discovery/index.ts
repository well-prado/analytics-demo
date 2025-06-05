import {
	type INanoServiceResponse,
	NanoService,
	NanoServiceResponse,
} from "@nanoservice-ts/runner";
import { type Context, GlobalError } from "@nanoservice-ts/shared";
import * as pg from "pg";

/**
 * Input schema for schema discovery
 */
type SchemaDiscoveryInput = {
	/** Optional schema name filter (default: 'public') */
	schema_name?: string;
	/** Include table relationships */
	include_relationships?: boolean;
	/** Include column statistics */
	include_statistics?: boolean;
};

/**
 * Database column information
 */
type ColumnInfo = {
	column_name: string;
	data_type: string;
	is_nullable: boolean;
	column_default: string | null;
	is_primary_key: boolean;
	character_maximum_length?: number;
};

/**
 * Database table information
 */
type TableInfo = {
	table_name: string;
	table_type: string;
	columns: ColumnInfo[];
	row_count?: number;
};

/**
 * Complete database schema information
 */
type DatabaseSchema = {
	schema_name: string;
	tables: TableInfo[];
	total_tables: number;
	discovery_timestamp: string;
};

/**
 * SchemaDiscoveryNode - Dynamic database schema detection
 * 
 * This node automatically discovers database structure without hardcoding.
 * It replaces static table/column references with dynamic schema detection.
 * 
 * Features:
 * - Auto-detects all tables and columns
 * - Identifies primary keys and data types
 * - Works with any PostgreSQL database schema
 * - Provides metadata for intelligent query generation
 */
export default class SchemaDiscoveryNode extends NanoService<SchemaDiscoveryInput> {
	constructor() {
		super();

		// Input validation schema
		this.inputSchema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				schema_name: { 
					type: "string", 
					description: "Database schema to analyze (default: public)" 
				},
				include_relationships: { 
					type: "boolean", 
					description: "Include foreign key relationships" 
				},
				include_statistics: { 
					type: "boolean", 
					description: "Include table row counts and column statistics" 
				}
			},
			required: []
		};

		// Output schema
		this.outputSchema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				schema_name: { type: "string" },
				tables: {
					type: "array",
					items: {
						type: "object",
						properties: {
							table_name: { type: "string" },
							table_type: { type: "string" },
							columns: { type: "array" },
							row_count: { type: "number" }
						}
					}
				},
				total_tables: { type: "number" },
				discovery_timestamp: { type: "string" }
			},
			required: ["schema_name", "tables", "total_tables", "discovery_timestamp"]
		};
	}

	async handle(ctx: Context, inputs: SchemaDiscoveryInput): Promise<INanoServiceResponse> {
		const response: NanoServiceResponse = new NanoServiceResponse();

		try {
			// Get database configuration from previous node
			const dbConfig = ctx.vars?.database_config;
			if (!dbConfig) {
				throw new Error(
					"Database configuration not found. Please run database-config node first."
				);
			}

			// Set default schema name
			const schemaName = inputs.schema_name || "public";

			// Discover database schema
			const schema = await this.discoverDatabaseSchema(
				dbConfig,
				schemaName,
				inputs.include_relationships || false,
				inputs.include_statistics || false
			);

			// Store schema in context for other nodes
			if (!ctx.vars) ctx.vars = {};
			ctx.vars.database_schema = schema as any;

			response.setSuccess(schema as any);

		} catch (error: unknown) {
			const nodeError = new GlobalError((error as Error).message);
			nodeError.setCode(500);
			nodeError.setStack((error as Error).stack);
			nodeError.setName(this.name);
			response.setError(nodeError);
		}

		return response;
	}

	/**
	 * Discovers complete database schema information
	 */
	private async discoverDatabaseSchema(
		dbConfig: any,
		schemaName: string,
		includeRelationships: boolean,
		includeStatistics: boolean
	): Promise<DatabaseSchema> {
		const { Client } = pg;
		const client = new Client(dbConfig);

		try {
			await client.connect();

			// Get all tables in the schema
			const tables = await this.getTables(client, schemaName);
			
			// Get detailed information for each table
			const tableInfos: TableInfo[] = [];
			
			for (const table of tables) {
				const columns = await this.getTableColumns(client, schemaName, table.table_name);
				
				const tableInfo: TableInfo = {
					table_name: table.table_name,
					table_type: table.table_type,
					columns
				};

				// Optionally include row count statistics
				if (includeStatistics) {
					tableInfo.row_count = await this.getTableRowCount(client, schemaName, table.table_name);
				}

				tableInfos.push(tableInfo);
			}

			await client.end();

			return {
				schema_name: schemaName,
				tables: tableInfos,
				total_tables: tableInfos.length,
				discovery_timestamp: new Date().toISOString()
			};

		} catch (error) {
			await client.end();
			throw new Error(`Schema discovery failed: ${(error as Error).message}`);
		}
	}

	/**
	 * Gets all tables in the specified schema
	 */
	private async getTables(client: pg.Client, schemaName: string): Promise<Array<{table_name: string, table_type: string}>> {
		const query = `
			SELECT table_name, table_type
			FROM information_schema.tables
			WHERE table_schema = $1
			ORDER BY table_name;
		`;
		
		const result = await client.query(query, [schemaName]);
		return result.rows;
	}

	/**
	 * Gets detailed column information for a specific table
	 */
	private async getTableColumns(client: pg.Client, schemaName: string, tableName: string): Promise<ColumnInfo[]> {
		const query = `
			SELECT 
				c.column_name,
				c.data_type,
				c.is_nullable::boolean,
				c.column_default,
				c.character_maximum_length,
				CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
			FROM information_schema.columns c
			LEFT JOIN (
				SELECT a.attname as column_name
				FROM pg_index i
				JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
				WHERE i.indrelid = $1::regclass AND i.indisprimary
			) pk ON c.column_name = pk.column_name
			WHERE c.table_schema = $2 AND c.table_name = $3
			ORDER BY c.ordinal_position;
		`;

		const result = await client.query(query, [`${schemaName}.${tableName}`, schemaName, tableName]);
		
		return result.rows.map(row => ({
			column_name: row.column_name,
			data_type: row.data_type,
			is_nullable: row.is_nullable === 'YES',
			column_default: row.column_default,
			is_primary_key: row.is_primary_key,
			character_maximum_length: row.character_maximum_length
		}));
	}

	/**
	 * Gets row count for a specific table (optional statistics)
	 */
	private async getTableRowCount(client: pg.Client, schemaName: string, tableName: string): Promise<number> {
		try {
			const query = `SELECT COUNT(*) as count FROM ${schemaName}.${tableName};`;
			const result = await client.query(query);
			return parseInt(result.rows[0].count);
		} catch (error) {
			// Return 0 if unable to get count (e.g., permissions issues)
			return 0;
		}
	}
} 