import {
	type INanoServiceResponse,
	NanoService,
	NanoServiceResponse,
} from "@nanoservice-ts/runner";
import { type Context, GlobalError } from "@nanoservice-ts/shared";

/**
 * Input schema for database configuration
 */
type DatabaseConfigInput = {
	/** Optional database name override */
	database_name?: string;
	/** Optional host override */
	host_override?: string;
	/** Optional port override */
	port_override?: number;
	/** Connection validation flag */
	validate_connection?: boolean;
};

/**
 * Database configuration output
 */
type DatabaseConfig = {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
	ssl?: boolean;
};

/**
 * DatabaseConfigNode - Dynamic database configuration without hardcoding
 * 
 * This node replaces hardcoded database credentials with environment-based configuration.
 * Perfect for tutorial demonstrations and production deployments.
 * 
 * Environment Variables Required:
 * - DB_HOST: Database host (default: localhost)
 * - DB_PORT: Database port (default: 5432)
 * - DB_NAME: Database name (default: analytics_demo)
 * - DB_USER: Database username (default: postgres)
 * - DB_PASSWORD: Database password (required)
 * - DB_SSL: Enable SSL (default: false)
 */
export default class DatabaseConfigNode extends NanoService<DatabaseConfigInput> {
	constructor() {
		super();

		// Input validation schema - all parameters are optional for flexibility
		this.inputSchema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				database_name: { 
					type: "string", 
					description: "Override default database name" 
				},
				host_override: { 
					type: "string", 
					description: "Override default database host" 
				},
				port_override: { 
					type: "number", 
					description: "Override default database port" 
				},
				validate_connection: { 
					type: "boolean", 
					description: "Test database connectivity" 
				}
			},
			required: [] // All inputs are optional for maximum flexibility
		};

		// Output schema - standardized database configuration
		this.outputSchema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				host: { type: "string" },
				port: { type: "number" },
				database: { type: "string" },
				user: { type: "string" },
				password: { type: "string" },
				ssl: { type: "boolean" }
			},
			required: ["host", "port", "database", "user", "password"]
		};
	}

	async handle(ctx: Context, inputs: DatabaseConfigInput): Promise<INanoServiceResponse> {
		const response: NanoServiceResponse = new NanoServiceResponse();

		try {
			// Build database configuration from environment variables
			// This replaces ALL hardcoded database credentials from db-manager.json
			const config: DatabaseConfig = {
				host: inputs.host_override || process.env.DB_HOST || "localhost",
				port: inputs.port_override || parseInt(process.env.DB_PORT || "5432"),
				database: inputs.database_name || process.env.DB_NAME || "analytics_demo",
				user: process.env.DB_USER || "postgres",
				password: process.env.DB_PASSWORD || "",
				ssl: process.env.DB_SSL === "true"
			};

			// Validate required configuration
			if (!config.password) {
				throw new Error(
					"Database password is required. Please set DB_PASSWORD environment variable."
				);
			}

			// Optional connection validation
			if (inputs.validate_connection) {
				await this.validateDatabaseConnection(config);
			}

			// Store configuration in context for use by other nodes
			if (!ctx.vars) ctx.vars = {};
			ctx.vars.database_config = config as any;

			response.setSuccess({
				...config,
				// Don't expose password in response for security
				password: "***CONFIGURED***"
			});

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
	 * Validates database connection without exposing credentials
	 */
	private async validateDatabaseConnection(config: DatabaseConfig): Promise<void> {
		try {
			// We'll implement actual connection testing here
			// For now, just validate the configuration structure
			const requiredFields = ['host', 'port', 'database', 'user', 'password'];
			
			for (const field of requiredFields) {
				if (!config[field as keyof DatabaseConfig]) {
					throw new Error(`Database configuration missing required field: ${field}`);
				}
			}

			// TODO: Add actual pg.Client connection test when needed
			console.log(`✅ Database configuration validated for ${config.database}@${config.host}:${config.port}`);
			
		} catch (error) {
			throw new Error(`Database connection validation failed: ${(error as Error).message}`);
		}
	}
} 