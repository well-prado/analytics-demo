import {
	type INanoServiceResponse,
	type JsonLikeObject,
	NanoService,
	NanoServiceResponse,
} from "@nanoservice-ts/runner";
import { type Context, GlobalError } from "@nanoservice-ts/shared";
import pg from "pg";

type PostgresAnalyticsInputs = {
	user: string;
	password: string;
	host: string;
	port?: number;
	database: string;
	query: string;
	parameters?: any[];
	set_var?: boolean;
};

type Table = {
	total: number;
	data: unknown[];
};

/**
 * PostgresAnalyticsQuery - Dynamic PostgreSQL query node for analytics
 * 
 * This node extends the basic postgres-query functionality to support:
 * - Dynamic database name (not hardcoded)
 * - Configurable port
 * - Analytics-specific optimizations
 * 
 * Perfect for tutorial scenarios where database configuration needs to be flexible.
 */
export default class PostgresAnalyticsQuery extends NanoService<PostgresAnalyticsInputs> {
	constructor() {
		super();

		// Input schema with database parameter support
		this.inputSchema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				user: { 
					type: "string",
					description: "Database username" 
				},
				password: { 
					type: "string",
					description: "Database password" 
				},
				host: { 
					type: "string",
					description: "Database host" 
				},
				port: { 
					type: "number",
					description: "Database port (default: 5432)" 
				},
				database: { 
					type: "string",
					description: "Database name" 
				},
				query: { 
					type: "string",
					description: "SQL query to execute" 
				},
				parameters: { 
					type: "array",
					description: "Query parameters for parameterized queries (optional)" 
				},
				set_var: { 
					type: "boolean",
					description: "Store result in context variables" 
				},
			},
			required: ["user", "password", "host", "database", "query"],
		};

		// Output schema
		this.outputSchema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				total: { type: "number" },
				data: { type: "array" }
			}
		};
	}

	async handle(ctx: Context, inputs: PostgresAnalyticsInputs): Promise<INanoServiceResponse> {
		const response: NanoServiceResponse = new NanoServiceResponse();

		try {
			const { Client } = pg;
			
			// Create client with dynamic configuration
			const client = new Client({
				user: inputs.user,
				password: inputs.password,
				host: inputs.host,
				port: inputs.port || 5432,
				database: inputs.database, // Dynamic database name!
			});

			// Connect and execute query
			await client.connect();
			const result = inputs.parameters && inputs.parameters.length > 0 
				? await client.query(inputs.query, inputs.parameters)
				: await client.query(inputs.query);
			await client.end();

			// Format response
			if (Array.isArray(result)) {
				const tables: Table[] = [];

				for (let i = 0; i < result.length; i++) {
					const data = result[i];
					const table: Table = {
						total: data.rows.length,
						data: [...data.rows],
					};
					tables.push(table);
				}

				response.setSuccess(tables as unknown as JsonLikeObject);
			} else {
				const responseData = {
					total: result.rowCount as number,
					data: result.rows,
				};

				// Store in context variables if requested
				if (inputs.set_var) {
					if (!ctx.vars) ctx.vars = {};
					ctx.vars[this.name] = responseData as any;
				}

				response.setSuccess(responseData);
			}

		} catch (error: unknown) {
			let message = (error as Error).message;
			if (error instanceof AggregateError) {
				message = (error as AggregateError).errors[0];
			}
			
			const nodeError: GlobalError = new GlobalError(message);
			nodeError.setCode(500);
			nodeError.setStack((error as Error).stack);
			nodeError.setName(this.name);
			
			response.setError(nodeError);
		}

		return response;
	}
} 